import fs from 'node:fs';
import path from 'node:path';

export type ReauditBatch = 'A' | 'B' | 'C' | 'D' | 'E';
export type ReauditReviewState = 'PENDING' | 'IN_REVIEW' | 'COMPLETED';
export type ReauditStatus =
  | 'READY_FOR_BLIND_REAUDIT'
  | 'BATCH_A_COMPLETED'
  | 'BATCH_B_COMPLETED'
  | 'BATCH_C_COMPLETED'
  | 'BATCH_D_COMPLETED'
  | 'BATCH_E_COMPLETED';

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

export interface ReauditNonAuthoritativeAlternative {
  reading: string;
  source: string;
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

export interface ReauditNonFinalDecision {
  disposition: 'REVIEW_REQUIRED' | 'UNRESOLVED';
  nonAuthoritativeAlternatives?: ReauditNonAuthoritativeAlternative[];
  readingEvidence: ReauditEvidence[];
  renderingEvidence?: ReauditEvidence[];
  reviewNote: string;
  reviewer: ReauditReviewer;
}

export type ReauditDecision = ReauditFinalDecision | ReauditNonFinalDecision;

export interface ReauditWorklistCase {
  id: string;
  sourceText: string;
  category: string;
  profile: string;
  batch: ReauditBatch;
  reviewState: ReauditReviewState;
  decision: ReauditDecision | null;
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
const ALLOWED_NON_FINAL_DECISION_KEYS = [
  'disposition',
  'nonAuthoritativeAlternatives',
  'readingEvidence',
  'renderingEvidence',
  'reviewNote',
  'reviewer'
] as const;
const REQUIRED_NON_FINAL_DECISION_KEYS = [
  'disposition',
  'readingEvidence',
  'reviewNote',
  'reviewer'
] as const;
const EXACT_ALLOWED_EVIDENCE_KEYS = ['source', 'citation', 'locator'] as const;
const EXACT_ALLOWED_REVIEWER_KEYS = ['name', 'type', 'reviewedAt'] as const;
const EXACT_ALLOWED_ALTERNATIVE_KEYS = ['reading', 'source'] as const;

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

const STATUS_COMPLETED_BATCHES: Record<ReauditStatus, readonly ReauditBatch[]> = {
  READY_FOR_BLIND_REAUDIT: [],
  BATCH_A_COMPLETED: ['A'],
  BATCH_B_COMPLETED: ['A', 'B'],
  BATCH_C_COMPLETED: ['A', 'B', 'C'],
  BATCH_D_COMPLETED: ['A', 'B', 'C', 'D'],
  BATCH_E_COMPLETED: ['A', 'B', 'C', 'D', 'E']
};

const ARABIC_SCRIPT_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

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
  for (const key of Object.keys(value)) {
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

function assertAllowedKeysWithRequired(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  prefix: string
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`${prefix}_CONTAINS_UNEXPECTED_KEY:${key}`);
    }
  }
  for (const key of requiredKeys) {
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

function assertLatinNfcString(value: unknown, field: string, caseId: string): asserts value is string {
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

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateReviewer(value: unknown, caseId: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`WORKLIST_DECISION_REVIEWER_INVALID:${caseId}`);
  }
  const reviewer = value as Record<string, unknown>;
  assertExactKeys(reviewer, EXACT_ALLOWED_REVIEWER_KEYS, `WORKLIST_DECISION_REVIEWER:${caseId}`);
  assertNonEmptyTrimmedString(
    reviewer.name,
    `WORKLIST_DECISION_REVIEWER_NAME_INVALID:${caseId}`
  );
  if (reviewer.type !== 'AI_SPECIALIST') {
    throw new Error(`WORKLIST_DECISION_REVIEWER_TYPE_INVALID:${caseId}`);
  }
  if (typeof reviewer.reviewedAt !== 'string' || !isValidIsoDate(reviewer.reviewedAt)) {
    throw new Error(`WORKLIST_DECISION_REVIEW_DATE_INVALID:${caseId}`);
  }
}

function validateAlternatives(value: unknown, caseId: string): void {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error(`WORKLIST_DECISION_ALTERNATIVES_MUST_BE_NONEMPTY:${caseId}`);
  }
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`WORKLIST_DECISION_ALTERNATIVE_INVALID:${caseId}:${index}`);
    }
    const alternative = item as Record<string, unknown>;
    assertExactKeys(
      alternative,
      EXACT_ALLOWED_ALTERNATIVE_KEYS,
      `WORKLIST_DECISION_ALTERNATIVE:${caseId}:${index}`
    );
    assertLatinNfcString(alternative.reading, 'ALTERNATIVE_READING', caseId);
    assertNonEmptyTrimmedString(
      alternative.source,
      `WORKLIST_DECISION_ALTERNATIVE_SOURCE_INVALID:${caseId}:${index}`
    );
  }
}

