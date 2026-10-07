/**
 * Domain types for Wiktionary Persian source-scheme interpretation and IJMES hypothesis generation (Phase 7B).
 *
 * Core scholarly invariant:
 *   EXTERNAL ROMANIZATION ≠ SOURCE PROFILE ≠ IJMES HYPOTHESIS ≠ HUMAN DECISION ≠ AUTHORITATIVE LEXICON ENTRY
 */

import type {
  ConflictingObservation,
  LexicalCandidateStatus,
  RomanizationScheme
} from '../../types';
export type {
  SchemeConsensusStatus,
  SchemeInterpretationBlocker,
  SchemeInterpretationRule,
  SchemeInterpretationStatus,
  SchemeSourceReference
} from '../../scheme/types';

import type {
  SchemeConsensusStatus,
  SchemeInterpretationRule,
  SchemeInterpretationStatus
} from '../../scheme/types';

/**
 * Classification of Wiktionary's source romanization profile.
 * Distinguishes Classical/Dari from Iranian Persian phonological transliteration.
 */
export type WiktionaryPersianRomanizationProfile =
  | 'CLASSICAL_DARI'
  | 'IRANIAN'
  | 'UNCLASSIFIED'
  | 'CONFLICTING';

/**
 * Blockers specific to Wiktionary Persian interpretation.
 */
export type KaikkiSchemeBlockerKind =
  | 'UNCLASSIFIED_WIKTIONARY_PROFILE'
  | 'CONFLICTING_WIKTIONARY_PROFILE'
  | 'SOURCE_SCRIPT_ALIGNMENT_FAILED'
  | 'SOURCE_SCRIPT_ALIGNMENT_AMBIGUOUS'
  | 'UNSUPPORTED_WIKTIONARY_SYMBOL'
  | 'UNSUPPORTED_DIPHTHONG'
  | 'AMBIGUOUS_FINAL_HEH'
  | 'NON_LEMMA_SOURCE_FORM'
  | 'STRUCTURAL_SUFFIX_PRESENT'
  | 'INSUFFICIENT_SOURCE_METADATA'
  | 'NO_ROMANIZATION';

/**
 * Detailed description of a blocker encountered during Wiktionary scheme interpretation.
 */
export interface KaikkiSchemeInterpretationBlocker {
  kind: KaikkiSchemeBlockerKind;
  reason: string;
  token?: string;
}

/**
 * Definition of an explicit, auditable Wiktionary Persian interpretation rule.
 */
export interface WiktionaryPersianRuleDefinition extends SchemeInterpretationRule {
  sourceProfile: 'CLASSICAL_DARI' | 'IRANIAN' | 'ALL';
  phenomenon: string;
  sourceSymbol: string;
  interpretation: string;
}

/**
 * Immutable source-specific interpretation record for a Kaikki/Wiktionary evidence observation.
 */
export interface KaikkiSchemeInterpretation {
  /** Deterministic identifier for this interpretation analysis */
  id: string;

  /** Optional ID of the candidate containing this evidence */
  candidateId: string | null;

  /** Immutable ID of the source LexicalEvidence record */
  evidenceId: string;

  /** Source romanization profile classified from evidence metadata */
  sourceProfile: WiktionaryPersianRomanizationProfile;

  /** Deterministic fingerprint of source metadata */
  sourceMetadataFingerprint: string;

  /** Specific tags associated with this romanization observation */
  sourceTags: string[];

  /** Observed external scheme (strictly 'LOCAL') */
  sourceScheme: RomanizationScheme;

  /** Target scholarly scheme (strictly 'IJMES') */
  targetScheme: 'IJMES';

  /** Exact raw observed romanization from source */
  rawObservedRomanization: string;

  /** Presentation-normalized form used for alignment/comparison */
  comparisonSourceForm: string;

  /**
   * Non-authoritative IJMES target hypothesis, or null if blocked.
   * INVARIANT: Never mutates LexicalCandidate.proposedCanonical and never authoritative.
   */
  targetHypothesis: string | null;

  /** Status of interpretation */
  status: SchemeInterpretationStatus;

