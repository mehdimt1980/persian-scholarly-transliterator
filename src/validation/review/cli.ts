import fs from 'node:fs';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;

interface AdjudicationCase extends JsonRecord {
  id: string;
  disposition: 'FINAL' | 'REVIEW_REQUIRED' | 'UNRESOLVED';
  canonical?: string;
  allowedCanonicals?: string[];
}

interface AdjudicationDocument {
  metadata: JsonRecord & {
    engineEvaluationPerformed: boolean;
    status: string;
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
  metadata: JsonRecord;
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

export function consolidateAdjudication(
  base: AdjudicationDocument,
  amendments: AmendmentDocument
): AdjudicationDocument {
  const result = structuredClone(base);
  const byId = new Map(result.cases.map((item) => [item.id, item]));

  if (byId.size !== result.cases.length) {
    throw new Error('ADJUDICATION_DUPLICATE_CASE_ID');
  }

  for (const correction of amendments.corrections) {
    const target = byId.get(correction.id);
    if (!target) {
      throw new Error(`ADJUDICATION_AMENDMENT_UNKNOWN_CASE:${correction.id}`);
    }

    const current = target[correction.field];
    if (!equalJson(current, correction.from)) {
      throw new Error(
        `ADJUDICATION_AMENDMENT_STALE:${correction.id}:${correction.field}:` +
          `expected=${JSON.stringify(correction.from)} actual=${JSON.stringify(current)}`
      );
    }

    target[correction.field] = structuredClone(correction.to);
  }

  result.metadata = {
    ...result.metadata,
    version: '1.0.2-consolidated',
    status: 'EXPERT_ADJUDICATED_PENDING_HUMAN_SIGNOFF',
    amendmentsApplied: amendments.corrections.length,
    amendmentSource: 'validation/review/adjudication-amendments.v1.json',
    engineEvaluationPerformed: false
  };

  return result;
}

export function validateEffectiveAdjudication(document: AdjudicationDocument): void {
  if (document.metadata.engineEvaluationPerformed !== false) {
    throw new Error('ADJUDICATION_ENGINE_EVALUATION_MUST_BE_FALSE');
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

function main(): void {
  const repositoryRoot = process.cwd();
  const reviewDir = path.join(repositoryRoot, 'validation', 'review');
  const basePath = path.join(reviewDir, 'adjudication.v1.json');
  const amendmentsPath = path.join(reviewDir, 'adjudication-amendments.v1.json');

  const base = readJson<AdjudicationDocument>(basePath);
  const amendments = readJson<AmendmentDocument>(amendmentsPath);
  const effective = consolidateAdjudication(base, amendments);
  validateEffectiveAdjudication(effective);

  const shouldWrite = process.argv.includes('--write');
  if (shouldWrite) {
    const outputPath = path.join(reviewDir, 'adjudication.consolidated.v1.json');
    fs.writeFileSync(outputPath, `${JSON.stringify(effective, null, 2)}\n`, 'utf8');
    console.log(`Consolidated adjudication written: ${path.relative(repositoryRoot, outputPath)}`);
  }

  console.log('Adjudication Integrity: PASS');
  console.log('Total Cases: 108');
  console.log('FINAL: 103');
  console.log('REVIEW_REQUIRED: 5');
  console.log('UNRESOLVED: 0');
  console.log(`Amendments Applied: ${amendments.corrections.length}`);
  console.log('Engine Evaluation Performed: NO');
  console.log('Human Governance Sign-Off Required: YES');
}

if (process.argv[1]) {
  main();
}
