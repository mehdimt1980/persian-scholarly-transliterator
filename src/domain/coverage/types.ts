/**
 * Domain types for Phase 7F: Real Scholarly Persian Coverage Corpus & Held-Out Evaluation.
 *
 * Core Scholarly Invariants:
 *   1. Coverage is evaluated on genuinely independent external scholarly titles.
 *   2. Acquisition and corpus selection MUST NOT depend on or consult the transliteration engine or lexicon.
 *   3. Authoritative coverage ≠ Display coverage ≠ Transliteration accuracy.
 *   4. Zero automatic promotions, zero lexicon mutations.
 */

import type { AutomaticBlockingReason, ResultStatus } from '../types';

export type CoverageCorpusSplit = 'DIAGNOSTIC' | 'LOCKED_HOLDOUT';

export type CoverageCaseKind = 'TITLE' | 'BIBLIOGRAPHY' | 'PROSE' | 'OTHER';

export interface CoverageCaseMetadata {
  workType?: string;
  publicationYear?: number;
  language?: string;
  doi?: string;
  updatedDate?: string;
  [key: string]: unknown;
}

export interface CoverageCorpusCase {
  id: string;
  source: 'OPENALEX' | 'LOCAL';
  sourceId: string;
  rawText: string;
  normalizedText: string;
  kind: CoverageCaseKind;
  metadata: CoverageCaseMetadata;
  split: CoverageCorpusSplit;
}

export interface CoverageCorpusManifest {
  corpusVersion: string;
  source: 'OPENALEX' | 'LOCAL';
  generatedAt: string;
  selectionAlgorithm: string;
  totalRecords: number;
  diagnosticCount: number;
  lockedHoldoutCount: number;
  corpusSha256: string;
  holdoutSha256: string;
}

export interface CoverageCorpusFile {
  manifest: CoverageCorpusManifest;
  cases: CoverageCorpusCase[];
}

export type CoverageConfigurationName =
  | 'REVIEWED_ONLY'
  | 'CURRENT_PRODUCTION'
  | 'PHASE7E_EXPERIMENTAL'
  | 'PHASE7G_SAFE_ROUTING';

export interface CoverageTokenOutcome {
  surface: string;
  normalizedSurface: string;
  tokenType: string;
  status: ResultStatus;
  blockingReason?: AutomaticBlockingReason;
  hasProposal: boolean;
  isAuthoritative: boolean;
  isDisplayable: boolean;
  proposal?: string;
  rendered: string;
  canonicalTransliteration: string | null;
}

export interface CoverageTitleOutcome {
  caseId: string;
  split: CoverageCorpusSplit;
  sourceId: string;
  rawText: string;
  normalizedText: string;
  workType: string;
  publicationYear?: number;
  totalPersianTokens: number;
  fullyAuthoritative: boolean;
  fullyDisplayable: boolean;
  fullyCopyable: boolean;
  hasProposal: boolean;
  hasLexicalMiss: boolean;
  hasOtherBlockers: boolean;
  tokens: CoverageTokenOutcome[];
}

export interface ConfigurationMetrics {
  configName: CoverageConfigurationName;
  split: 'ALL' | 'DIAGNOSTIC' | 'LOCKED_HOLDOUT';
  totalTitles: number;
  totalPersianTokens: number;
  uniquePersianForms: number;

  // Token-level metrics
  authoritativeTokens: number;
  authoritativeTokenCoverage: number;
  displayableTokens: number;
  displayTokenCoverage: number;
  evidenceDerivedTokens: number;
  noLexicalEntryTokens: number;
  otherBlockerTokens: number;
  ambiguousTokens: number;

  // Unique-form metrics
  authoritativeUniqueForms: number;
  authoritativeUniqueFormCoverage: number;
  displayableUniqueForms: number;
  displayUniqueFormCoverage: number;
  noLexicalEntryUniqueForms: number;
  otherBlockerUniqueForms: number;

  // Title-level metrics
  fullyAuthoritativeTitles: number;
  fullyAuthoritativeTitleRate: number;
  fullyDisplayableTitles: number;
  fullyDisplayableTitleRate: number;
  copyableTitles: number;
  copyableTitleRate: number;
  titlesWithProposals: number;
  titlesWithLexicalMisses: number;
  titlesWithOtherBlockers: number;
}

