import fs from 'node:fs';
import path from 'node:path';

export type ReauditBatch = 'A' | 'B' | 'C' | 'D' | 'E';
export type ReauditReviewState = 'PENDING' | 'IN_REVIEW' | 'COMPLETED';
export type ReauditStatus = 'READY_FOR_BLIND_REAUDIT' | 'BATCH_A_COMPLETED';

export interface AcquisitionCandidateMinimal {
  id: string;
  sourceText: string;
  category: string;
  proposedProfile?: string;
  profile?: string;
  [key: string]: unknown;
}

export interface ReauditEvidence {
  source: string;
  citation: string;
  locator: string;
}

export interface ReauditReviewer {
  name: string;
  type: 'AI_SPECIALIST';
  reviewedAt: string;
}

export interface ReauditFinalDecision {
  disposition: 'FINAL';
  scholarlyCanonical: string;
  renderedOutput: string;
  readingEvidence: ReauditEvidence[];
  renderingEvidence: ReauditEvidence[];
  reviewNote: string;
  reviewer: ReauditReviewer;
}

export interface ReauditWorklistCase {
  id: string;
  sourceText: string;
  category: string;
  profile: string;
  batch: ReauditBatch;
  reviewState: ReauditReviewState;
  decision: ReauditFinalDecision | null;
}

export interface ReauditWorklistMetadata {
  schemaVersion: number;
  artifactType: string;
  sourceCorpus: string;
  sourceCorpusCount: number;
  status: ReauditStatus;
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

export const EXACT_ALLOWED_ROOT_KEYS = ['metadata', 'summary', 'cases'] as const;
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
export const EXACT_ALLOWED_BATCH_KEYS = ['A', 'B', 'C', 'D', 'E'] as const;
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

const EXACT_ALLOWED_FINAL_DECISION_KEYS = [
  'disposition',
  'scholarlyCanonical',
  'renderedOutput',
  'readingEvidence',
  'renderingEvidence',
  'reviewNote',
  'reviewer'
] as const;
const EXACT_ALLOWED_EVIDENCE_KEYS = ['source', 'citation', 'locator'] as const;
const EXACT_ALLOWED_REVIEWER_KEYS = ['name', 'type', 'reviewedAt'] as const;

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

const BATCH_A_REVIEW_DATE = '2026-10-04';
const ARABIC_SCRIPT_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u;

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

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  prefix: string
): void {
  const actual = Object.keys(value);
  for (const key of actual) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`${prefix}_CONTAINS_UNEXPECTED_KEY:${key}`);
    }
  }
  for (const key of allowedKeys) {
    if (!(key in value)) {
      throw new Error(`${prefix}_MISSING_REQUIRED_KEY:${key}`);
    }
  }
}

function assertNonEmptyTrimmedString(value: unknown, code: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(code);
  }
}

function assertLatinGoldString(value: unknown, field: string, caseId: string): asserts value is string {
  assertNonEmptyTrimmedString(value, `WORKLIST_DECISION_${field}_INVALID:${caseId}`);
  if (value.normalize('NFC') !== value) {
    throw new Error(`WORKLIST_DECISION_${field}_NOT_NFC:${caseId}`);
  }
  if (ARABIC_SCRIPT_RE.test(value)) {
    throw new Error(`WORKLIST_DECISION_${field}_CONTAINS_ARABIC_SCRIPT:${caseId}`);
  }
}

function validateEvidenceArray(value: unknown, field: string, caseId: string): void {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error(`WORKLIST_DECISION_${field}_MUST_BE_NONEMPTY:${caseId}`);
  }
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`WORKLIST_DECISION_${field}_ITEM_INVALID:${caseId}:${index}`);
    }
    const evidence = item as Record<string, unknown>;
    assertExactKeys(
      evidence,
      EXACT_ALLOWED_EVIDENCE_KEYS,
      `WORKLIST_DECISION_${field}_ITEM:${caseId}:${index}`
    );
    assertNonEmptyTrimmedString(
      evidence.source,
      `WORKLIST_DECISION_${field}_SOURCE_INVALID:${caseId}:${index}`
    );
    assertNonEmptyTrimmedString(
      evidence.citation,
      `WORKLIST_DECISION_${field}_CITATION_INVALID:${caseId}:${index}`
    );
    assertNonEmptyTrimmedString(
      evidence.locator,
      `WORKLIST_DECISION_${field}_LOCATOR_INVALID:${caseId}:${index}`
    );
  }
}

