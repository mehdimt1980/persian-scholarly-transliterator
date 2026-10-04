import fs from 'node:fs';
import path from 'node:path';

export type ReauditBatch = 'A' | 'B' | 'C' | 'D' | 'E';

export interface AcquisitionCandidateMinimal {
  id: string;
  sourceText: string;
  category: string;
  proposedProfile?: string;
  profile?: string;
  [key: string]: unknown;
}

export interface ReauditWorklistCase {
  id: string;
  sourceText: string;
  category: string;
  profile: string;
  batch: ReauditBatch;
  reviewState: 'PENDING' | 'IN_REVIEW' | 'COMPLETED';
  decision: unknown;
  [key: string]: unknown;
}

export interface ReauditWorklistDocument {
  metadata: {
    schemaVersion: number;
    artifactType: string;
    sourceCorpus: string;
    sourceCorpusCount: number;
    status: string;
    engineEvaluationPerformed: boolean;
    humanSignoff: unknown;
    priorAdjudicationAuthority: string;
    [key: string]: unknown;
  };
  summary: {
    total: number;
    pending: number;
    adjudicated: number;
    byBatch: Record<string, number>;
    byCategory: Record<string, number>;
    [key: string]: unknown;
  };
  cases: ReauditWorklistCase[];
}

export const PROHIBITED_WORKLIST_CASE_FIELDS = [
  'canonical',
  'allowedCanonicals',
  'priorCanonical',
  'priorAllowedCanonicals',
  'engineOutput',
  'runtimeOutput',
  'renderingClass',
  'reviewNote',
  'amendmentFrom',
  'amendmentTo'
];

export function getExpectedReauditBatch(category: string): ReauditBatch {
  switch (category) {
    case 'TERM':
    case 'RELIGIOUS_TERM':
      return 'A';
    case 'COMPOUND':
    case 'MORPHOLOGY':
    case 'IZAFAT':
      return 'B';
    case 'PERSON':
    case 'PLACE':
    case 'INSTITUTION':
      return 'C';
    case 'BOOK_TITLE':
      return 'D';
    case 'AMBIGUITY':
      return 'E';
    default:
      throw new Error(`UNKNOWN_REAUDIT_CATEGORY:${category}`);
  }
}

/**
 * Validates the blank V2 re-audit worklist against the acquired candidate corpus
 * and enforces anti-anchoring, engine-blindness, and governance invariants.
 *
 * NOTE: This validator strictly contains NO transliteration or engine calls.
 */
