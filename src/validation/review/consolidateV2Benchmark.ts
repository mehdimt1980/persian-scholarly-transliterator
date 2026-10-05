import fs from 'node:fs';
import path from 'node:path';
import type {
  ValidationProvenanceKind,
  ValidationSource
} from '../types';
import type {
  ScholarlyValidationCaseV2,
  SingleValidationCorpusV2
} from '../v2/types';
import { validateSingleValidationCorpusV2 } from '../v2/schema';
import type {
  ReauditDecision,
  ReauditEvidence,
  ReauditWorklistCase,
  ReauditWorklistDocument
} from './reauditWorklist';

export const REAUDIT_WORKLIST_PATH = path.join(
  process.cwd(),
  'validation/review/reaudit-worklist.v2.json'
);

export const CONSOLIDATED_V2_BENCHMARK_PATH = path.join(
  process.cwd(),
  'validation/corpus/phase4.6b-external-benchmark.v2.json'
);

export const EXPECTED_REVIEW_REQUIRED_IDS = [
  'cand-amb-001',
  'cand-amb-003',
  'cand-amb-007',
  'cand-amb-009',
  'cand-amb-011'
] as const;

function provenanceKindFor(source: string): ValidationProvenanceKind {
  const normalized = source.toLowerCase();
  if (normalized.includes('ijmes') || normalized.includes('cambridge')) {
    return 'IJMES_GUIDE';
  }
  if (
    normalized.includes('dehkhoda') ||
    normalized.includes('steingass') ||
    normalized.includes('dictionary') ||
    normalized.includes('lexicon')
  ) {
    return 'SCHOLARLY_DICTIONARY';
  }
  if (normalized.includes('iranica') || normalized.includes('encyclop')) {
    return 'ENCYCLOPEDIA';
  }
  return 'ACADEMIC_SOURCE';
}

function evidenceToSource(evidence: ReauditEvidence, role: 'reading' | 'rendering'): ValidationSource {
  return {
    kind: provenanceKindFor(evidence.source),
    citation: evidence.citation,
    locator: evidence.locator,
    note: `Original source label: ${evidence.source}; evidence role: ${role}.`
  };
}

