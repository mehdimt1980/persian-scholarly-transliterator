import { RuleDefinition } from '../types';

export type ReviewIssueType =
  | 'LEXICAL_AMBIGUITY'
  | 'UNKNOWN_TOKEN'
  | 'IZAFAT_CANDIDATE'
  | 'MORPHOLOGY_AMBIGUITY'
  | 'UNSUPPORTED_ALLOMORPH'
  | 'INSUFFICIENT_VOCALIZATION'
  | 'UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE'
  | 'EVIDENCE_DERIVED_READING';

export type ReviewActionType =
  | 'SELECT_LEXICAL_READING'
  | 'MANUAL_CANONICAL_OVERRIDE'
  | 'ACCEPT_IZAFAT'
  | 'REJECT_IZAFAT'
  | 'SELECT_MORPHOLOGY'
  | 'ACCEPT_EVIDENCE_DERIVED';


export interface ReviewAlternative {
  id: string;
  label: string;
  canonical?: string;
  description?: string;
  source?: string;
}

export interface ReviewIssue {
  id: string;
  type: ReviewIssueType;
  tokenIndexes: number[];
  relationIndex?: number;
  morphologyIndex?: number;
  surface: string;
  description: string;
  alternatives: ReviewAlternative[];
  allowedActions: ReviewActionType[];
  evidenceSummary?: string;
  provenance?: RuleDefinition[];
}

export interface AssistanceDecisionMetadata {
  suggestionId: string;
  provider: string;
  model: string;
  promptVersion: string;
  requestFingerprint: string;
}

export interface ReviewDecision {
  issueId: string;
  action: ReviewActionType;
  selectedAlternativeId?: string;
  manualCanonicalTransliteration?: string;
  note?: string;
  assistance?: AssistanceDecisionMetadata;
}

export interface ValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}
