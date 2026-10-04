import { DEFAULT_LEXICON_REPOSITORY } from '../data/lexicon';
import {
  CombinedValidationMetrics,
  ReleaseGateContext,
  ReleaseGateResult,
  ReleaseReadiness,
  ValidationMetrics
} from './types';

export interface ReleaseGateOptions {
  context?: ReleaseGateContext;
}

export function evaluateReleaseGates(
  metrics: CombinedValidationMetrics | ValidationMetrics,
  options: ReleaseGateOptions = {}
): ReleaseGateResult {
  const violations: string[] = [];
  const blockers: string[] = [];

  // Default context safely to PILOT / SOURCE_BACKED_FIXTURE if not provided
  const context: ReleaseGateContext = options.context ?? {
    corpusTier: 'PILOT',
    releaseTarget: 'PILOT',
    reviewStatus: 'SOURCE_BACKED_FIXTURE'
  };

  // Lexicon repository validation
  const lexiconReport = DEFAULT_LEXICON_REPOSITORY.validateIntegrity();
  if (!lexiconReport.valid || context.lexiconValid === false) {
    violations.push(
      `DEFAULT LEXICON INTEGRITY FAILURE: Lexicon repository failed validation with errors: ${(lexiconReport.errors || []).join('; ')}`
    );
  }

  if (metrics.falseAuthoritative > 0) {
    violations.push(
      `CRITICAL SAFETY FAILURE: Found ${metrics.falseAuthoritative} FALSE_AUTHORITATIVE case(s) where engine produced incorrect copyable transliteration.`
    );
  }

  if (metrics.underBlocked > 0) {
    violations.push(
      `CRITICAL SAFETY FAILURE: Found ${metrics.underBlocked} UNDER_BLOCKED case(s) where unauthoritative/review-requiring input was made copyable.`
    );
  }

  if (metrics.invalidGoldCases > 0) {
    violations.push(
      `DATA INTEGRITY FAILURE: Found ${metrics.invalidGoldCases} INVALID_GOLD_CASE definition(s).`
    );
  }

  const safetyPassed = violations.length === 0;

  // Ensure combined metrics shape if a plain ValidationMetrics was passed
  const combinedMetrics: CombinedValidationMetrics =
    'single' in metrics
      ? (metrics as CombinedValidationMetrics)
      : {
          total: metrics.total,
          correctAuthoritative: metrics.correctAuthoritative,
          falseAuthoritative: metrics.falseAuthoritative,
          correctReviewRequired: metrics.correctReviewRequired,
          correctUnresolved: metrics.correctUnresolved,
          overBlocked: metrics.overBlocked,
          underBlocked: metrics.underBlocked,
          issueTypeMismatch: metrics.issueTypeMismatch,
          invalidGoldCases: metrics.invalidGoldCases,
          safeBehaviorCount: metrics.safeBehaviorCount,
          safeBehaviorRate: metrics.safeBehaviorRate,
          single: metrics as ValidationMetrics,
          bibliography: {
            total: 0,
            correctAuthoritative: 0,
            falseAuthoritative: 0,
            correctReviewRequired: 0,
            correctUnresolved: 0,
            overBlocked: 0,
            underBlocked: 0,
            safeBehaviorCount: 0,
            safeBehaviorRate: 1
          }
        };

  let readiness: ReleaseReadiness;
  let targetSatisfied = false;

  if (!safetyPassed) {
    readiness = 'BLOCKED';
    targetSatisfied = false;
    blockers.push(...violations);
  } else if (combinedMetrics.total === 0) {
    readiness = 'BLOCKED';
    targetSatisfied = false;
    blockers.push('EMPTY_VALIDATION_CORPUS: No test cases were evaluated. Zero-case corpora cannot satisfy any release target.');
  } else if (context.releaseTarget === 'PILOT') {
    readiness = 'PILOT_PASS';
    targetSatisfied = true;
  } else {
    // context.releaseTarget === 'RC'
    if (context.corpusTier === 'PILOT' || context.reviewStatus === 'SOURCE_BACKED_FIXTURE') {
      readiness = 'REAL_CORPUS_REQUIRED';
      targetSatisfied = false;
      blockers.push('REAL_CORPUS_REQUIRED: Release candidate declaration requires a non-empty REAL_DISSERTATION corpus with verified HUMAN_REVIEWED review status.');
    } else if (
      context.corpusTier === 'REAL_DISSERTATION' &&
      context.reviewStatus === 'HUMAN_REVIEWED'
    ) {
      readiness = 'RC_READY';
      targetSatisfied = true;
    } else {
      readiness = 'REAL_CORPUS_REQUIRED';
      targetSatisfied = false;
      blockers.push('REAL_CORPUS_REQUIRED: Release candidate declaration requires a non-empty REAL_DISSERTATION corpus with verified HUMAN_REVIEWED review status.');
    }
  }

  const passed = targetSatisfied;

  return {
    readiness,
    safetyPassed,
    targetSatisfied,
    passed,
    violations,
    blockers,
    metrics: combinedMetrics,
    context
  };
}
