/**
 * Domain types for Phase 7C: Evidence-Backed Automatic Lexical Fallback.
 *
 * Core scholarly invariant:
 *   DISPLAYABLE AUTOMATIC HYPOTHESIS ≠ AUTOMATIC SCHOLARLY AUTHORITY
 *   Reviewed lexical reading ≠ Evidence-derived hypothesis ≠ Human-accepted session reading ≠ Authoritative lexicon entry
 */

export type EvidenceDerivedConfidenceTier =
  | 'CROSS_PROFILE_CONSENSUS'
  | 'MULTI_OBSERVATION_CONSENSUS'
  | 'SINGLE_OBSERVATION_DETERMINISTIC';

export interface EvidenceDerivedReference {
  evidenceId: string;
  sourceRecordId?: string;
  romanization: string;
  profile: 'CLASSICAL_DARI' | 'IRANIAN';
  sourceUri?: string;
}

export interface EvidenceDerivedProposal {
  /** Canonical IJMES target hypothesis */
  hypothesis: string;

  /** Profile-rendered proposal for display (e.g. capitalized in citation_title) */
  renderedProposal: string;

  /** Immutable provenance source */
  source: 'KAIKKI_WIKTIONARY';

  /** Scheme consensus requirement (strictly UNANIMOUS_DETERMINISTIC) */
  consensusStatus: 'UNANIMOUS_DETERMINISTIC';

  /** Descriptive evidence strength tier */
  confidenceTier: EvidenceDerivedConfidenceTier;

  /** Candidate analysis identifier from Phase 7B */
  candidateAnalysisId: string;

  /** Stable fallback entry identifier in the generated pack */
  fallbackEntryId: string;

  /** Pack semantic version */
  packVersion: string;

  /** Number of independent contributing evidence observations */
  evidenceCount: number;

  /** Classified source profiles participating in consensus */
  sourceProfiles: Array<'CLASSICAL_DARI' | 'IRANIAN'>;

  /** Audit references for contributing evidence */
  evidenceRefs: EvidenceDerivedReference[];
}

export interface EvidenceFallbackEntry {
  /** Deterministic fallback entry ID (e.g. fb-kaikki-<hash>) */
  id: string;

  /** Normalized Persian script form */
  normalizedForm: string;

  /** Canonical IJMES hypothesis */
  hypothesis: string;

  /** Strict consensus requirement */
  consensusStatus: 'UNANIMOUS_DETERMINISTIC';

  /** Confidence classification */
  confidenceTier: EvidenceDerivedConfidenceTier;

  /** Phase 7B candidate analysis ID */
  candidateAnalysisId: string;

  /** Evidence count */
  evidenceCount: number;

  /** Source profiles involved */
  sourceProfiles: Array<'CLASSICAL_DARI' | 'IRANIAN'>;

  /** Contributing interpretation records */
  interpretations: EvidenceDerivedReference[];

  /** Software and pipeline versions used to generate this entry */
  generatedFrom: {
    acquisitionVersion: string;
    interpreterVersion: string;
    ruleSetVersion: string;
    aggregatorVersion: string;
  };
}

export interface EvidenceFallbackPackManifest {
  packVersion: string;
  generatedAt: string;
  inputSha256: string;
  wiktionaryDumpDate?: string;
  wiktextractVersion?: string;
  extractorVersion: string;
  interpreterVersion: string;
  ruleSetVersion: string;
  aggregatorVersion: string;
  entryCount: number;
}

export interface EvidenceFallbackPack {
  manifest: EvidenceFallbackPackManifest;
  entries: Record<string, EvidenceFallbackEntry>;
}

export interface FallbackEvaluationReport {
  datasetName: string;
  evaluatedTokensCount: number;
  unknownTokensBeforeFallback: number;
  eligibleFallbackHits: number;
  visibleProposalCoverage: number;
  crossProfileProposals: number;
  multiObservationProposals: number;
  singleObservationProposals: number;
  stillUnresolvedCount: number;
  humanAcceptanceRequiredCount: number;
  displayCoverageBefore: number;
  displayCoverageAfter: number;
  authoritativeCoverageBefore: number;
  authoritativeCoverageAfter: number;
  automaticPromotions: 0;
  authoritativeLexiconMutations: 0;
}
