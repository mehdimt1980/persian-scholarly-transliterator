import { TransliterationResult } from '../../domain/types';
import { ValidationClassification } from '../types';
import { exactUnicodeMatch } from '../evaluateCase';
import { deriveScholarlyCanonicalOutput } from './canonicalOutput';
import { CaseEvaluationResultV2, ScholarlyValidationCaseV2 } from './types';

/**
 * Evaluates a single TransliterationResult against a Validation V2 expectation.
 *
 * Independently validates:
 * 1. Authority / Safety disposition (blocking, copyability, review issue types).
 * 2. Scholarly Canonical Transliteration: source-faithful diacritic-preserving representation.
 * 3. Publication / Profile Rendering: style-dependent presentation output.
 *
 * For a FINAL case, BOTH canonical and rendered expectations must match for CORRECT_AUTHORITATIVE.
 * If either fails, the result is FALSE_AUTHORITATIVE with explicit CANONICAL_MISMATCH and/or
 * RENDERING_MISMATCH reason tags.
 */
export function evaluateSingleCaseV2(
  testCase: ScholarlyValidationCaseV2,
  result: TransliterationResult
): CaseEvaluationResultV2 {
  const expected = testCase.expected;
  const reasons: string[] = [];

  const expectedScholarlyCanonicals: string[] = [];
  if (expected.scholarlyCanonical) {
    expectedScholarlyCanonicals.push(expected.scholarlyCanonical);
  }
  if (expected.allowedScholarlyCanonicals) {
    for (const can of expected.allowedScholarlyCanonicals) {
      if (!expectedScholarlyCanonicals.includes(can)) {
        expectedScholarlyCanonicals.push(can);
      }
    }
  }

  const expectedRenderedOutputs: string[] = [];
  if (expected.renderedOutput) {
    expectedRenderedOutputs.push(expected.renderedOutput);
  }
  if (expected.allowedRenderedOutputs) {
    for (const ren of expected.allowedRenderedOutputs) {
      if (!expectedRenderedOutputs.includes(ren)) {
        expectedRenderedOutputs.push(ren);
      }
    }
  }

  const actualIssueTypes = (result.reviewIssues || []).map((i) => i.type);
  const actualScholarlyCanonical = deriveScholarlyCanonicalOutput(result);
  const actualRenderedOutput = result.output;

  let scholarlyCanonicalMatched: boolean | null = null;
  let renderingMatched: boolean | null = null;
  let classification: ValidationClassification;

  // Case 1: Expected FINAL
  if (expected.disposition === 'FINAL') {
    if (result.copyable) {
      scholarlyCanonicalMatched =
        actualScholarlyCanonical !== null &&
        expectedScholarlyCanonicals.some((can) => exactUnicodeMatch(actualScholarlyCanonical, can));

      renderingMatched =
        expectedRenderedOutputs.some((ren) => exactUnicodeMatch(actualRenderedOutput, ren));

      if (scholarlyCanonicalMatched && renderingMatched) {
        classification = 'CORRECT_AUTHORITATIVE';
      } else {
        classification = 'FALSE_AUTHORITATIVE';
        if (!scholarlyCanonicalMatched) {
          reasons.push(
            `CANONICAL_MISMATCH: Engine produced scholarly canonical "${actualScholarlyCanonical ?? 'null'}" which conflicts with expected gold canonical(s) [${expectedScholarlyCanonicals.map((c) => `"${c}"`).join(', ')}].`
          );
        }
        if (!renderingMatched) {
          reasons.push(
            `RENDERING_MISMATCH: Engine produced rendered output "${actualRenderedOutput}" which conflicts with expected gold rendered output(s) [${expectedRenderedOutputs.map((r) => `"${r}"`).join(', ')}].`
          );
        }
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
            reasons.push(
              `Missing required review issue type "${reqType}". Actual issues: [${actualIssueTypes.join(', ')}].`
            );
          }
        }
      }

      if (expected.forbiddenIssueTypes && expected.forbiddenIssueTypes.length > 0) {
        for (const forbType of expected.forbiddenIssueTypes) {
          if (actualIssueTypes.includes(forbType)) {
            issueTypeMismatch = true;
            reasons.push(
              `Contains forbidden review issue type "${forbType}". Actual issues: [${actualIssueTypes.join(', ')}].`
            );
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
    expectedScholarlyCanonicals,
    expectedRenderedOutputs,
    actualStatus: result.status,
    actualCopyable: result.copyable,
    actualReviewIssueTypes: actualIssueTypes,
    actualScholarlyCanonical,
    actualRenderedOutput,
    scholarlyCanonicalMatched,
    renderingMatched,
    classification,
    reasons,
    provenance: testCase.provenance
  };
}