function validateBatchAFinalDecision(decision: unknown, caseId: string): void {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
    throw new Error(`WORKLIST_BATCH_A_DECISION_INVALID:${caseId}`);
  }

  const d = decision as Record<string, unknown>;
  assertExactKeys(d, EXACT_ALLOWED_FINAL_DECISION_KEYS, `WORKLIST_BATCH_A_DECISION:${caseId}`);

  if (d.disposition !== 'FINAL') {
    throw new Error(`WORKLIST_BATCH_A_DISPOSITION_MUST_BE_FINAL:${caseId}`);
  }

  assertLatinGoldString(d.scholarlyCanonical, 'SCHOLARLY_CANONICAL', caseId);
  assertLatinGoldString(d.renderedOutput, 'RENDERED_OUTPUT', caseId);
  validateEvidenceArray(d.readingEvidence, 'READING_EVIDENCE', caseId);
  validateEvidenceArray(d.renderingEvidence, 'RENDERING_EVIDENCE', caseId);
  assertNonEmptyTrimmedString(d.reviewNote, `WORKLIST_DECISION_REVIEW_NOTE_INVALID:${caseId}`);

  if (!d.reviewer || typeof d.reviewer !== 'object' || Array.isArray(d.reviewer)) {
    throw new Error(`WORKLIST_DECISION_REVIEWER_INVALID:${caseId}`);
  }
  const reviewer = d.reviewer as Record<string, unknown>;
  assertExactKeys(
    reviewer,
    EXACT_ALLOWED_REVIEWER_KEYS,
    `WORKLIST_DECISION_REVIEWER:${caseId}`
  );
  if (reviewer.name !== 'OpenAI GPT-5.6 Sol') {
    throw new Error(`WORKLIST_DECISION_REVIEWER_NAME_INVALID:${caseId}`);
  }
  if (reviewer.type !== 'AI_SPECIALIST') {
    throw new Error(`WORKLIST_DECISION_REVIEWER_TYPE_INVALID:${caseId}`);
  }
  if (reviewer.reviewedAt !== BATCH_A_REVIEW_DATE) {
    throw new Error(`WORKLIST_DECISION_REVIEW_DATE_INVALID:${caseId}`);
  }
}

/**
 * Validates the blind V2 re-audit worklist without importing or executing
 * transliteration runtime code.
 *
 * Supported states:
 * - READY_FOR_BLIND_REAUDIT: all 108 decisions blank.
 * - BATCH_A_COMPLETED: exactly 25 Batch A decisions completed, 83 still blank.
 */