  /** List of explicit rule IDs applied */
  appliedRuleIds: string[];

  /** List of blockers preventing safe deterministic interpretation */
  blockers: KaikkiSchemeInterpretationBlocker[];

  /** Software version of interpreter */
  interpreterVersion: string;

  /** Version of ruleset applied */
  ruleSetVersion: string;

  /** Optional ISO timestamp for audit (excluded from deterministic ID) */
  analyzedAt?: string;
}

/**
 * Candidate-level aggregation artifact synthesizing Wiktionary interpretations
 * across all supporting evidence records for a LexicalCandidate.
 */
export interface KaikkiCandidateSchemeAnalysis {
  /** Deterministic ID for this candidate analysis */
  id: string;

  /** ID of the analyzed candidate */
  candidateId: string;

  /** Normalized Persian script form of the candidate */
  persianForm: string;

  /** Individual interpretations for each supporting evidence record */
  interpretations: KaikkiSchemeInterpretation[];

  /** Deduplicated, deterministically sorted list of distinct IJMES target hypotheses */
  deterministicTargetHypotheses: string[];

  /** Candidate-level scheme consensus status */
  consensusStatus: SchemeConsensusStatus;

  /**
   * Single consensus IJMES hypothesis if UNANIMOUS_DETERMINISTIC, otherwise null.
   * INVARIANT: Non-authoritative proposal; candidate.proposedCanonical remains null.
   */
  consensusTargetHypothesis: string | null;

  /** Snapshot of raw candidate conflict observations from Phase 5/7A */
  rawSourceConflicts: ConflictingObservation[];

  /** Raw candidate review lifecycle status */
  rawCandidateStatus: LexicalCandidateStatus;

  /** Aggregated blockers across all supporting evidence */
  blockers: KaikkiSchemeInterpretationBlocker[];

  /** Rule IDs applied across interpretations */
  appliedRuleIds: string[];

  /** Software version of aggregator */
  aggregatorVersion: string;

  /** Optional audit timestamp */
  analyzedAt?: string;
}

/**
 * Result of comparing a Phase 7B IJMES hypothesis against DEFAULT_LEXICON_REPOSITORY.
 */
export type LexiconComparisonOutcome =
  | 'EXACT_MATCH'
  | 'DIVERGENT'
  | 'NO_REVIEWED_ENTRY'
  | 'BLOCKED';

export interface CandidateLexiconEvaluation {
  candidateId: string;
  persianForm: string;
  consensusStatus: SchemeConsensusStatus;
  consensusTargetHypothesis: string | null;
  lexiconCanonical: string | null;
  outcome: LexiconComparisonOutcome;
  divergenceNotes?: string;
}

/**
 * Comprehensive summary report for Phase 7B Wiktionary interpretation run.
 */
export interface KaikkiInterpretationReport {
  source: string;
  interpreterVersion: string;
  ruleSetVersion: string;
  aggregatorVersion: string;
  timestamp: string;

  totalCandidates: number;
  totalObservations: number;

  profileBreakdown: {
    classicalDari: number;
    iranian: number;
    unclassified: number;
    conflicting: number;
  };

  interpretationBreakdown: {
    deterministic: number;
    contextRequired: number;
    unsupported: number;
  };

  consensusBreakdown: {
    unanimousDeterministic: number;
    conflictingDeterministic: number;
    partial: number;
    blocked: number;
    noInterpretableEvidence: number;
  };

  lexiconEvaluation: {
    exactMatches: number;
    divergences: number;
    newForms: number;
    blocked: number;
  };

  yieldMetrics: {
    profileClassifiedPercentage: number;
    deterministicInterpretationPercentage: number;
    candidateUnanimousConsensusPercentage: number;
  };

  samples: Array<{
    persianForm: string;
    sourceObservations: Array<{
      romanization: string;
      profile: WiktionaryPersianRomanizationProfile;
    }>;
    targetHypotheses: string[];
    consensus: SchemeConsensusStatus;
    authoritative: false;
  }>;

  promotionCount: 0;
  authoritativeLexiconChanges: 0;
  runtimeOutputChanges: 0;
}
