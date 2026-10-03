import { ProfileId } from '../types';
import { ReviewIssue, ReviewAlternative, ReviewIssueType, ReviewActionType } from '../review/types';

export type AssistedSuggestionKind =
  | 'EXISTING_LEXICAL_READING'
  | 'MANUAL_CANONICAL'
  | 'IZAFAT_DECISION'
  | 'MORPHOLOGY_BRANCH';

export type AssistedCandidateBasis =
  | 'EXISTING_EVIDENCE'
  | 'CONTEXTUAL_INFERENCE'
  | 'MODEL_INFERENCE';

export type EvidenceRefKind =
  | 'LOCAL_CONTEXT'
  | 'RULE'
  | 'LEXICAL_SOURCE'
  | 'ORTHOGRAPHIC_EVIDENCE'
  | 'MORPHOLOGY_EVIDENCE'
  | 'RELATION_EVIDENCE'
  | 'REVIEW_ALTERNATIVE';

export interface AssistanceEvidenceRef {
  id: string;
  kind: EvidenceRefKind;
  label: string;
}

export interface AssistedApplicabilityResult {
  applicable: boolean;
  reason?: 'STALE_ISSUE' | 'REQUEST_CHANGED' | 'CANDIDATE_NOT_IN_RESOLUTION' | 'ACTION_NOT_ALLOWED' | 'ISSUE_MISMATCH';
  fingerprint?: string;
  expectedFingerprint?: string;
}

export interface ExistingLexicalReadingProposal {
  kind: 'EXISTING_LEXICAL_READING';
  alternativeId: string;
  canonical?: string | null;
  rank: number;
  modelConfidence?: number | null;
  rationale: string;
  basis: AssistedCandidateBasis;
  evidenceRefs: string[];
}

export interface ManualCanonicalProposal {
  kind: 'MANUAL_CANONICAL';
  canonical: string;
  rank: number;
  modelConfidence?: number | null;
  rationale: string;
  basis: AssistedCandidateBasis;
  evidenceRefs: string[];
}

export interface IzafatDecisionProposal {
  kind: 'IZAFAT_DECISION';
  relationDecision: 'ACCEPT_IZAFAT' | 'REJECT_IZAFAT';
  rank: number;
  modelConfidence?: number | null;
  rationale: string;
  basis: AssistedCandidateBasis;
  evidenceRefs: string[];
}

export interface MorphologyBranchProposal {
  kind: 'MORPHOLOGY_BRANCH';
  morphologyBranch: 'WHOLE_WORD' | 'PRODUCTIVE_SEGMENTATION';
  rank: number;
  modelConfidence?: number | null;
  rationale: string;
  basis: AssistedCandidateBasis;
  evidenceRefs: string[];
}

export type AssistedCandidateProposal =
  | ExistingLexicalReadingProposal
  | ManualCanonicalProposal
  | IzafatDecisionProposal
  | MorphologyBranchProposal;

export interface ExistingLexicalReadingCandidate {
  id: string;
  kind: 'EXISTING_LEXICAL_READING';
  alternativeId: string;
  canonical: string;
  rank: number;
  modelConfidence?: number;
  rationale: string;
  basis: AssistedCandidateBasis;
  evidenceRefs: string[];
}

export interface ManualCanonicalCandidate {
  id: string;
  kind: 'MANUAL_CANONICAL';
  canonical: string;
  rank: number;
  modelConfidence?: number;
  rationale: string;
  basis: AssistedCandidateBasis;
  evidenceRefs: string[];
}

export interface IzafatDecisionCandidate {
  id: string;
  kind: 'IZAFAT_DECISION';
  relationDecision: 'ACCEPT_IZAFAT' | 'REJECT_IZAFAT';
  rank: number;
  modelConfidence?: number;
  rationale: string;
  basis: AssistedCandidateBasis;
  evidenceRefs: string[];
}

export interface MorphologyBranchCandidate {
  id: string;
  kind: 'MORPHOLOGY_BRANCH';
  morphologyBranch: 'WHOLE_WORD' | 'PRODUCTIVE_SEGMENTATION';
  canonical?: string;
  rank: number;
  modelConfidence?: number;
  rationale: string;
  basis: AssistedCandidateBasis;
  evidenceRefs: string[];
}

export type AssistedCandidate =
  | ExistingLexicalReadingCandidate
  | ManualCanonicalCandidate
  | IzafatDecisionCandidate
  | MorphologyBranchCandidate;

export interface AssistedResolution {
  issueId: string;
  candidates: AssistedCandidate[];

  provider: string;
  model: string;
  promptVersion: string;

  requestFingerprint: string;
  warnings: string[];
}

export interface BoundedLocalContext {
  before: string[];
  target: string;
  after: string[];
  fullWindow: string;
}

export interface OrthographicEvidencePayload {
  explicitVowels: Array<{
    mark: 'FATHA' | 'KASRA' | 'DAMMA';
    vowel: string;
    afterBaseIndex: number;
    normalizedTokenOffset: number;
    relationOnly: boolean;
    ruleId: string;
  }>;
  unsupportedMarks: Array<{
    mark: string;
    afterBaseIndex: number;
    normalizedTokenOffset: number;
    ruleId: string;
  }>;
  explicitIzafat: 'FINAL_KASRA' | 'HEH_ORTHOGRAPHY' | null;
  zwnjBoundaries: number[];
}

export interface AssistedResolverRequest {
  issueId: string;
  issueType: ReviewIssueType;
  normalizedSurface: string;
  localContext: BoundedLocalContext;
  availableAlternatives: ReviewAlternative[];
  allowedActions: ReviewActionType[];
  orthographicEvidence: OrthographicEvidencePayload;
  morphologyEvidence?: {
    isSegmented: boolean;
    stem?: string;
    morphemes: string[];
    warnings: string[];
  };
  relationEvidence?: {
    source: string;
    target: string;
    relationType: string;
    evidenceKinds: string[];
  };
  evidenceCatalog: AssistanceEvidenceRef[];
  allowedEvidenceRefs: string[];
  lexicalSourceMetadata: string[];
  profile: ProfileId;
  promptVersion: string;
}

export interface AssistedResolverResponse {
  issueId: string;
  candidates: AssistedCandidate[];
  provider: string;
  model: string;
  promptVersion: string;
  requestFingerprint: string;
  warnings: string[];
}

export interface RawProviderResolutionPayload {
  issueId: string;
  candidates: AssistedCandidateProposal[];
  warnings?: string[];
}
