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
}

export interface ReauditWorklistMetadata {
  schemaVersion: number;
  artifactType: string;
  sourceCorpus: string;
  sourceCorpusCount: number;
  status: string;
  engineEvaluationPerformed: boolean;
  humanSignoff: unknown;
  priorAdjudicationAuthority: string;
}

export interface ReauditWorklistSummary {
  total: number;
  pending: number;
  adjudicated: number;
  byBatch: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface ReauditWorklistDocument {
  metadata: ReauditWorklistMetadata;
  summary: ReauditWorklistSummary;
  cases: ReauditWorklistCase[];
}

export const EXACT_ALLOWED_ROOT_KEYS = [
  'metadata',
  'summary',
  'cases'
] as const;

export const EXACT_ALLOWED_CASE_KEYS = [
  'id',
  'sourceText',
  'category',
  'profile',
  'batch',
  'reviewState',
  'decision'
] as const;

export const EXACT_ALLOWED_METADATA_KEYS = [
  'schemaVersion',
  'artifactType',
  'sourceCorpus',
  'sourceCorpusCount',
  'status',
  'engineEvaluationPerformed',
  'humanSignoff',
  'priorAdjudicationAuthority'
] as const;

export const EXACT_ALLOWED_SUMMARY_KEYS = [
  'total',
  'pending',
  'adjudicated',
  'byBatch',
  'byCategory'
] as const;

export const EXACT_ALLOWED_BATCH_KEYS = [
  'A',
  'B',
  'C',
  'D',
  'E'
] as const;

export const EXACT_ALLOWED_CATEGORY_KEYS = [
  'TERM',
  'RELIGIOUS_TERM',
  'PERSON',
  'PLACE',
  'INSTITUTION',
  'BOOK_TITLE',
  'COMPOUND',
  'MORPHOLOGY',
  'IZAFAT',
  'AMBIGUITY'
] as const;

export const EXPECTED_BATCH_COUNTS: Record<ReauditBatch, number> = {
  A: 25,
  B: 23,
  C: 36,
  D: 12,
  E: 12
};

export const EXPECTED_CATEGORY_COUNTS: Record<string, number> = {
  TERM: 15,
  RELIGIOUS_TERM: 10,
  PERSON: 18,
  PLACE: 12,
  INSTITUTION: 6,
  BOOK_TITLE: 12,
  COMPOUND: 5,
  MORPHOLOGY: 10,
  IZAFAT: 8,
  AMBIGUITY: 12
};

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
 * and enforces strict allowlisting, anti-anchoring, engine-blindness, and governance invariants.
 *
 * NOTE: This validator strictly contains NO transliteration or engine calls.
 */
export function validateReauditWorklist(
  worklist: ReauditWorklistDocument,
  acquisitionCandidates: AcquisitionCandidateMinimal[]
): void {
  // 1. Root Document Strict Key Allowlist
  const rootKeys = Object.keys(worklist);
  for (const key of rootKeys) {
    if (!EXACT_ALLOWED_ROOT_KEYS.includes(key as any)) {
      throw new Error(`WORKLIST_DOCUMENT_CONTAINS_UNEXPECTED_KEY:${key}`);
    }
  }
  for (const key of EXACT_ALLOWED_ROOT_KEYS) {
    if (!(key in worklist)) {
      throw new Error(`WORKLIST_DOCUMENT_MISSING_REQUIRED_KEY:${key}`);
    }
  }

  // 2. Metadata Invariants & Strict Key Allowlist
  const metadataKeys = Object.keys(worklist.metadata);
  for (const key of metadataKeys) {
    if (!EXACT_ALLOWED_METADATA_KEYS.includes(key as any)) {
      throw new Error(`WORKLIST_METADATA_CONTAINS_UNEXPECTED_KEY:${key}`);
    }
  }
  for (const key of EXACT_ALLOWED_METADATA_KEYS) {
    if (!(key in worklist.metadata)) {
      throw new Error(`WORKLIST_METADATA_MISSING_REQUIRED_KEY:${key}`);
    }
  }

  // 3. Summary Strict Key Allowlist
  const summaryKeys = Object.keys(worklist.summary);
  for (const key of summaryKeys) {
    if (!EXACT_ALLOWED_SUMMARY_KEYS.includes(key as any)) {
      throw new Error(`WORKLIST_SUMMARY_CONTAINS_UNEXPECTED_KEY:${key}`);
    }
  }
  for (const key of EXACT_ALLOWED_SUMMARY_KEYS) {
    if (!(key in worklist.summary)) {
      throw new Error(`WORKLIST_SUMMARY_MISSING_REQUIRED_KEY:${key}`);
    }
  }

  // byBatch Strict Key Allowlist
  const batchKeys = Object.keys(worklist.summary.byBatch);
  for (const key of batchKeys) {
    if (!EXACT_ALLOWED_BATCH_KEYS.includes(key as any)) {
      throw new Error(`WORKLIST_SUMMARY_BY_BATCH_CONTAINS_UNEXPECTED_KEY:${key}`);
    }
  }
  for (const key of EXACT_ALLOWED_BATCH_KEYS) {
    if (!(key in worklist.summary.byBatch)) {
      throw new Error(`WORKLIST_SUMMARY_BY_BATCH_MISSING_REQUIRED_KEY:${key}`);
    }
  }

  // byCategory Strict Key Allowlist
  const categoryKeys = Object.keys(worklist.summary.byCategory);
  for (const key of categoryKeys) {
    if (!EXACT_ALLOWED_CATEGORY_KEYS.includes(key as any)) {
      throw new Error(`WORKLIST_SUMMARY_BY_CATEGORY_CONTAINS_UNEXPECTED_KEY:${key}`);
    }
  }
  for (const key of EXACT_ALLOWED_CATEGORY_KEYS) {
    if (!(key in worklist.summary.byCategory)) {
      throw new Error(`WORKLIST_SUMMARY_BY_CATEGORY_MISSING_REQUIRED_KEY:${key}`);
    }
  }

  if (worklist.metadata.schemaVersion !== 2) {
    throw new Error(`WORKLIST_SCHEMA_VERSION_INVALID:${worklist.metadata.schemaVersion}`);
  }

  if (worklist.metadata.artifactType !== 'BLIND_REAUDIT_WORKLIST') {
    throw new Error(`WORKLIST_ARTIFACT_TYPE_INVALID:${worklist.metadata.artifactType}`);
  }

  if (worklist.metadata.sourceCorpus !== 'validation/acquisition/external-candidates.v1.json') {
    throw new Error(`WORKLIST_SOURCE_CORPUS_INVALID:${worklist.metadata.sourceCorpus}`);
  }

  if (worklist.metadata.sourceCorpusCount !== 108) {
    throw new Error(`WORKLIST_SOURCE_CORPUS_COUNT_MISMATCH:${worklist.metadata.sourceCorpusCount}`);
  }

  if (worklist.metadata.status !== 'READY_FOR_BLIND_REAUDIT') {
    throw new Error(`WORKLIST_STATUS_INVALID:${worklist.metadata.status}`);
  }

  if (worklist.metadata.engineEvaluationPerformed !== false) {
    throw new Error('WORKLIST_ENGINE_EVALUATION_MUST_BE_FALSE');
  }

  if (worklist.metadata.humanSignoff !== null) {
    throw new Error('WORKLIST_HUMAN_SIGNOFF_MUST_BE_NULL');
  }

  if (worklist.metadata.priorAdjudicationAuthority !== 'HISTORICAL_ONLY') {
    throw new Error(
      `WORKLIST_PRIOR_ADJUDICATION_AUTHORITY_INVALID:${worklist.metadata.priorAdjudicationAuthority}`
    );
  }

  // 2. Case count & unique IDs
  if (worklist.cases.length !== 108) {
    throw new Error(`WORKLIST_CASE_COUNT_MISMATCH:${worklist.cases.length}`);
  }

  if (acquisitionCandidates.length !== 108) {
    throw new Error(`ACQUISITION_CANDIDATE_COUNT_MISMATCH:${acquisitionCandidates.length}`);
  }

  const seenIds = new Set<string>();
  const actualByBatch: Record<ReauditBatch, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const actualByCategory: Record<string, number> = {};
  let actualPending = 0;
  let actualAdjudicated = 0;

  // 3. One-to-one alignment with acquisition candidates
  const acqMap = new Map<string, AcquisitionCandidateMinimal>();
  for (const acq of acquisitionCandidates) {
    acqMap.set(acq.id, acq);
  }

  for (const c of worklist.cases) {
    if (seenIds.has(c.id)) {
      throw new Error(`WORKLIST_DUPLICATE_CASE_ID:${c.id}`);
    }
    seenIds.add(c.id);

    // Strict positive allowlist: no extra case fields permitted
    const caseKeys = Object.keys(c);
    for (const key of caseKeys) {
      if (!EXACT_ALLOWED_CASE_KEYS.includes(key as any)) {
        throw new Error(`WORKLIST_CASE_CONTAINS_PROHIBITED_FIELD:${c.id}:${key}`);
      }
    }
    for (const key of EXACT_ALLOWED_CASE_KEYS) {
      if (!(key in c)) {
        throw new Error(`WORKLIST_CASE_MISSING_REQUIRED_KEY:${c.id}:${key}`);
      }
    }

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

    // Initial blank state requirements
    if (c.reviewState !== 'PENDING') {
      throw new Error(`WORKLIST_CASE_NOT_PENDING:${c.id}: reviewState="${c.reviewState}"`);
    }

    if (c.decision !== null) {
      throw new Error(`WORKLIST_CASE_HAS_NON_NULL_DECISION:${c.id}`);
    }

    // Accumulate counts for summary validation
    if (c.reviewState === 'PENDING' && c.decision === null) {
      actualPending++;
    } else {
      actualAdjudicated++;
    }

    if (c.batch in actualByBatch) {
      actualByBatch[c.batch]++;
    }
    actualByCategory[c.category] = (actualByCategory[c.category] || 0) + 1;
  }

  // Ensure every acquisition candidate is present in worklist
  for (const acq of acquisitionCandidates) {
    if (!seenIds.has(acq.id)) {
      throw new Error(`ACQUISITION_CANDIDATE_MISSING_FROM_WORKLIST:${acq.id}`);
    }
  }

  // 4. Recomputed Summary Validation
  if (worklist.summary.total !== worklist.cases.length || worklist.summary.total !== 108) {
    throw new Error(
      `WORKLIST_SUMMARY_TOTAL_MISMATCH: expected 108 (actual cases: ${worklist.cases.length}), got ${worklist.summary.total}`
    );
  }

  if (worklist.summary.pending !== actualPending || worklist.summary.pending !== 108) {
    throw new Error(
      `WORKLIST_SUMMARY_PENDING_MISMATCH: expected 108 (actual pending: ${actualPending}), got ${worklist.summary.pending}`
    );
  }

  if (worklist.summary.adjudicated !== actualAdjudicated || worklist.summary.adjudicated !== 0) {
    throw new Error(
      `WORKLIST_SUMMARY_ADJUDICATED_MISMATCH: expected 0 (actual adjudicated: ${actualAdjudicated}), got ${worklist.summary.adjudicated}`
    );
  }

  // Validate batch counts against actual recomputed and canonical expected
  for (const [batch, expectedCount] of Object.entries(EXPECTED_BATCH_COUNTS) as [ReauditBatch, number][]) {
    if (actualByBatch[batch] !== expectedCount) {
      throw new Error(
        `WORKLIST_ACTUAL_BATCH_COUNT_MISMATCH:${batch}: expected ${expectedCount}, actual cases have ${actualByBatch[batch]}`
      );
    }
    if (worklist.summary.byBatch[batch] !== expectedCount) {
      throw new Error(
        `WORKLIST_SUMMARY_BATCH_COUNT_MISMATCH:${batch}: expected ${expectedCount}, summary declared ${worklist.summary.byBatch[batch]}`
      );
    }
  }

  // Validate category counts against actual recomputed and canonical expected
  for (const [cat, expectedCount] of Object.entries(EXPECTED_CATEGORY_COUNTS)) {
    if (actualByCategory[cat] !== expectedCount) {
      throw new Error(
        `WORKLIST_ACTUAL_CATEGORY_COUNT_MISMATCH:${cat}: expected ${expectedCount}, actual cases have ${actualByCategory[cat]}`
      );
    }
    if (worklist.summary.byCategory[cat] !== expectedCount) {
      throw new Error(
        `WORKLIST_SUMMARY_CATEGORY_COUNT_MISMATCH:${cat}: expected ${expectedCount}, summary declared ${worklist.summary.byCategory[cat]}`
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
