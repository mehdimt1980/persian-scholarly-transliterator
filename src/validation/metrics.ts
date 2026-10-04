import {
  BibliographyCaseEvaluationResult,
  BibliographyValidationMetrics,
  CaseEvaluationResult,
  CombinedValidationMetrics,
  ValidationCategoryMetrics,
  ValidationMetrics
} from './types';

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
      // CRITICAL: ISSUE_TYPE_MISMATCH is NOT counted as safe behavior
      metrics.issueTypeMismatch++;
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

export function computeBibliographyValidationMetrics(
  results: BibliographyCaseEvaluationResult[]
): BibliographyValidationMetrics {
  let correctAuthoritative = 0;
  let falseAuthoritative = 0;
  let correctReviewRequired = 0;
  let correctUnresolved = 0;
  let overBlocked = 0;
  let underBlocked = 0;
  let safeBehaviorCount = 0;

  for (const res of results) {
    switch (res.classification) {
      case 'CORRECT_AUTHORITATIVE':
        correctAuthoritative++;
        safeBehaviorCount++;
        break;
      case 'FALSE_AUTHORITATIVE':
        falseAuthoritative++;
        break;
      case 'CORRECT_REVIEW_REQUIRED':
        correctReviewRequired++;
        safeBehaviorCount++;
        break;
      case 'CORRECT_UNRESOLVED':
        correctUnresolved++;
        safeBehaviorCount++;
        break;
      case 'OVER_BLOCKED':
        overBlocked++;
        safeBehaviorCount++;
        break;
      case 'UNDER_BLOCKED':
        underBlocked++;
        break;
    }
  }

  const total = results.length;
  const safeBehaviorRate = total > 0 ? safeBehaviorCount / total : 0;

  return {
    total,
    correctAuthoritative,
    falseAuthoritative,
    correctReviewRequired,
    correctUnresolved,
    overBlocked,
    underBlocked,
    safeBehaviorCount,
    safeBehaviorRate
  };
}

export function computeCombinedValidationMetrics(
  single: ValidationMetrics | CaseEvaluationResult[],
  bibliography: BibliographyValidationMetrics | BibliographyCaseEvaluationResult[]
): CombinedValidationMetrics {
  const singleMetrics = Array.isArray(single) ? computeValidationMetrics(single) : single;
  const bibMetrics = Array.isArray(bibliography)
    ? computeBibliographyValidationMetrics(bibliography)
    : bibliography;

  const total = singleMetrics.total + bibMetrics.total;
  const correctAuthoritative =
    singleMetrics.correctAuthoritative + bibMetrics.correctAuthoritative;
  const falseAuthoritative =
    singleMetrics.falseAuthoritative + bibMetrics.falseAuthoritative;
  const correctReviewRequired =
    singleMetrics.correctReviewRequired + bibMetrics.correctReviewRequired;
  const correctUnresolved =
    singleMetrics.correctUnresolved + bibMetrics.correctUnresolved;
  const overBlocked = singleMetrics.overBlocked + bibMetrics.overBlocked;
  const underBlocked = singleMetrics.underBlocked + bibMetrics.underBlocked;
  const issueTypeMismatch = singleMetrics.issueTypeMismatch;
  const invalidGoldCases = singleMetrics.invalidGoldCases;
  const safeBehaviorCount =
    singleMetrics.safeBehaviorCount + bibMetrics.safeBehaviorCount;
  const safeBehaviorRate = total > 0 ? safeBehaviorCount / total : 0;

  return {
    total,
    correctAuthoritative,
    falseAuthoritative,
    correctReviewRequired,
    correctUnresolved,
    overBlocked,
    underBlocked,
    issueTypeMismatch,
    invalidGoldCases,
    safeBehaviorCount,
    safeBehaviorRate,
    single: singleMetrics,
    bibliography: bibMetrics
  };
}
