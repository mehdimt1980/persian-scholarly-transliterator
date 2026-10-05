import type {
  AutomaticBlockingReason,
  ProfileId,
  ResultStatus,
  TokenType,
  TransliterationResult
} from '../types';
import type { ReviewActionType, ReviewIssueType } from '../review/types';

export type PhraseContextKind = 'BOOK_OR_ARTICLE_TITLE' | 'GENERAL_SCHOLARLY_TEXT';

export type PhraseResolutionDisposition = 'PROPOSED' | 'REVIEW_REQUIRED';

export type PhraseResolutionBasis = 'CONTEXTUAL_INFERENCE' | 'MODEL_INFERENCE' | 'MIXED';

export interface PhraseTokenEvidence {
  index: number;
  surface: string;
  tokenType: TokenType;
  status: ResultStatus;
  canonicalTransliteration: string | null;
  rendered: string;
  blockingReason?: AutomaticBlockingReason;
  alternatives: string[];
  lexicalSources: string[];
  appliedRuleIds: string[];
}

export interface PhraseIssueEvidence {
  id: string;
  type: ReviewIssueType;
  surface: string;
  description: string;
  tokenIndexes: number[];
  allowedActions: ReviewActionType[];
  alternatives: Array<{
    id: string;
    label: string;
    canonical?: string;
    source?: string;
  }>;
  evidenceSummary?: string;
}

export interface PhraseMorphologyEvidence {
  tokenIndex: number;
  surface: string;
  status: string;
  lexicalLookupStem: string;
  hostEnding: string;
  morphemes: string[];
  warnings: string[];
}

export interface PhraseRelationEvidence {
  sourceTokenIndex: number;
  targetTokenIndex: number;
  source: string;
  target: string;
  type: string;
  status: string;
  disposition?: string;
  rendering: string;
  evidenceKinds: string[];
  warnings: string[];
}

export interface PhraseResolverRequest {
  originalInput: string;
  normalizedInput: string;
  profile: ProfileId;
  contextKind: PhraseContextKind;
  deterministicStatus: ResultStatus;
  deterministicCopyable: boolean;
  deterministicOutput: string;
  tokenEvidence: PhraseTokenEvidence[];
  reviewIssues: PhraseIssueEvidence[];
  morphologyEvidence: PhraseMorphologyEvidence[];
  relationEvidence: PhraseRelationEvidence[];
  promptVersion: string;
}

export interface PhraseTokenReadingProposal {
  tokenIndex: number;
  surface: string;
  canonical: string;
  note: string;
}

export interface RawPhraseResolutionPayload {
  disposition: PhraseResolutionDisposition;
  scholarlyCanonical: string | null;
  renderedOutput: string | null;
  confidence: number | null;
  basis: PhraseResolutionBasis;
  rationale: string;
  assumptions: string[];
  tokenReadings: PhraseTokenReadingProposal[];
  warnings?: string[] | null;
}

export interface PhraseResolution extends RawPhraseResolutionPayload {
  provider: string;
  model: string;
  promptVersion: string;
  requestFingerprint: string;
}

export type PhraseAcceptanceKind =
  | 'HUMAN_ACCEPTED_AI_SUGGESTION'
  | 'HUMAN_EDITED_AI_SUGGESTION';

export interface AcceptedPhraseDecision {
  source: 'AI_ASSISTED_PHRASE';
  acceptance: PhraseAcceptanceKind;
  originalInput: string;
  normalizedInput: string;
  profile: ProfileId;
  scholarlyCanonical: string;
  renderedOutput: string;
  provider: string;
  model: string;
  promptVersion: string;
  requestFingerprint: string;
  modelConfidence: number | null;
  acceptedAt: string;
}

export interface PhraseAssistanceApplicability {
  applicable: boolean;
  reason?: 'REQUEST_CHANGED' | 'NO_LONGER_REVIEW_REQUIRED';
  expectedFingerprint?: string;
}

export interface PhraseAssistanceViewState {
  deterministic: TransliterationResult;
  acceptedPhraseDecision: AcceptedPhraseDecision | null;
}