export function validateReauditWorklist(
  worklist: ReauditWorklistDocument,
  acquisitionCandidates: AcquisitionCandidateMinimal[]
): void {
  assertExactKeys(
    worklist as unknown as Record<string, unknown>,
    EXACT_ALLOWED_ROOT_KEYS,
    'WORKLIST_DOCUMENT'
  );
  assertExactKeys(
    worklist.metadata as unknown as Record<string, unknown>,
    EXACT_ALLOWED_METADATA_KEYS,
    'WORKLIST_METADATA'
  );
  assertExactKeys(
    worklist.summary as unknown as Record<string, unknown>,
    EXACT_ALLOWED_SUMMARY_KEYS,
    'WORKLIST_SUMMARY'
  );
  assertExactKeys(
    worklist.summary.byBatch as Record<string, unknown>,
    EXACT_ALLOWED_BATCH_KEYS,
    'WORKLIST_SUMMARY_BY_BATCH'
  );
  assertExactKeys(
    worklist.summary.byCategory as Record<string, unknown>,
    EXACT_ALLOWED_CATEGORY_KEYS,
    'WORKLIST_SUMMARY_BY_CATEGORY'
  );

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
  if (
    worklist.metadata.status !== 'READY_FOR_BLIND_REAUDIT' &&
    worklist.metadata.status !== 'BATCH_A_COMPLETED'
  ) {
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

  if (worklist.cases.length !== 108) {
    throw new Error(`WORKLIST_CASE_COUNT_MISMATCH:${worklist.cases.length}`);
  }
  if (acquisitionCandidates.length !== 108) {
    throw new Error(`ACQUISITION_CANDIDATE_COUNT_MISMATCH:${acquisitionCandidates.length}`);
  }

  const acqMap = new Map<string, AcquisitionCandidateMinimal>();
  for (const acq of acquisitionCandidates) {
    if (acqMap.has(acq.id)) {
      throw new Error(`ACQUISITION_DUPLICATE_CASE_ID:${acq.id}`);
    }
    acqMap.set(acq.id, acq);
  }

  const seenIds = new Set<string>();
  const actualByBatch: Record<ReauditBatch, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const actualByCategory: Record<string, number> = {};
  let actualPending = 0;
  let actualAdjudicated = 0;
  let completedBatchA = 0;

  for (const c of worklist.cases) {
    if (seenIds.has(c.id)) {
      throw new Error(`WORKLIST_DUPLICATE_CASE_ID:${c.id}`);
    }
    seenIds.add(c.id);

    assertExactKeys(
      c as unknown as Record<string, unknown>,
      EXACT_ALLOWED_CASE_KEYS,
      `WORKLIST_CASE:${c.id}`
    );

    const acq = acqMap.get(c.id);
    if (!acq) {
      throw new Error(`WORKLIST_CASE_NOT_IN_ACQUISITION:${c.id}`);
    }
    if (c.sourceText !== acq.sourceText) {
      throw new Error(`WORKLIST_SOURCETEXT_MISMATCH:${c.id}`);
    }
    if (c.category !== acq.category) {
      throw new Error(`WORKLIST_CATEGORY_MISMATCH:${c.id}`);
    }
    const expectedProfile = acq.proposedProfile ?? acq.profile;
    if (c.profile !== expectedProfile) {
      throw new Error(`WORKLIST_PROFILE_MISMATCH:${c.id}`);
    }
    const expectedBatch = getExpectedReauditBatch(c.category);
    if (c.batch !== expectedBatch) {
      throw new Error(`WORKLIST_BATCH_MISMATCH:${c.id}`);
    }

    if (worklist.metadata.status === 'READY_FOR_BLIND_REAUDIT') {
      if (c.reviewState !== 'PENDING' || c.decision !== null) {
        throw new Error(`WORKLIST_READY_STATE_CASE_MUST_BE_BLANK:${c.id}`);
      }
    } else {
      if (c.batch === 'A') {
        if (c.reviewState !== 'COMPLETED') {
          throw new Error(`WORKLIST_BATCH_A_CASE_NOT_COMPLETED:${c.id}`);
        }
        validateBatchAFinalDecision(c.decision, c.id);
        completedBatchA++;
      } else if (c.reviewState !== 'PENDING' || c.decision !== null) {
        throw new Error(`WORKLIST_NON_BATCH_A_CASE_MUST_REMAIN_PENDING:${c.id}`);
      }
    }

    if (c.reviewState === 'PENDING' && c.decision === null) {
      actualPending++;
    } else {
      actualAdjudicated++;
    }

    actualByBatch[c.batch]++;
    actualByCategory[c.category] = (actualByCategory[c.category] ?? 0) + 1;
  }

  for (const acq of acquisitionCandidates) {
    if (!seenIds.has(acq.id)) {
      throw new Error(`ACQUISITION_CANDIDATE_MISSING_FROM_WORKLIST:${acq.id}`);
    }
  }

  if (
    worklist.metadata.status === 'BATCH_A_COMPLETED' &&
    completedBatchA !== EXPECTED_BATCH_COUNTS.A
  ) {
    throw new Error(`WORKLIST_BATCH_A_COMPLETED_COUNT_MISMATCH:${completedBatchA}`);
  }

  const expectedPending = worklist.metadata.status === 'READY_FOR_BLIND_REAUDIT' ? 108 : 83;
  const expectedAdjudicated = worklist.metadata.status === 'READY_FOR_BLIND_REAUDIT' ? 0 : 25;

  if (worklist.summary.total !== 108 || worklist.summary.total !== worklist.cases.length) {
    throw new Error(`WORKLIST_SUMMARY_TOTAL_MISMATCH:${worklist.summary.total}`);
  }
  if (
    worklist.summary.pending !== expectedPending ||
    worklist.summary.pending !== actualPending
  ) {
    throw new Error(`WORKLIST_SUMMARY_PENDING_MISMATCH:${worklist.summary.pending}`);
  }
  if (
    worklist.summary.adjudicated !== expectedAdjudicated ||
    worklist.summary.adjudicated !== actualAdjudicated
  ) {
    throw new Error(`WORKLIST_SUMMARY_ADJUDICATED_MISMATCH:${worklist.summary.adjudicated}`);
  }

  for (const [batch, expectedCount] of Object.entries(EXPECTED_BATCH_COUNTS) as [
    ReauditBatch,
    number
  ][]) {
    if (
      actualByBatch[batch] !== expectedCount ||
      worklist.summary.byBatch[batch] !== expectedCount
    ) {
      throw new Error(`WORKLIST_BATCH_COUNT_MISMATCH:${batch}`);
    }
  }

  for (const [category, expectedCount] of Object.entries(EXPECTED_CATEGORY_COUNTS)) {
    if (
      actualByCategory[category] !== expectedCount ||
      worklist.summary.byCategory[category] !== expectedCount
    ) {
      throw new Error(`WORKLIST_CATEGORY_COUNT_MISMATCH:${category}`);
    }
  }
}

export function validateRepositoryReauditWorklist(repoRoot: string = process.cwd()): void {
  const worklistPath = path.join(repoRoot, 'validation/review/reaudit-worklist.v2.json');
  const acquisitionPath = path.join(
    repoRoot,
    'validation/acquisition/external-candidates.v1.json'
  );

  if (!fs.existsSync(worklistPath)) {
    throw new Error(`Re-audit worklist not found at ${worklistPath}`);
  }
  if (!fs.existsSync(acquisitionPath)) {
    throw new Error(`Acquisition candidates not found at ${acquisitionPath}`);
  }

  const worklist = JSON.parse(
    fs.readFileSync(worklistPath, 'utf8')
  ) as ReauditWorklistDocument;
  const acquisitionCandidates = JSON.parse(
    fs.readFileSync(acquisitionPath, 'utf8')
  ) as AcquisitionCandidateMinimal[];

  validateReauditWorklist(worklist, acquisitionCandidates);
}