function decisionSources(decision: ReauditDecision): ValidationSource[] {
  const sources: ValidationSource[] = decision.readingEvidence.map((evidence) =>
    evidenceToSource(evidence, 'reading')
  );

  if ('renderingEvidence' in decision && decision.renderingEvidence) {
    sources.push(
      ...decision.renderingEvidence.map((evidence) => evidenceToSource(evidence, 'rendering'))
    );
  }

  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.kind}\u0000${source.citation}\u0000${source.locator ?? ''}\u0000${source.note ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCase(worklistCase: ReauditWorklistCase): ScholarlyValidationCaseV2 {
  const decision = worklistCase.decision;
  if (worklistCase.reviewState !== 'COMPLETED' || decision === null) {
    throw new Error(`CONSOLIDATION_CASE_NOT_COMPLETED:${worklistCase.id}`);
  }

  const expected: ScholarlyValidationCaseV2['expected'] = {
    disposition: decision.disposition
  };

  if (decision.disposition === 'FINAL') {
    expected.scholarlyCanonical = decision.scholarlyCanonical;
    expected.renderedOutput = decision.renderedOutput;
  } else if (decision.disposition === 'REVIEW_REQUIRED') {
    expected.requiredIssueTypes = ['LEXICAL_AMBIGUITY'];
  }

  return {
    id: worklistCase.id,
    input: worklistCase.sourceText,
    profile: worklistCase.profile as ScholarlyValidationCaseV2['profile'],
    category: worklistCase.category as ScholarlyValidationCaseV2['category'],
    expected,
    provenance: {
      sources: decisionSources(decision),
      reviewNote: `${decision.reviewNote} Reviewer provenance: ${decision.reviewer.name} / ${decision.reviewer.type}; reviewedAt ${decision.reviewer.reviewedAt}.`
    },
    tags: [
      'phase4.6b',
      'external-benchmark-v2',
      `batch-${worklistCase.batch.toLowerCase()}`,
      'ai-specialist-reviewed',
      'human-signoff-pending'
    ]
  };
}

function assertWorklistReadyForConsolidation(worklist: ReauditWorklistDocument): void {
  if (worklist.metadata.status !== 'BATCH_E_COMPLETED') {
    throw new Error(`CONSOLIDATION_WORKLIST_STATUS_INVALID:${worklist.metadata.status}`);
  }
  if (worklist.metadata.engineEvaluationPerformed !== false) {
    throw new Error('CONSOLIDATION_ENGINE_EVALUATION_MUST_REMAIN_FALSE');
  }
  if (worklist.metadata.humanSignoff !== null) {
    throw new Error('CONSOLIDATION_HUMAN_SIGNOFF_MUST_REMAIN_NULL');
  }
  if (worklist.metadata.priorAdjudicationAuthority !== 'HISTORICAL_ONLY') {
    throw new Error('CONSOLIDATION_V1_AUTHORITY_MUST_REMAIN_HISTORICAL_ONLY');
  }
  if (
    worklist.summary.total !== 108 ||
    worklist.summary.adjudicated !== 108 ||
    worklist.summary.pending !== 0 ||
    worklist.cases.length !== 108
  ) {
    throw new Error('CONSOLIDATION_WORKLIST_COUNTS_INVALID');
  }
}

export function buildConsolidatedV2Benchmark(
  worklist: ReauditWorklistDocument
): SingleValidationCorpusV2 {
  assertWorklistReadyForConsolidation(worklist);

  const cases = worklist.cases.map(buildCase);
  const dispositionCounts = cases.reduce(
    (counts, testCase) => {
      counts[testCase.expected.disposition] += 1;
      return counts;
    },
    { FINAL: 0, REVIEW_REQUIRED: 0, UNRESOLVED: 0 }
  );

  if (
    dispositionCounts.FINAL !== 103 ||
    dispositionCounts.REVIEW_REQUIRED !== 5 ||
    dispositionCounts.UNRESOLVED !== 0
  ) {
    throw new Error(
      `CONSOLIDATION_DISPOSITION_COUNTS_INVALID:${JSON.stringify(dispositionCounts)}`
    );
  }

  const actualReviewRequiredIds = cases
    .filter((testCase) => testCase.expected.disposition === 'REVIEW_REQUIRED')
    .map((testCase) => testCase.id)
    .sort();
  const expectedReviewRequiredIds = [...EXPECTED_REVIEW_REQUIRED_IDS].sort();
  if (JSON.stringify(actualReviewRequiredIds) !== JSON.stringify(expectedReviewRequiredIds)) {
    throw new Error(
      `CONSOLIDATION_REVIEW_REQUIRED_IDS_INVALID:${actualReviewRequiredIds.join(',')}`
    );
  }

  const corpus: SingleValidationCorpusV2 = {
    schemaVersion: 2,
    metadata: {
      id: 'phase4.6b-external-benchmark-v2',
      version: '2.0.0-draft',
      description:
        '108-case external Persian scholarly transliteration benchmark consolidated from the blind Phase 4.6B Validation V2 re-audit.',
      tier: 'EXTERNAL_BENCHMARK',
      reviewStatus: 'AI_SPECIALIST_REVIEWED_PENDING_HUMAN',
      reviewer: 'OpenAI GPT-5.6 Sol / AI_SPECIALIST',
      reviewedAt: '2026-10-05',
      reviewNote:
        'Blind specialist re-audit complete: 103 FINAL, 5 REVIEW_REQUIRED, 0 UNRESOLVED. humanSignoff=null; gold is not frozen; engineEvaluationPerformed=false. Explicit human governance sign-off is required before gold freeze or Phase 4.6C engine evaluation.'
    },
    cases
  };

  return validateSingleValidationCorpusV2(corpus);
}

export function loadReauditWorklist(): ReauditWorklistDocument {
  return JSON.parse(fs.readFileSync(REAUDIT_WORKLIST_PATH, 'utf8')) as ReauditWorklistDocument;
}

export function readConsolidatedV2Benchmark(): SingleValidationCorpusV2 {
  return validateSingleValidationCorpusV2(
    JSON.parse(fs.readFileSync(CONSOLIDATED_V2_BENCHMARK_PATH, 'utf8'))
  );
}

export function writeConsolidatedV2Benchmark(corpus: SingleValidationCorpusV2): void {
  fs.writeFileSync(
    CONSOLIDATED_V2_BENCHMARK_PATH,
    `${JSON.stringify(corpus, null, 2)}\n`,
    'utf8'
  );
}

export function assertCommittedBenchmarkMatchesWorklist(
  worklist: ReauditWorklistDocument,
  committed: SingleValidationCorpusV2
): void {
  const expected = buildConsolidatedV2Benchmark(worklist);
  if (JSON.stringify(committed) !== JSON.stringify(expected)) {
    throw new Error('CONSOLIDATED_V2_BENCHMARK_OUT_OF_SYNC_WITH_WORKLIST');
  }
}
