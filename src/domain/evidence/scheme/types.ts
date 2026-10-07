/**
 * Domain types for scheme-aware evidence interpretation and candidate aggregation (Phase 5D).
 *
 * Core scholarly invariant:
 *   EXTERNAL ROMANIZATION ≠ SCHEME INTERPRETATION ≠ TARGET-SCHEME HYPOTHESIS ≠ AUTHORITATIVE CANONICAL FORM
 *
 * All target-scheme hypotheses produced in Phase 5D are non-authoritative proposals.
 * LexicalCandidate.proposedCanonical remains strictly null.
 */

import type {
  ConflictingObservation,
  LexicalCandidateStatus,
  RomanizationScheme
} from '../types';

/**
 * High-level status of interpreting an individual external evidence observation
 * relative to the project's target scholarly scheme (IJMES).
 */
export type SchemeInterpretationStatus =
  | 'DIRECT_EQUIVALENT'
  | 'DETERMINISTIC_EQUIVALENT'
  | 'CONTEXT_REQUIRED'
  | 'UNSUPPORTED';

/**
 * Consensus status across multiple supporting evidence interpretations for a candidate.
 */
export type SchemeConsensusStatus =
  | 'UNANIMOUS_DETERMINISTIC'
  | 'CONFLICTING_DETERMINISTIC'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'NO_INTERPRETABLE_EVIDENCE';

/**
 * Classification of specific structural or contextual blockers preventing
 * safe standalone lexical interpretation.
 */
export type SchemeInterpretationBlockerKind =
  | 'HYPHEN_CONTEXT_BOUND'
  | 'STRUCTURAL_IZAFAT'
  | 'STRUCTURAL_INDEFINITE'
  | 'STRUCTURAL_PRIME'
  | 'AMBIGUOUS_FINAL_HEH'
  | 'INITIAL_HAMZA_DISALLOWED'
  | 'UNVERIFIED_TYPOGRAPHIC_VARIANT'
  | 'UNSUPPORTED_SCHEME'
  | 'NO_ROMANIZATION';

/**
 * Detailed description of a blocker encountered during scheme interpretation.
 */
export interface SchemeInterpretationBlocker {
  kind: SchemeInterpretationBlockerKind;
  reason: string;
  token?: string;
}

/**
 * Kind of transliteration rule transformation.
 */
export type SchemeRuleKind =
  | 'SYMBOL_EQUIVALENCE'
  | 'CHARACTER_MAPPING'
  | 'STRUCTURAL_EXCEPTION';

/**
 * Official external standard source citation for a scheme interpretation rule.
 */
export interface SchemeSourceReference {
  authority: 'LIBRARY_OF_CONGRESS' | 'IJMES' | 'ENCYCLOPAEDIA_IRANICA' | 'DMG' | 'WIKTIONARY';
  documentTitle: string;
  versionOrDate: string;
  sectionOrTable?: string;
  url?: string;
}

/**
 * Definition of an explicit, auditable scholarly scheme transformation rule.
 */
export interface SchemeInterpretationRule {
  id: string;
  sourceScheme: RomanizationScheme;
  targetScheme: 'IJMES';
  kind: SchemeRuleKind;
  description: string;
  sourceReferences: SchemeSourceReference[];
}

/**
 * Non-authoritative analysis record interpreting an individual LexicalEvidence observation.
 */
export interface SchemeInterpretation {
  /** Deterministic identifier for this interpretation analysis */
  id: string;

  /** Optional ID of the candidate containing this evidence, if known */
  candidateId: string | null;

  /** Immutable ID of the source LexicalEvidence record */
  evidenceId: string;

  /** Observed external romanization scheme */
  sourceScheme: RomanizationScheme;

  /** Target scholarly scheme (strictly IJMES) */
  targetScheme: 'IJMES';

  /** Exact raw observed romanization string from source evidence */
  rawObservedRomanization: string;

  /** Presentation-normalized form used for comparison (e.g. NFC, lowercased) */
  comparisonSourceForm: string;

  /**
   * Non-authoritative target-scheme hypothesis, or null if context is required / unsupported.
   * INVARIANT: This is NOT LexicalCandidate.proposedCanonical and NOT a LexicalReading.
   */
  targetHypothesis: string | null;

  /** Interpretation classification status */
  status: SchemeInterpretationStatus;

  /** List of explicit rule IDs applied during deterministic transformation */
  appliedRuleIds: string[];

  /** List of blockers preventing safe deterministic interpretation */
  blockers: SchemeInterpretationBlocker[];

  /** Software version of the scheme interpreter */
  interpreterVersion: string;

  /** Rule-set version applied */
  ruleSetVersion: string;

  /** Optional ISO 8601 wall-clock audit timestamp (excluded from deterministic ID) */
  analyzedAt?: string;
}

/**
 * Candidate-level aggregation artifact synthesizing scheme interpretations across all
 * supporting evidence records for a LexicalCandidate.
 */
export interface CandidateSchemeAnalysis {
  /** Deterministic ID for this candidate analysis */
  id: string;

  /** ID of the analyzed candidate */
  candidateId: string;

  /** Normalized Persian script form of the candidate */
  persianForm: string;

  /** Individual interpretations for each supporting evidence record */
  interpretations: SchemeInterpretation[];

  /** Deduplicated, deterministically sorted list of distinct IJMES target hypotheses */
  deterministicTargetHypotheses: string[];

  /** Candidate-level scheme consensus status */
  consensusStatus: SchemeConsensusStatus;

  /**
   * Single consensus IJMES hypothesis if status is UNANIMOUS_DETERMINISTIC, otherwise null.
   * INVARIANT: Non-authoritative proposal; candidate.proposedCanonical remains null.
   */
  consensusTargetHypothesis: string | null;

  /** Snapshot of raw candidate conflict observations from Phase 5C */
  rawSourceConflicts: ConflictingObservation[];

  /** Raw lifecycle status from Phase 5C candidate (e.g. REVIEW_REQUIRED if raw observations disagreed) */
  rawCandidateStatus: LexicalCandidateStatus;

  /** Aggregated list of all blockers encountered across supporting evidence */
  blockers: SchemeInterpretationBlocker[];

  /** Rule IDs applied across all unanimous/contributing interpretations */
  appliedRuleIds: string[];

  /** Software version of the scheme aggregator */
  aggregatorVersion: string;

  /** Optional audit timestamp (excluded from deterministic ID) */
  analyzedAt?: string;
}

/**
 * Definition of an official IJMES target standard policy entry for read-only audit.
 */
export interface IJMESPolicyDefinition {
  policyId: string;
  character: string;
  persianLetterName: string;
  targetSymbol: string;
  sourceReferences: SchemeSourceReference[];
  notes?: string;
}

/**
 * Result of comparing Phase 5D policy definitions against runtime project IJMES mappings.
 */
export type PolicyAuditComparisonStatus = 'MATCH' | 'MISMATCH' | 'NOT_COMPARABLE';

export interface PolicyAuditEntry {
  policyId: string;
  character: string;
  persianLetterName: string;
  schemeTargetSymbol: string;
  runtimeMappingSymbol: string | null;
  status: PolicyAuditComparisonStatus;
  sourceReferences: SchemeSourceReference[];
  notes?: string;
}

export interface PolicyAuditReport {
  timestamp: string;
  targetScheme: 'IJMES';
  totalChecked: number;
  matches: number;
  mismatches: number;
  notComparable: number;
  entries: PolicyAuditEntry[];
  summary: 'PASS' | 'PASS_WITH_NONCOMPARABLE' | 'DISCREPANCY_DETECTED';
}
