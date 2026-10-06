import fs from 'node:fs';
import { transliterate } from '../../domain/engine';
import { assertFrozenBenchmarkIntegrityV3, BENCHMARK_V3_PATH } from '../review/goldFreezeV3';
import { validateSingleValidationCorpusV2 } from './schema';
import { evaluateSingleCaseV2 } from './evaluateCase';
import type { ProfileId } from '../../domain/types';
import type { CaseEvaluationResultV2 } from './types';
import type { ValidationClassification } from '../types';

const CLASSIFICATIONS: ValidationClassification[] = [
  'CORRECT_AUTHORITATIVE',
  'FALSE_AUTHORITATIVE',
  'CORRECT_REVIEW_REQUIRED',
  'CORRECT_UNRESOLVED',
  'OVER_BLOCKED',
  'UNDER_BLOCKED',
  'ISSUE_TYPE_MISMATCH',
  'INVALID_GOLD_CASE'
];

export interface Phase46CBaselineSummary {
  total: number;
  authoritativeCases: number;
  reviewRequiredCases: number;
  classifications: Record<ValidationClassification, number>;
  authoritativeExactMatchRate: number | null;
  safeBehaviorRate: number;
  canonicalMismatchCount: number;
  renderingMismatchCount: number;
  bothCanonicalAndRenderingMismatchCount: number;
  falseAuthoritativeCaseIds: string[];
  underBlockedCaseIds: string[];
  overBlockedCaseIds: string[];
  issueTypeMismatchCaseIds: string[];
}

export interface Phase46CBaselineReport {
  schemaVersion: 1;
  artifactType: 'PHASE_4_6C_FROZEN_BASELINE';
  benchmarkId: 'phase4.6b-external-benchmark-v3';
  promotedGoldVersion: '3.0.0';
  sourceBenchmarkGitBlobSha1: string;
  engineEvaluationPerformed: true;
  results: CaseEvaluationResultV2[];
  summary: Phase46CBaselineSummary;
}

function emptyClassificationCounts(): Record<ValidationClassification, number> {
  return Object.fromEntries(CLASSIFICATIONS.map((classification) => [classification, 0])) as Record<
    ValidationClassification,
    number
  >;
}

export function runPhase46CFrozenBaseline(): Phase46CBaselineReport {
  const freeze = assertFrozenBenchmarkIntegrityV3();
  const corpus = validateSingleValidationCorpusV2(
    JSON.parse(fs.readFileSync(BENCHMARK_V3_PATH, 'utf8'))
  );

  const results = corpus.cases.map((testCase) => {
    const profile: ProfileId =
      testCase.profile === 'ijmes_citation_title' ? 'ijmes_citation_title' : 'ijmes_full';
    const engineResult = transliterate(testCase.input, profile);
    return evaluateSingleCaseV2(testCase, engineResult);
  });

  if (results.length !== 108) {
    throw new Error(`PHASE46C_BASELINE_CASE_COUNT_INVALID:${results.length}`);
  }

  const classifications = emptyClassificationCounts();
  for (const result of results) classifications[result.classification] += 1;

  if (classifications.INVALID_GOLD_CASE > 0) {
    throw new Error(`PHASE46C_INVALID_FROZEN_GOLD:${classifications.INVALID_GOLD_CASE}`);
  }

  const authoritativeCases = results.filter((result) => result.expectedDisposition === 'FINAL').length;
  const reviewRequiredCases = results.filter(
    (result) => result.expectedDisposition === 'REVIEW_REQUIRED'
  ).length;
  const canonicalMismatchResults = results.filter((result) =>
    result.reasons.some((reason) => reason.startsWith('CANONICAL_MISMATCH:'))
  );
  const renderingMismatchResults = results.filter((result) =>
    result.reasons.some((reason) => reason.startsWith('RENDERING_MISMATCH:'))
  );
  const bothMismatchCount = results.filter(
    (result) =>
      result.reasons.some((reason) => reason.startsWith('CANONICAL_MISMATCH:')) &&
      result.reasons.some((reason) => reason.startsWith('RENDERING_MISMATCH:'))
  ).length;

  const safeBehaviorCount =
    classifications.CORRECT_AUTHORITATIVE +
    classifications.CORRECT_REVIEW_REQUIRED +
    classifications.CORRECT_UNRESOLVED +
    classifications.OVER_BLOCKED;

  const summary: Phase46CBaselineSummary = {
    total: results.length,
    authoritativeCases,
    reviewRequiredCases,
    classifications,
    authoritativeExactMatchRate:
      authoritativeCases > 0 ? classifications.CORRECT_AUTHORITATIVE / authoritativeCases : null,
    safeBehaviorRate: results.length > 0 ? safeBehaviorCount / results.length : 0,
    canonicalMismatchCount: canonicalMismatchResults.length,
    renderingMismatchCount: renderingMismatchResults.length,
    bothCanonicalAndRenderingMismatchCount: bothMismatchCount,
    falseAuthoritativeCaseIds: results
      .filter((result) => result.classification === 'FALSE_AUTHORITATIVE')
      .map((result) => result.caseId),
    underBlockedCaseIds: results
      .filter((result) => result.classification === 'UNDER_BLOCKED')
      .map((result) => result.caseId),
    overBlockedCaseIds: results
      .filter((result) => result.classification === 'OVER_BLOCKED')
      .map((result) => result.caseId),
    issueTypeMismatchCaseIds: results
      .filter((result) => result.classification === 'ISSUE_TYPE_MISMATCH')
      .map((result) => result.caseId)
  };

  return {
    schemaVersion: 1,
    artifactType: 'PHASE_4_6C_FROZEN_BASELINE',
    benchmarkId: 'phase4.6b-external-benchmark-v3',
    promotedGoldVersion: freeze.promotedGoldVersion,
    sourceBenchmarkGitBlobSha1: freeze.sourceBenchmarkGitBlobSha1,
    engineEvaluationPerformed: true,
    results,
    summary
  };
}
