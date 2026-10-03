import { ProfileId } from '../types';
import { ReviewIssue, ReviewAlternative, ReviewIssueType } from '../review/types';
import { RuleDefinition } from '../types';

export type AssistedSuggestionKind =
  | 'EXISTING_LEXICAL_READING'
  | 'MANUAL_CANONICAL'
  | 'IZAFAT_DECISION'
  | 'MORPHOLOGY_BRANCH';

export type AssistedCandidateBasis =
  | 'EXISTING_EVIDENCE'
  | 'CONTEXTUAL_INFERENCE'
  | 'MODEL_INFERENCE';

export interface AssistedCandidate {
  id: string;
  kind: AssistedSuggestionKind;

  canonical?: string;
  alternativeId?: string;

  relationDecision?: 'ACCEPT_IZAFAT' | 'REJECT_IZAFAT';
  morphologyBranch?: 'WHOLE_WORD' | 'PRODUCTIVE_SEGMENTATION';

  rank: number;
  modelConfidence?: number;

  rationale: string;
  basis: AssistedCandidateBasis;

  evidenceRefs: string[];
}

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

export interface AssistedResolverRequest {
  issueId: string;
  issueType: ReviewIssueType;
  normalizedSurface: string;
  localContext: BoundedLocalContext;
  availableAlternatives: ReviewAlternative[];
  orthographicEvidence: {
    combiningMarks: string[];
    unsupportedMarks: string[];
  };
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
  lexicalSourceMetadata: string[];
  profile: ProfileId;
  allowedEvidenceRefs: string[];
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

export interface AssistedCandidateProposal {
  kind: AssistedSuggestionKind;
  canonical?: string;
  alternativeId?: string;
  relationDecision?: 'ACCEPT_IZAFAT' | 'REJECT_IZAFAT';
  morphologyBranch?: 'WHOLE_WORD' | 'PRODUCTIVE_SEGMENTATION';
  rank: number;
  modelConfidence?: number;
  rationale: string;
  basis: AssistedCandidateBasis;
  evidenceRefs: string[];
}

export interface RawProviderResolutionPayload {
  issueId: string;
  candidates: AssistedCandidateProposal[];
  warnings?: string[];
}
