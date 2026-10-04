import { CaseEvaluationResult, ValidationCategoryMetrics, ValidationMetrics } from './types';

function createInitialCategoryMetrics(): ValidationCategoryMetrics {
  return {
    total: 0,
    correctAuthoritative: 0,
    falseAuthoritative: 0,
    correctReviewRequired: 0,
    correctUnresolved: 0,
    overBlocked: 0,
    underBlocked: 0,
    issueTypeMismatch: 0,
    invalidGoldCases: 0,
    authoritativeCases: 0,
    authoritativeExactMatchRate: null,
    safeBehaviorCount: 0,
    safeBehaviorRate: 0
  };
}

function updateCategoryMetrics(
  metrics: ValidationCategoryMetrics,
  res: CaseEvaluationResult
): void {
  metrics.total++;

  if (res.expectedDisposition === 'FINAL') {
    metrics.authoritativeCases++;
  }

  switch (res.classification) {
    case 'CORRECT_AUTHORITATIVE':
      metrics.correctAuthoritative++;
      metrics.safeBehaviorCount++;
      break;
    case 'FALSE_AUTHORITATIVE':
      metrics.falseAuthoritative++;
      break;
    case 'CORRECT_REVIEW_REQUIRED':
      metrics.correctReviewRequired++;
      metrics.safeBehaviorCount++;
      break;
    case 'CORRECT_UNRESOLVED':
      metrics.correctUnresolved++;
      metrics.safeBehaviorCount++;
      break;
    case 'OVER_BLOCKED':
      metrics.overBlocked++;
      metrics.safeBehaviorCount++;
      break;
    case 'UNDER_BLOCKED':
      metrics.underBlocked++;
      break;
    case 'ISSUE_TYPE_MISMATCH':
      metrics.issueTypeMismatch++;
      metrics.safeBehaviorCount++;
      break;
    case 'INVALID_GOLD_CASE':
      metrics.invalidGoldCases++;
      break;
  }

  metrics.safeBehaviorRate = metrics.total > 0 ? metrics.safeBehaviorCount / metrics.total : 0;
  metrics.authoritativeExactMatchRate =
    metrics.authoritativeCases > 0
      ? metrics.correctAuthoritative / metrics.authoritativeCases
      : null;
}

export function computeValidationMetrics(results: CaseEvaluationResult[]): ValidationMetrics {
  const byCategory: Record<string, ValidationCategoryMetrics> = {};
  const byProfile: Record<string, ValidationCategoryMetrics> = {};

  const totalMetrics = createInitialCategoryMetrics();

  for (const res of results) {
    updateCategoryMetrics(totalMetrics, res);

    if (!byCategory[res.category]) {
      byCategory[res.category] = createInitialCategoryMetrics();
    }
    updateCategoryMetrics(byCategory[res.category], res);

    if (!byProfile[res.profile]) {
      byProfile[res.profile] = createInitialCategoryMetrics();
    }
    updateCategoryMetrics(byProfile[res.profile], res);
  }

  return {
    total: totalMetrics.total,
    correctAuthoritative: totalMetrics.correctAuthoritative,
    falseAuthoritative: totalMetrics.falseAuthoritative,
    correctReviewRequired: totalMetrics.correctReviewRequired,
    correctUnresolved: totalMetrics.correctUnresolved,
    overBlocked: totalMetrics.overBlocked,
    underBlocked: totalMetrics.underBlocked,
    issueTypeMismatch: totalMetrics.issueTypeMismatch,
    invalidGoldCases: totalMetrics.invalidGoldCases,
    authoritativeCases: totalMetrics.authoritativeCases,
    authoritativeExactMatchRate: totalMetrics.authoritativeExactMatchRate,
    safeBehaviorCount: totalMetrics.safeBehaviorCount,
    safeBehaviorRate: totalMetrics.safeBehaviorRate,
    byCategory,
    byProfile
  };
}
