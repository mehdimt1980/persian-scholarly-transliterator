import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type JsonRecord = Record<string, unknown>;

interface AcquisitionCandidate extends JsonRecord {
  id: string;
  sourceText: string;
  category: string;
}

interface AdjudicationCase extends JsonRecord {
  id: string;
  sourceText: string;
  category: string;
  disposition: 'FINAL' | 'REVIEW_REQUIRED' | 'UNRESOLVED';
  canonical?: string;
  allowedCanonicals?: string[];
}

interface AdjudicationDocument {
  metadata: JsonRecord & {
    version: string;
    engineEvaluationPerformed: boolean;
    status: string;
    humanSignoff?: unknown;
  };
  summary: JsonRecord;
  cases: AdjudicationCase[];
}

interface Amendment {
  id: string;
  field: string;
  from: unknown;
  to: unknown;
  evidence?: string[];
}

interface AmendmentDocument {
  metadata: JsonRecord & {
    status?: string;
    consolidatedIntoVersion?: string;
    engineEvaluationPerformed?: boolean;
  };
  corrections: Amendment[];
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function normalizedComparable(value: unknown): unknown {
  return value === undefined ? null : value;
}

function equalJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizedComparable(a)) === JSON.stringify(normalizedComparable(b));
}

export function validateEffectiveAdjudication(document: AdjudicationDocument): void {
  if (document.metadata.engineEvaluationPerformed !== false) {
    throw new Error('ADJUDICATION_ENGINE_EVALUATION_MUST_BE_FALSE');
  }

  if (document.metadata.status !== 'EXPERT_ADJUDICATED_PENDING_HUMAN_SIGNOFF') {
    throw new Error(`ADJUDICATION_STATUS_INVALID:${document.metadata.status}`);
  }

  if (document.metadata.humanSignoff !== null && document.metadata.humanSignoff !== undefined) {
    throw new Error('ADJUDICATION_PREMATURE_HUMAN_SIGNOFF');
  }

  if (document.cases.length !== 108) {
    throw new Error(`ADJUDICATION_CASE_COUNT_MISMATCH:${document.cases.length}`);
  }

  const ids = new Set(document.cases.map((item) => item.id));
  if (ids.size !== document.cases.length) {
    throw new Error('ADJUDICATION_DUPLICATE_CASE_ID');
  }

  const finalCases = document.cases.filter((item) => item.disposition === 'FINAL');
  const reviewCases = document.cases.filter((item) => item.disposition === 'REVIEW_REQUIRED');
  const unresolvedCases = document.cases.filter((item) => item.disposition === 'UNRESOLVED');

  if (finalCases.length !== 103 || reviewCases.length !== 5 || unresolvedCases.length !== 0) {
    throw new Error(
      `ADJUDICATION_DISPOSITION_MISMATCH:FINAL=${finalCases.length}:` +
        `REVIEW_REQUIRED=${reviewCases.length}:UNRESOLVED=${unresolvedCases.length}`
    );
  }

  for (const item of finalCases) {
    if (typeof item.canonical !== 'string' || item.canonical.length === 0) {
      throw new Error(`ADJUDICATION_FINAL_WITHOUT_CANONICAL:${item.id}`);
    }
    if (item.allowedCanonicals !== undefined) {
      throw new Error(`ADJUDICATION_FINAL_HAS_ALLOWED_CANONICALS:${item.id}`);
    }
  }

  for (const item of reviewCases) {
    if (item.canonical !== undefined) {
      throw new Error(`ADJUDICATION_REVIEW_REQUIRED_HAS_CANONICAL:${item.id}`);
    }
    if (!Array.isArray(item.allowedCanonicals) || item.allowedCanonicals.length < 2) {
      throw new Error(`ADJUDICATION_REVIEW_REQUIRED_WITHOUT_ALTERNATIVES:${item.id}`);
    }
  }

  const expectedReviewIds = new Set([
    'cand-amb-001',
    'cand-amb-003',
    'cand-amb-007',
    'cand-amb-009',
    'cand-amb-011'
  ]);

  for (const item of reviewCases) {
    if (!expectedReviewIds.has(item.id)) {
      throw new Error(`ADJUDICATION_UNEXPECTED_REVIEW_REQUIRED:${item.id}`);
    }
  }

  for (const id of expectedReviewIds) {
    if (!reviewCases.some((item) => item.id === id)) {
      throw new Error(`ADJUDICATION_MISSING_REVIEW_REQUIRED:${id}`);
    }
  }
}

