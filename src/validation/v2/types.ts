import { ProfileId } from '../../domain/types';
import { ReviewIssueType } from '../../domain/review/types';
import {
  ScholarlyCategory,
  ValidationExpectedDisposition,
  ValidationProvenance,
  CorpusMetadata,
  ValidationClassification
} from '../types';

/**
 * Validation V2 expectation contract.
 *
 * Explicitly separates:
 * 1. Scholarly Canonical Transliteration: source-faithful, diacritic-preserving representation
 *    under the scholarly transliteration scheme.
 * 2. Publication / Profile Rendering: style-dependent presentation output.
 *
 * For disposition = 'FINAL', BOTH dimensions must be explicitly provided.
 * For disposition = 'REVIEW_REQUIRED' or 'UNRESOLVED', neither dimension may be present.
 */
export interface ScholarlyValidationExpectationV2 {
  disposition: ValidationExpectedDisposition;

  /** Single accepted scholarly canonical transliteration */
  scholarlyCanonical?: string;
  /** Disjunctive list of accepted scholarly canonical transliterations (mutually exclusive with scholarlyCanonical) */
  allowedScholarlyCanonicals?: string[];

  /** Single accepted publication rendered output */
  renderedOutput?: string;
  /** Disjunctive list of accepted publication rendered outputs (mutually exclusive with renderedOutput) */
  allowedRenderedOutputs?: string[];

  /** Mandatory review issue types when disposition === 'REVIEW_REQUIRED' */
  requiredIssueTypes?: ReviewIssueType[];
  /** Forbidden review issue types when disposition === 'REVIEW_REQUIRED' */
  forbiddenIssueTypes?: ReviewIssueType[];
}

/**
 * Individual test case under the Validation V2 contract.
 */
export interface ScholarlyValidationCaseV2 {
  id: string;
  input: string;
  profile: ProfileId;
  category: ScholarlyCategory;
  expected: ScholarlyValidationExpectationV2;
  provenance: ValidationProvenance;
  tags?: string[];
}

/**
 * Validation V2 adds governance states needed by the external benchmark without
 * widening legacy V1 release-gate types. The benchmark cannot masquerade as a
 * real dissertation corpus or as human-reviewed gold before explicit sign-off.
 */
export type ValidationV2CorpusTier = CorpusMetadata['tier'] | 'EXTERNAL_BENCHMARK';

export type ValidationV2CorpusReviewStatus =
  | CorpusMetadata['reviewStatus']
  | 'AI_SPECIALIST_REVIEWED_PENDING_HUMAN';

export interface ValidationV2CorpusMetadata
  extends Omit<CorpusMetadata, 'tier' | 'reviewStatus'> {
  tier: ValidationV2CorpusTier;
  reviewStatus: ValidationV2CorpusReviewStatus;
}

/**
 * Versioned single validation corpus under the V2 schema.
 */
export interface SingleValidationCorpusV2 {
  schemaVersion: 2;
  metadata: ValidationV2CorpusMetadata;
  cases: ScholarlyValidationCaseV2[];
}

/**
 * Evaluation result for a V2 validation case, recording both canonical and rendered dimensions.
 */
export interface CaseEvaluationResultV2 {
  caseId: string;
  input: string;
  profile: ProfileId;
  category: ScholarlyCategory;
  expectedDisposition: ValidationExpectedDisposition;

  expectedScholarlyCanonicals: string[];
  expectedRenderedOutputs: string[];

  actualStatus: string;
  actualCopyable: boolean;
  actualReviewIssueTypes: ReviewIssueType[];

  actualScholarlyCanonical: string | null;
  actualRenderedOutput: string;

  scholarlyCanonicalMatched: boolean | null;
  renderingMatched: boolean | null;

  classification: ValidationClassification;
  reasons: string[];
  provenance: ValidationProvenance;
}