export function validateReauditWorklist(
  worklist: ReauditWorklistDocument,
  acquisitionCandidates: AcquisitionCandidateMinimal[]
): void {
  // 1. Metadata Invariants
  if (worklist.metadata.schemaVersion !== 2) {
    throw new Error(`WORKLIST_SCHEMA_VERSION_INVALID:${worklist.metadata.schemaVersion}`);
  }

  if (worklist.metadata.artifactType !== 'BLIND_REAUDIT_WORKLIST') {
    throw new Error(`WORKLIST_ARTIFACT_TYPE_INVALID:${worklist.metadata.artifactType}`);
  }

  if (worklist.metadata.engineEvaluationPerformed !== false) {
    throw new Error('WORKLIST_ENGINE_EVALUATION_MUST_BE_FALSE');
  }

  if (worklist.metadata.humanSignoff !== null) {
    throw new Error('WORKLIST_HUMAN_SIGNOFF_MUST_BE_NULL');
  }

  if (worklist.metadata.status !== 'READY_FOR_BLIND_REAUDIT') {
    throw new Error(`WORKLIST_STATUS_INVALID:${worklist.metadata.status}`);
  }

  if (worklist.metadata.sourceCorpusCount !== 108) {
    throw new Error(`WORKLIST_SOURCE_CORPUS_COUNT_MISMATCH:${worklist.metadata.sourceCorpusCount}`);
  }

  // 2. Case count & unique IDs
  if (worklist.cases.length !== 108) {
    throw new Error(`WORKLIST_CASE_COUNT_MISMATCH:${worklist.cases.length}`);
  }

  if (acquisitionCandidates.length !== 108) {
    throw new Error(`ACQUISITION_CANDIDATE_COUNT_MISMATCH:${acquisitionCandidates.length}`);
  }

  const seenIds = new Set<string>();
  for (const c of worklist.cases) {
    if (seenIds.has(c.id)) {
      throw new Error(`WORKLIST_DUPLICATE_CASE_ID:${c.id}`);
    }
    seenIds.add(c.id);
  }

  // 3. One-to-one alignment with acquisition candidates
  const acqMap = new Map<string, AcquisitionCandidateMinimal>();
  for (const acq of acquisitionCandidates) {
    acqMap.set(acq.id, acq);
  }

  for (const c of worklist.cases) {
    const acq = acqMap.get(c.id);
    if (!acq) {
      throw new Error(`WORKLIST_CASE_NOT_IN_ACQUISITION:${c.id}`);
    }

    if (c.sourceText !== acq.sourceText) {
      throw new Error(
        `WORKLIST_SOURCETEXT_MISMATCH:${c.id}: worklist="${c.sourceText}" vs acq="${acq.sourceText}"`
      );
    }

    if (c.category !== acq.category) {
      throw new Error(
        `WORKLIST_CATEGORY_MISMATCH:${c.id}: worklist="${c.category}" vs acq="${acq.category}"`
      );
    }

    const expectedProfile = acq.proposedProfile ?? acq.profile;
    if (c.profile !== expectedProfile) {
      throw new Error(
        `WORKLIST_PROFILE_MISMATCH:${c.id}: worklist="${c.profile}" vs acq="${expectedProfile}"`
      );
    }

    const expectedBatch = getExpectedReauditBatch(c.category);
    if (c.batch !== expectedBatch) {
      throw new Error(
        `WORKLIST_BATCH_MISMATCH:${c.id}: case has batch="${c.batch}" but expected="${expectedBatch}"`
      );
    }

    // 4. Initial blank state requirements
    if (c.reviewState !== 'PENDING') {
      throw new Error(`WORKLIST_CASE_NOT_PENDING:${c.id}: reviewState="${c.reviewState}"`);
    }

    if (c.decision !== null) {
      throw new Error(`WORKLIST_CASE_HAS_NON_NULL_DECISION:${c.id}`);
    }

    // 5. Anti-anchoring & prohibited field guardrails
    for (const prohibited of PROHIBITED_WORKLIST_CASE_FIELDS) {
      if (prohibited in c) {
        throw new Error(`WORKLIST_CASE_CONTAINS_PROHIBITED_FIELD:${c.id}:${prohibited}`);
      }
    }
  }

  // Ensure every acquisition candidate is present in worklist
  for (const acq of acquisitionCandidates) {
    if (!seenIds.has(acq.id)) {
      throw new Error(`ACQUISITION_CANDIDATE_MISSING_FROM_WORKLIST:${acq.id}`);
    }
  }

  // 6. Summary consistency
  if (worklist.summary.total !== 108 || worklist.summary.pending !== 108 || worklist.summary.adjudicated !== 0) {
    throw new Error(
      `WORKLIST_SUMMARY_COUNTS_INVALID: total=${worklist.summary.total}, pending=${worklist.summary.pending}, adjudicated=${worklist.summary.adjudicated}`
    );
  }

  const expectedBatchCounts = { A: 25, B: 23, C: 36, D: 12, E: 12 };
  for (const [batch, count] of Object.entries(expectedBatchCounts)) {
    if (worklist.summary.byBatch[batch] !== count) {
      throw new Error(
        `WORKLIST_SUMMARY_BATCH_COUNT_MISMATCH:${batch}: expected ${count}, got ${worklist.summary.byBatch[batch]}`
      );
    }
  }
}

/**
 * Loads default repository files and executes validation.
 */
export function validateRepositoryReauditWorklist(
  repoRoot: string = process.cwd()
): void {
  const worklistPath = path.join(repoRoot, 'validation/review/reaudit-worklist.v2.json');
  const acquisitionPath = path.join(repoRoot, 'validation/acquisition/external-candidates.v1.json');

  if (!fs.existsSync(worklistPath)) {
    throw new Error(`Re-audit worklist not found at ${worklistPath}`);
  }
  if (!fs.existsSync(acquisitionPath)) {
    throw new Error(`Acquisition candidates not found at ${acquisitionPath}`);
  }

  const worklist = JSON.parse(fs.readFileSync(worklistPath, 'utf8')) as ReauditWorklistDocument;
  const acquisitionCandidates = JSON.parse(
    fs.readFileSync(acquisitionPath, 'utf8')
  ) as AcquisitionCandidateMinimal[];

  validateReauditWorklist(worklist, acquisitionCandidates);
}
