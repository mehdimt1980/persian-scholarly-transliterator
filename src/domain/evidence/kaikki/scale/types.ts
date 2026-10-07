/**
 * Type definitions for Phase 7D Production-Scale Knowledge Pack Experiment.
 *
 * All external observations and experimental fallback entries remain strictly
 * non-authoritative evidence.
 *
 * Core invariant:
 *   Authoritative promotions = 0
 *   Authoritative lexicon changes = 0
 *   Zero new linguistic rules.
 */

import type { EvidenceFallbackEntry } from '../fallback/types';

export type ProvenanceFieldOrigin = 'EXPLICITLY_SUPPLIED' | 'EMBEDDED_IN_SOURCE' | 'UNKNOWN';

export interface KaikkiScaleSourceManifest {
  sourceEdition: string;
  language: string;
  sourceUrl?: string;
  wiktionaryDumpDate?: string;
  kaikkiExtractionDate?: string;
  wiktextractVersion?: string;
  downloadTimestamp?: string;
  provenanceStatus: {
    sourceUrl: ProvenanceFieldOrigin;
    wiktionaryDumpDate: ProvenanceFieldOrigin;
    kaikkiExtractionDate: ProvenanceFieldOrigin;
    wiktextractVersion: ProvenanceFieldOrigin;
  };
  inputFileBytes: number;
  inputSha256: string;
  inputFileName: string;
}

export interface KaikkiScaleYieldFunnel {
  physicalRowsRead: number;
  malformedRows: number;
  validPersianRecords: number;
  distinctRawPersianForms: number;
  distinctNormalizedForms: number;
  normalizationCollisions: number;

  lemmaRecords: number;
  nonLemmaRecords: number;
  unknownLemmaStatusRecords: number;

  // Source Romanization Presence on Record
  recordsWithRomanization: number;
  recordsWithoutRomanization: number;

  // Observation Accounting Funnel
  totalExtractedEvidenceObservations: number;
  romanizedEvidenceObservations: number;
  unromanizedEvidenceObservations: number;
  uniqueEvidenceObservationsAfterDeduplication: number;
  duplicateEvidenceObservationsRemoved: number;

  totalInterpretationAttempts: number;

  recordsWithIpa: number;
  recordsWithPos: number;
  properNameRecords: number;

  // Phase 7B Observation Profiles (Denominator: totalInterpretationAttempts)
  classicalDariObservations: number;
  iranianObservations: number;
  unclassifiedObservations: number;
  conflictingObservations: number;

  // Phase 7B Interpretation Statuses (Denominator: totalInterpretationAttempts)
  directEquivalentInterpretations: number;
  deterministicEquivalentInterpretations: number;
  contextRequiredInterpretations: number;
  unsupportedInterpretations: number;

  // Phase 7B Candidate Consensus Statuses (Denominator: distinctNormalizedForms)
  unanimousDeterministicCandidates: number;
  conflictingDeterministicCandidates: number;
  partialCandidates: number;
  blockedCandidates: number;
  noInterpretableEvidenceCandidates: number;

  // Phase 7C Fallback Eligibility (Denominator: distinctNormalizedForms)
  totalFallbackEligibleCandidates: number;
  totalFallbackIneligibleCandidates: number;
}

export interface BlockerHistogramItem {
  blockerKind: string;
  count: number;
  percentageOfBlockedInterpretations: number | null;
  percentageOfTotalInterpretationAttempts: number | null;
}

export interface ProfileClassificationDistribution {
  classicalDariCount: number;
  classicalDariPercentage: number | null;
  iranianCount: number;
  iranianPercentage: number | null;
  unclassifiedCount: number;
  unclassifiedPercentage: number | null;
  conflictingCount: number;
  conflictingPercentage: number | null;
}

export interface CandidateProfileCombinationDistribution {
  classicalOnly: number;
  iranianOnly: number;
  crossProfile: number;
  unclassifiedOnly: number;
  mixedClassifiedAndUnclassified: number;
}

export interface ConfidenceTierDistribution {
  crossProfileConsensus: number;
  crossProfilePercentage: number | null;
  multiObservationConsensus: number;
  multiObservationPercentage: number | null;
  singleObservationDeterministic: number;
  singleObservationPercentage: number | null;
}

export interface PosYieldItem {
  pos: string;
  sourceForms: number;
  eligibleFallbackForms: number;
  eligibilityRate: number | null;
}

export interface ProperNameCohortMetrics {
  sourceProperNameCount: number;
  interpretableProperNameCount: number;
  fallbackEligibleProperNameCount: number;
  crossProfileProperNameCount: number;
}

