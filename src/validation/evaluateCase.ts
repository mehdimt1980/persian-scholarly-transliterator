import { TransliterationResult } from '../domain/types';
import { CaseEvaluationResult, ScholarlyValidationCase, ValidationClassification } from './types';

/**
 * Compares two transliteration strings with exact Unicode equality (NFC normalized).
 * Does NOT strip whitespace, diacritics, or lower/upper case.
 */
export function exactUnicodeMatch(actual: string, expected: string): boolean {
  return actual.normalize('NFC') === expected.normalize('NFC');
}

export function evaluateSingleCase(
  testCase: ScholarlyValidationCase,
  result: TransliterationResult
): CaseEvaluationResult {
  const expected = testCase.expected;
  const reasons: string[] = [];

  const expectedCanonicals: string[] = [];
  if (expected.canonical) {
    expectedCanonicals.push(expected.canonical);
  }
  if (expected.allowedCanonicals) {
    for (const can of expected.allowedCanonicals) {
      if (!expectedCanonicals.includes(can)) {
        expectedCanonicals.push(can);
      }
    }
  }

  const actualIssueTypes = (result.reviewIssues || []).map((i) => i.type);

  let classification: ValidationClassification;

  // Case 1: Expected FINAL
  if (expected.disposition === 'FINAL') {
    if (result.copyable) {
      const isMatch = expectedCanonicals.some((can) => exactUnicodeMatch(result.output, can));
      if (isMatch) {
        classification = 'CORRECT_AUTHORITATIVE';
      } else {
        classification = 'FALSE_AUTHORITATIVE';
        reasons.push(
          `Engine produced copyable output "${result.output}" which conflicts with expected gold canonical(s) [${expectedCanonicals.map((c) => `"${c}"`).join(', ')}].`
        );
      }
    } else {
      classification = 'OVER_BLOCKED';
      reasons.push(
        `Gold expectation is FINAL, but engine blocked authority (status: ${result.status}, copyable: ${result.copyable}, issues: [${actualIssueTypes.join(', ')}]).`
      );
    }
  }
  // Case 2: Expected REVIEW_REQUIRED
  else if (expected.disposition === 'REVIEW_REQUIRED') {
    if (result.copyable) {
      classification = 'UNDER_BLOCKED';
      reasons.push(
        `Gold expectation requires human review, but engine produced copyable authoritative output "${result.output}" (status: ${result.status}).`
      );
    } else {
      let issueTypeMismatch = false;
      if (expected.requiredIssueTypes && expected.requiredIssueTypes.length > 0) {
        for (const reqType of expected.requiredIssueTypes) {
          if (!actualIssueTypes.includes(reqType)) {
            issueTypeMismatch = true;
            reasons.push(`Missing required review issue type "${reqType}". Actual issues: [${actualIssueTypes.join(', ')}].`);
          }
        }
      }

      if (expected.forbiddenIssueTypes && expected.forbiddenIssueTypes.length > 0) {
        for (const forbType of expected.forbiddenIssueTypes) {
          if (actualIssueTypes.includes(forbType)) {
            issueTypeMismatch = true;
            reasons.push(`Contains forbidden review issue type "${forbType}". Actual issues: [${actualIssueTypes.join(', ')}].`);
          }
        }
      }

      if (issueTypeMismatch) {
        classification = 'ISSUE_TYPE_MISMATCH';
      } else {
        classification = 'CORRECT_REVIEW_REQUIRED';
      }
    }
  }
  // Case 3: Expected UNRESOLVED
  else if (expected.disposition === 'UNRESOLVED') {
    if (result.copyable) {
      classification = 'UNDER_BLOCKED';
      reasons.push(
        `Gold expectation is UNRESOLVED, but engine produced copyable authoritative output "${result.output}" (status: ${result.status}).`
      );
    } else {
      classification = 'CORRECT_UNRESOLVED';
    }
  } else {
    classification = 'INVALID_GOLD_CASE';
    reasons.push(`Unknown expected disposition: "${(expected as any).disposition}".`);
  }

  return {
    caseId: testCase.id,
    input: testCase.input,
    profile: testCase.profile,
    category: testCase.category,
    expectedDisposition: expected.disposition,
    expectedCanonicals,
    actualStatus: result.status,
    actualOutput: result.output,
    actualCopyable: result.copyable,
    actualReviewIssueTypes: actualIssueTypes,
    classification,
    reasons,
    provenance: testCase.provenance
  };
}