export interface MissRecoveryMetrics {
  split: 'ALL' | 'DIAGNOSTIC' | 'LOCKED_HOLDOUT';
  baselineMissTokens: number;
  recoveredMissTokens: number;
  tokenLexicalMissRecoveryRate: number;

  baselineUniqueMissForms: number;
  recoveredUniqueMissForms: number;
  uniqueFormLexicalMissRecoveryRate: number;

  titlesWithBaselineMisses: number;
  titlesWithAtLeastOneRecovery: number;
  titlesWithAllMissesRecovered: number;
  titlesStillPartiallyUnresolved: number;
}

export interface WorkTypeMetrics {
  workType: string;
  titles: number;
  persianTokens: number;
  baselineDisplayCoverage: number;
  phase7EDisplayCoverage: number;
  lexicalMissRecoveryRate: number;
  baselineFullyDisplayableTitleRate: number;
  phase7EFullyDisplayableTitleRate: number;
}

export interface TitleLengthMetrics {
  bucket: '2-4' | '5-8' | '9-15' | '16+';
  titles: number;
  baselineFullyDisplayableRate: number;
  phase7EFullyDisplayableRate: number;
}

/**
 * Mutually exclusive blocker categories for diagnostic attribution.
 */
export type DiagnosticBlockerCategory =
  | 'PACK_PRESENT_RUNTIME_RECOVERED'
  | 'PACK_PRESENT_RUNTIME_NOT_APPLIED'
  | 'PACK_UNION_CONFLICT'
  | 'KAIKKI_MIXED_LEMMA_AND_NON_LEMMA'
  | 'KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED'
  | 'KAIKKI_LEMMA_MULTI_ROMANIZATION_UNCLASSIFIED'
  | 'KAIKKI_NON_LEMMA_ONLY'
  | 'KAIKKI_NO_ROMANIZATION'
  | 'KAIKKI_PRESENT_UNCLASSIFIED_CAUSE'
  | 'NOT_PRESENT_IN_KAIKKI';

export interface BlockerDistributionItem {
  category: DiagnosticBlockerCategory;
  tokenOccurrences: number;
  uniqueForms: number;
  tokenSharePercent: number;
  uniqueFormSharePercent: number;
  description: string;
}

export interface SurfaceMorphologyDiagnosticMetrics {
  totalAnalyzedForms: number;
  rawZwnjCount: number;
  normalizedZwnjCount: number;
  surfaceSuffixHaCount: number;
  surfaceSuffixHayeCount: number;
  surfaceSuffixYeCount: number;
  surfaceSuffixTarCount: number;
  surfaceSuffixTarinCount: number;
  surfaceEncliticPronounCount: number;
}

export interface ProperNameMissMetrics {
  properNameMissTokens: number;
  properNameUniqueForms: number;
  tokenSharePercent: number;
  uniqueFormSharePercent: number;
}

export interface WorklistItem {
  rank: number;
  persianForm: string;
  tokenFrequency: number;
  titleCount: number;
  diagnosticCategory: DiagnosticBlockerCategory;
  kaikkiStateSummary?: string;
  isProperName?: boolean;
}

export interface FallbackUnionConflict {
  normalizedForm: string;
  productionHypothesis: string;
  phase7EHypothesis: string;
  reason: 'EVALUATION_FALLBACK_CONFLICT';
}

export interface UnappliedPackTokenDetail {
  persianForm: string;
  tokenCount: number;
  titleCount: number;
  packHypothesis: string;
  runtimeReason: string;
  exampleTitle: string;
}

export interface ExperimentalInputIdentity {
  frozenCorpusSha256: string;
  holdoutSha256: string;
  productionPackSemanticSha256: string;
  experimentalPackSemanticSha256: string;
  kaikkiSourceSha256: string;
  recoveryVersion: string;
  diagnosticIndexVersion: string;
  evaluatorVersion: string;
}

export interface Phase7FCoverageSummaryReport {
  reportVersion: string;
  generatedAt: string;
  inputIdentity: ExperimentalInputIdentity;
  corpusManifest: CoverageCorpusManifest;
  workTypeDistribution: Record<string, number>;
  publicationYearDistribution: Record<string, number>;