function validateCompletedDecision(decision: unknown, caseId: string): void {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
    throw new Error(`WORKLIST_DECISION_INVALID:${caseId}`);
  }

  const d = decision as Record<string, unknown>;

  if (d.disposition === 'FINAL') {
    assertExactKeys(d, EXACT_ALLOWED_FINAL_DECISION_KEYS, `WORKLIST_DECISION:${caseId}`);
    assertLatinNfcString(d.scholarlyCanonical, 'SCHOLARLY_CANONICAL', caseId);
    assertLatinNfcString(d.renderedOutput, 'RENDERED_OUTPUT', caseId);
    validateEvidenceArray(d.readingEvidence, 'READING_EVIDENCE', caseId);
    validateEvidenceArray(d.renderingEvidence, 'RENDERING_EVIDENCE', caseId);
  } else if (d.disposition === 'REVIEW_REQUIRED' || d.disposition === 'UNRESOLVED') {
    assertAllowedKeysWithRequired(
      d,
      ALLOWED_NON_FINAL_DECISION_KEYS,
      REQUIRED_NON_FINAL_DECISION_KEYS,
      `WORKLIST_DECISION:${caseId}`
    );
    validateEvidenceArray(d.readingEvidence, 'READING_EVIDENCE', caseId);
    if ('renderingEvidence' in d) {
      validateEvidenceArray(d.renderingEvidence, 'RENDERING_EVIDENCE', caseId);
    }
    if ('nonAuthoritativeAlternatives' in d) {
      validateAlternatives(d.nonAuthoritativeAlternatives, caseId);
    }
  } else {
    throw new Error(`WORKLIST_DISPOSITION_INVALID:${caseId}`);
  }

  assertNonEmptyTrimmedString(d.reviewNote, `WORKLIST_DECISION_REVIEW_NOTE_INVALID:${caseId}`);
  validateReviewer(d.reviewer, caseId);
}

/**
 * Validates the engine-blind V2 re-audit workspace.
 *
 * Repository status is sequential: a BATCH_X_COMPLETED state requires every
 * earlier batch through X to be completed and every later batch to remain
 * PENDING with decision=null. The validator checks decision shape, provenance,
 * evidence, and safety boundaries; it never dictates the scholarly disposition.
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
  if (!(worklist.metadata.status in STATUS_COMPLETED_BATCHES)) {
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

  const completedBatches = new Set<ReauditBatch>(STATUS_COMPLETED_BATCHES[worklist.metadata.status]);
  const seenIds = new Set<string>();
  const actualByBatch: Record<ReauditBatch, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const actualByCategory: Record<string, number> = {};
  let actualPending = 0;
  let actualAdjudicated = 0;

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

    if (completedBatches.has(c.batch)) {
      if (c.reviewState !== 'COMPLETED' || c.decision === null) {
        throw new Error(`WORKLIST_COMPLETED_BATCH_CASE_INVALID:${c.id}`);
      }
      validateCompletedDecision(c.decision, c.id);
      actualAdjudicated++;
    } else {
      if (c.reviewState !== 'PENDING' || c.decision !== null) {
        throw new Error(`WORKLIST_PENDING_BATCH_CASE_INVALID:${c.id}`);
      }
      actualPending++;
    }

    actualByBatch[c.batch]++;
    actualByCategory[c.category] = (actualByCategory[c.category] ?? 0) + 1;
  }

  for (const acq of acquisitionCandidates) {
    if (!seenIds.has(acq.id)) {
      throw new Error(`ACQUISITION_CANDIDATE_MISSING_FROM_WORKLIST:${acq.id}`);
    }
  }

  const expectedAdjudicated = [...completedBatches].reduce(
    (sum, batch) => sum + EXPECTED_BATCH_COUNTS[batch],
    0
  );
  const expectedPending = 108 - expectedAdjudicated;

  if (worklist.summary.total !== 108 || worklist.summary.total !== worklist.cases.length) {
    throw new Error(`WORKLIST_SUMMARY_TOTAL_MISMATCH:${worklist.summary.total}`);
  }
  if (worklist.summary.pending !== expectedPending || worklist.summary.pending !== actualPending) {
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