export interface ReviewedDivergenceSample {
  persianForm: string;
  normalizedForm: string;
  reviewedCanonical: string;
  evidenceHypothesis: string;
  confidenceTier: string;
  sourceProfiles: string[];
}

export interface ReviewedLexiconOverlapAnalysis {
  totalEligibleEntries: number;
  reviewedOverlapCount: number;
  novelEligibleCount: number;
  exactCanonicalMatches: number;
  canonicalDivergences: number;
  divergenceRate: number | null;
  divergenceSamples: ReviewedDivergenceSample[];
}

export interface DuplicateEvidenceMetrics {
  candidatesWith1Obs: number;
  candidatesWith2Obs: number;
  candidatesWith3PlusObs: number;
  literalDuplicateObservationsCount: number;
  sameRomanizationAcrossDistinctRecordsCount: number;
  sameNormalizedFormWithMultipleObservationsCount: number;
  evidenceReductionIfDuplicatesCollapsed: number;
}

export interface ScalePerformanceStage {
  stageName: string;
  rowsProcessed: number;
  wallClockDurationMs: number;
  rowsPerSecond: number;
  startRssMb: number;
  peakRssMb: number;
  endRssMb: number;
  eligibleEntriesCount: number;
}

export interface CorpusCoverageEvaluationResult {
  corpusName: string;
  totalLexicalTokens: number;
  uniqueLexicalForms: number;
  unresolvedTokensBefore: number;
  unresolvedUniqueFormsBefore: number;

  // Display coverage
  displayableTokensBefore: number;
  displayCoverageBefore: number;
  displayableTokensAfter: number;
  displayCoverageAfter: number;

  displayableUniqueFormsBefore: number;
  uniqueFormDisplayCoverageBefore: number;
  displayableUniqueFormsAfter: number;
  uniqueFormDisplayCoverageAfter: number;

  // Authority coverage
  authoritativeTokensBefore: number;
  authoritativeCoverageBefore: number;
  authoritativeTokensAfter: number;
  authoritativeCoverageAfter: number;

  // Lexical miss recovery
  recoveredTokens: number;
  tokenLexicalMissRecoveryRate: number;
  recoveredUniqueForms: number;
  uniqueFormLexicalMissRecoveryRate: number;
}

export interface ScaleAuditSamples {
  crossProfileSamples: EvidenceFallbackEntry[];
  multiObservationSamples: EvidenceFallbackEntry[];
  singleObservationSamples: EvidenceFallbackEntry[];
  blockedSamplesByKind: Record<string, { normalizedForm: string; reason: string; romanizations: string[] }[]>;
  reviewedMatchSamples: { normalizedForm: string; canonical: string }[];
  reviewedDivergenceSamples: ReviewedDivergenceSample[];
}

export interface ExperimentalPackGenerationResult {
  fullPackPath: string;
  fullPackBytes: number;
  fullPackGzipBytes?: number;
  fullPackEntryCount: number;
  fullPackBytesPerEntry: number | null;

  novelPackPath: string;
  novelPackBytes: number;
  novelPackGzipBytes?: number;
  novelPackEntryCount: number;
  novelPackBytesPerEntry: number | null;

  semanticPackSha256: string;
}

export interface Phase7DScaleoutSummary {
  experimentVersion: string;
  executedAt: string;
  sourceManifest: KaikkiScaleSourceManifest;
  performanceStages: ScalePerformanceStage[];
  yieldFunnel: KaikkiScaleYieldFunnel;
  blockerHistogram: BlockerHistogramItem[];
  profileDistribution: ProfileClassificationDistribution;
  candidateProfileCombinations: CandidateProfileCombinationDistribution;
  confidenceTiers: ConfidenceTierDistribution;
  posDistribution: PosYieldItem[];
  properNameCohort: ProperNameCohortMetrics;
  reviewedOverlap: ReviewedLexiconOverlapAnalysis;
  duplicateEvidence: DuplicateEvidenceMetrics;
  experimentalPacks: ExperimentalPackGenerationResult;
  corpusEvaluations: CorpusCoverageEvaluationResult[];
  auditSamples: ScaleAuditSamples;
  governanceInvariants: {
    automaticPromotions: 0;
    authoritativeLexiconMutations: 0;
    falseAuthoritativeCount: 0;
    underBlockedCount: 0;
    productionPackUntouched: boolean;
  };
}

export interface ScaleExperimentOptions {
  inputFilePath: string;
  outputDir?: string;
  sourceUrl?: string;
  wiktionaryDumpDate?: string;
  kaikkiExtractionDate?: string;
  wiktextractVersion?: string;
  packVersion?: string;
  maxRecords?: number;
  progressEvery?: number;
  evaluationCorpusPath?: string;
}