export function validateAcquisitionAlignment(
  adjudication: AdjudicationDocument,
  acquisition: AcquisitionCandidate[]
): void {
  if (acquisition.length !== 108) {
    throw new Error(`ADJUDICATION_SOURCE_CORPUS_COUNT_MISMATCH:${acquisition.length}`);
  }

  const acquisitionById = new Map(acquisition.map((item) => [item.id, item]));
  if (acquisitionById.size !== acquisition.length) {
    throw new Error('ADJUDICATION_SOURCE_CORPUS_DUPLICATE_ID');
  }

  const adjudicationById = new Map(adjudication.cases.map((item) => [item.id, item]));

  for (const [id, source] of acquisitionById) {
    const reviewed = adjudicationById.get(id);
    if (!reviewed) {
      throw new Error(`ADJUDICATION_MISSING_SOURCE_CASE:${id}`);
    }
    if (reviewed.sourceText.normalize('NFC') !== source.sourceText.normalize('NFC')) {
      throw new Error(`ADJUDICATION_SOURCE_TEXT_DRIFT:${id}`);
    }
    if (reviewed.category !== source.category) {
      throw new Error(`ADJUDICATION_CATEGORY_DRIFT:${id}:${source.category}:${reviewed.category}`);
    }
  }

  for (const id of adjudicationById.keys()) {
    if (!acquisitionById.has(id)) {
      throw new Error(`ADJUDICATION_UNKNOWN_SOURCE_CASE:${id}`);
    }
  }
}

export function validateConsolidatedAmendmentLedger(
  adjudication: AdjudicationDocument,
  amendments: AmendmentDocument
): void {
  if (amendments.metadata.engineEvaluationPerformed !== false) {
    throw new Error('ADJUDICATION_AMENDMENT_ENGINE_EVALUATION_MUST_BE_FALSE');
  }

  if (amendments.metadata.status !== 'CONSOLIDATED') {
    throw new Error(`ADJUDICATION_AMENDMENT_STATUS_INVALID:${amendments.metadata.status ?? 'MISSING'}`);
  }

  if (amendments.metadata.consolidatedIntoVersion !== adjudication.metadata.version) {
    throw new Error(
      `ADJUDICATION_AMENDMENT_VERSION_MISMATCH:` +
        `${amendments.metadata.consolidatedIntoVersion ?? 'MISSING'}:${adjudication.metadata.version}`
    );
  }

  const byId = new Map(adjudication.cases.map((item) => [item.id, item]));
  for (const correction of amendments.corrections) {
    const target = byId.get(correction.id);
    if (!target) {
      throw new Error(`ADJUDICATION_AMENDMENT_UNKNOWN_CASE:${correction.id}`);
    }
    if (!equalJson(target[correction.field], correction.to)) {
      throw new Error(
        `ADJUDICATION_AMENDMENT_NOT_CONSOLIDATED:${correction.id}:${correction.field}:` +
          `expected=${JSON.stringify(correction.to)} actual=${JSON.stringify(target[correction.field])}`
      );
    }
  }
}

function main(): void {
  const repositoryRoot = process.cwd();
  const reviewDir = path.join(repositoryRoot, 'validation', 'review');

  const adjudication = readJson<AdjudicationDocument>(path.join(reviewDir, 'adjudication.v1.json'));
  const amendments = readJson<AmendmentDocument>(path.join(reviewDir, 'adjudication-amendments.v1.json'));
  const acquisition = readJson<AcquisitionCandidate[]>(
    path.join(repositoryRoot, 'validation', 'acquisition', 'external-candidates.v1.json')
  );

  validateEffectiveAdjudication(adjudication);
  validateAcquisitionAlignment(adjudication, acquisition);
  validateConsolidatedAmendmentLedger(adjudication, amendments);

  console.log('Adjudication Integrity: PASS');
  console.log('Source Corpus Alignment: PASS');
  console.log('Historical Amendment Consolidation: PASS');
  console.log('Total Cases: 108');
  console.log('FINAL: 103');
  console.log('REVIEW_REQUIRED: 5');
  console.log('UNRESOLVED: 0');
  console.log(`Historical Corrections Verified: ${amendments.corrections.length}`);
  console.log('Engine Evaluation Performed: NO');
  console.log('Human Governance Sign-Off Required: YES');
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main();
}
