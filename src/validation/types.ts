import { ProfileId } from '../domain/types';
import { ReviewIssueType, ReviewDecision } from '../domain/review/types';
import { BibliographyRecord, BibliographyRecordReadiness, BibliographyFieldPath } from '../domain/bibliography/types';

export type ValidationExpectedDisposition =
  | 'FINAL'
  | 'REVIEW_REQUIRED'
  | 'UNRESOLVED';

export type ScholarlyCategory =
  | 'TERM'
  | 'PERSON'
  | 'PLACE'
  | 'BOOK_TITLE'
  | 'ARTICLE_TITLE'
  | 'INSTITUTION'
  | 'LEGAL_TERM'
  | 'RELIGIOUS_TERM'
  | 'COMPOUND'
  | 'MORPHOLOGY'
  | 'IZAFAT'
  | 'AMBIGUITY'
  | 'MIXED_SCRIPT'
  | 'OTHER';

export type ValidationProvenanceKind =
  | 'IJMES_GUIDE'
  | 'SCHOLARLY_DICTIONARY'
  | 'ENCYCLOPEDIA'
  | 'ACADEMIC_SOURCE'
  | 'DISSERTATION_REVIEW'
  | 'PROJECT_REVIEW';

export interface ValidationSource {
  kind: ValidationProvenanceKind;
  citation: string;
  locator?: string;
  note?: string;
}

export interface ValidationProvenance {
  sources: ValidationSource[];
  reviewNote?: string;
}

export interface ScholarlyValidationCase {
  id: string;
  input: string;
  profile: ProfileId;
  category: ScholarlyCategory;

  expected: {
    disposition: ValidationExpectedDisposition;
    canonical?: string;
    allowedCanonicals?: string[];
    requiredIssueTypes?: ReviewIssueType[];
    forbiddenIssueTypes?: ReviewIssueType[];
  };

  provenance: ValidationProvenance;
  tags?: string[];
}

export type CorpusTier =
  | 'PILOT'
  | 'REAL_DISSERTATION';

export type ReleaseTarget =
  | 'PILOT'
  | 'RC';

export type CorpusReviewStatus =
  | 'SOURCE_BACKED_FIXTURE'
  | 'HUMAN_REVIEWED';

export interface CorpusMetadata {
  id: string;
  version: string;
  description: string;
  tier: CorpusTier;
  reviewStatus: CorpusReviewStatus;
  reviewer?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface CorpusManifest {
  id: string;
  version: string;
  description: string;
  tier: CorpusTier;
  reviewStatus: CorpusReviewStatus;
  reviewer?: string;
  reviewedAt?: string;
  reviewNote?: string;
  single?: string;
  bibliography?: string;
}

export interface SingleValidationCorpus {
  metadata: CorpusMetadata;
  cases: ScholarlyValidationCase[];
}

export type ValidationClassification =
  | 'CORRECT_AUTHORITATIVE'
  | 'FALSE_AUTHORITATIVE'
  | 'CORRECT_REVIEW_REQUIRED'
  | 'CORRECT_UNRESOLVED'
  | 'OVER_BLOCKED'
  | 'UNDER_BLOCKED'
  | 'ISSUE_TYPE_MISMATCH'
  | 'INVALID_GOLD_CASE';

export interface CaseEvaluationResult {
  caseId: string;
  input: string;
  profile: ProfileId;
  category: ScholarlyCategory;
  expectedDisposition: ValidationExpectedDisposition;
  expectedCanonicals: string[];
  actualStatus: string;
  actualOutput: string;
  actualCopyable: boolean;
  actualReviewIssueTypes: ReviewIssueType[];
  classification: ValidationClassification;
  reasons: string[];
  provenance: ValidationProvenance;
}

export interface ValidationCategoryMetrics {
  total: number;
  correctAuthoritative: number;
  falseAuthoritative: number;
  correctReviewRequired: number;
  correctUnresolved: number;
  overBlocked: number;
  underBlocked: number;
  issueTypeMismatch: number;
  invalidGoldCases: number;

  authoritativeCases: number;
  authoritativeExactMatchRate: number | null;

  safeBehaviorCount: number;
  safeBehaviorRate: number;
}

export interface ValidationMetrics {
  total: number;

  correctAuthoritative: number;
  falseAuthoritative: number;

  correctReviewRequired: number;
  correctUnresolved: number;

  overBlocked: number;
  underBlocked: number;
  issueTypeMismatch: number;
  invalidGoldCases: number;

  authoritativeCases: number;
  authoritativeExactMatchRate: number | null;

  safeBehaviorCount: number;
  safeBehaviorRate: number;

  byCategory: Record<string, ValidationCategoryMetrics>;
  byProfile: Record<string, ValidationCategoryMetrics>;
}

export interface BibliographyValidationMetrics {
  total: number;
  correctAuthoritative: number;
  falseAuthoritative: number;
  correctReviewRequired: number;
  correctUnresolved: number;
  overBlocked: number;
  underBlocked: number;
  safeBehaviorCount: number;
  safeBehaviorRate: number;
}

export interface CombinedValidationMetrics {
  total: number;
  correctAuthoritative: number;
  falseAuthoritative: number;
  correctReviewRequired: number;
  correctUnresolved: number;
  overBlocked: number;
  underBlocked: number;
  issueTypeMismatch: number;
  invalidGoldCases: number;
  safeBehaviorCount: number;
  safeBehaviorRate: number;
  single: ValidationMetrics;
  bibliography: BibliographyValidationMetrics;
}

export type ReleaseReadiness =
  | 'BLOCKED'
  | 'PILOT_PASS'
  | 'REAL_CORPUS_REQUIRED'
  | 'RC_READY';

export interface ReleaseGateContext {
  corpusTier: CorpusTier;
  releaseTarget: ReleaseTarget;
  reviewStatus: CorpusReviewStatus;
  lexiconValid?: boolean;
}

export interface ReleaseGateResult {
  readiness: ReleaseReadiness;
  safetyPassed: boolean;
  targetSatisfied: boolean;
  passed: boolean; // passed === targetSatisfied
  violations: string[];
  blockers: string[];
  metrics: CombinedValidationMetrics;
  context: ReleaseGateContext;
}

// Bibliography validation types
export interface BibliographyValidationDecisionFixture {
  recordId: string;
  fieldPath: BibliographyFieldPath;
  decision: ReviewDecision;
}

export interface BibliographyValidationCase {
  id: string;
  record: BibliographyRecord;
  reviewDecisions?: BibliographyValidationDecisionFixture[];
  expected: {
    readiness: BibliographyRecordReadiness;
    fields?: Record<
      string,
      {
        finalText?: string;
        disposition:
          | 'FINAL'
          | 'REVIEW_REQUIRED'
          | 'UNRESOLVED'
          | 'PASSTHROUGH';
      }
    >;
  };
  provenance: ValidationProvenance;
  tags?: string[];
}

export interface BibliographyValidationCorpus {
  metadata: CorpusMetadata;
  cases: BibliographyValidationCase[];
}

export interface BibliographyCaseEvaluationResult {
  caseId: string;
  recordId: string;
  expectedReadiness: BibliographyRecordReadiness;
  actualReadiness: BibliographyRecordReadiness;
  classification: ValidationClassification;
  reasons: string[];
  provenance: ValidationProvenance;
  fieldEvaluations: Array<{
    fieldPath: string;
    expectedDisposition: string;
    expectedFinalText?: string;
    actualStatus: string;
    actualFinalText: string | null;
    passed: boolean;
    reason?: string;
  }>;
}