  // Evaluated token and form totals
  totalPersianTokens: number;
  uniqueNormalizedPersianForms: number;

  // Configurations comparison
  configurations: Record<CoverageConfigurationName, ConfigurationMetrics>;
  holdoutConfigurations: Record<CoverageConfigurationName, ConfigurationMetrics>;
  diagnosticConfigurations: Record<CoverageConfigurationName, ConfigurationMetrics>;

  // Miss recovery
  missRecoveryOverall: MissRecoveryMetrics;
  missRecoveryDiagnostic: MissRecoveryMetrics;
  missRecoveryHoldout: MissRecoveryMetrics;

  // Breakdown by work type and title length
  workTypeBreakdown: WorkTypeMetrics[];
  titleLengthBreakdown: TitleLengthMetrics[];

  // Fallback union conflicts
  fallbackUnionConflicts: FallbackUnionConflict[];

  // Diagnostic attribution distributions (DIAGNOSTIC split)
  baselineMissDistribution: BlockerDistributionItem[];
  postPhase7ERemainingMissDistribution: BlockerDistributionItem[];

  // Reconciled unapplied pack cases
  unappliedPackAudit: UnappliedPackTokenDetail[];

  properNameCohort: ProperNameMissMetrics;
  surfaceMorphologyPatterns: SurfaceMorphologyDiagnosticMetrics;

  // Worklists & Audit Samples
  topUnresolvedWorklist: WorklistItem[];
  topNewlyRecoveredWorklist: WorklistItem[];
  topAbsentFromKaikkiWorklist: WorklistItem[];
  topNonLemmaWorklist: WorklistItem[];
  topProperNameWorklist: WorklistItem[];

  auditSamples: {
    newlyRecovered: WorklistItem[];
    stillUnclassifiedKaikki: WorklistItem[];
    nonLemmaMisses: WorklistItem[];
    notPresentInKaikki: WorklistItem[];
    properNameMisses: WorklistItem[];
  };

  // Recommended next intervention
  recommendedNextIntervention: {
    recommendedPhase: 'Phase 7G';
    primaryFocus: string;
    rationale: string;
    diagnosticEvidence: {
      dominantBlockerCategory: DiagnosticBlockerCategory;
      tokenShare: number;
      uniqueFormShare: number;
    };
  };

  governance: {
    falseAuthoritative: 0;
    underBlocked: 0;
    automaticPromotions: 0;
    authoritativeLexiconMutations: 0;
    productionFallbackPackUnchanged: true;
  };
}

export interface InterceptedTokenReconciliation {
  totalOriginalInterceptedTokens: number;
  safeRoutingProposalsCreated: number;
  stillBlockedByConfirmedMorphology: number;
  blockedByCompetingReviewedEvidence: number;
  blockedByExplicitOrthography: number;
  invalidOrMissingFallback: number;
  unresolvedForOtherReasons: number;
  recoveredUniqueForms: number;
  affectedTitles: number;
}

export interface RegressionSummary {
  newlyDisplayableTokens: number;
  unchangedDisplayableTokens: number;
  lostDisplayabilityTokens: number;
  newAmbiguityTokens: number;
  newAuthoritativeTokens: number;
}

export interface Phase7GSafeResolutionSummaryReport {
  reportVersion: string;
  generatedAt: string;
  inputIdentity: ExperimentalInputIdentity;
  corpusManifest: CoverageCorpusManifest;
  totalPersianTokens: number;
  uniqueNormalizedPersianForms: number;
  configurations: Record<CoverageConfigurationName, ConfigurationMetrics>;
  diagnosticConfigurations: Record<CoverageConfigurationName, ConfigurationMetrics>;
  holdoutConfigurations: Record<CoverageConfigurationName, ConfigurationMetrics>;
  interceptedDiagnosticReconciliation: InterceptedTokenReconciliation;
  regressionSummary: RegressionSummary;
  governance: {
    falseAuthoritative: 0;
    underBlocked: 0;
    automaticPromotions: 0;
    authoritativeLexiconMutations: 0;
    productionFallbackPackUnchanged: true;
    productionDefaultUnchanged: true;
  };
}
