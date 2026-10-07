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

export interface KaikkiScaleSourceManifest {
  sourceEdition: string;
  language: string;
  sourceUrl?: string;
  wiktionaryDumpDate?: string;
  kaikkiExtractionDate?: string;
  wiktextractVersion?: string;
  downloadTimestamp?: string;
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

  recordsWithRomanization: number;
  recordsWithoutRomanization: number;
  romanizationObservationCount: number;

  recordsWithIpa: number;
  recordsWithPos: number;
  properNameRecords: number;

  // Phase 7B Observation Profiles
  classicalDariObservations: number;
  iranianObservations: number;
  unclassifiedObservations: number;
  conflictingObservations: number;

  // Phase 7B Interpretation Statuses
  directEquivalentInterpretations: number;
  deterministicEquivalentInterpretations: number;
  contextRequiredInterpretations: number;
  unsupportedInterpretations: number;

  // Phase 7B Candidate Consensus Statuses
  unanimousDeterministicCandidates: number;
  conflictingDeterministicCandidates: number;
  partialCandidates: number;
  blockedCandidates: number;
  noInterpretableEvidenceCandidates: number;

  // Phase 7C Fallback Eligibility
  totalFallbackEligibleCandidates: number;
  totalFallbackIneligibleCandidates: number;
}

export interface BlockerHistogramItem {
  blockerKind: string;
  count: number;
  percentageOfBlockedInterpretations: number;
  percentageOfTotalInterpretationAttempts: number;
}

export interface ProfileClassificationDistribution {
  classicalDariCount: number;
  classicalDariPercentage: number;
  iranianCount: number;
  iranianPercentage: number;
  unclassifiedCount: number;
  unclassifiedPercentage: number;
  conflictingCount: number;
  conflictingPercentage: number;
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
  crossProfilePercentage: number;
  multiObservationConsensus: number;
  multiObservationPercentage: number;
  singleObservationDeterministic: number;
  singleObservationPercentage: number;
}

export interface PosYieldItem {
  pos: string;
  sourceForms: number;
  eligibleFallbackForms: number;
  eligibilityRate: number;
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
  divergenceRate: number;
  divergenceSamples: ReviewedDivergenceSample[];
}

export interface DuplicateEvidenceMetrics {
  candidatesWith1Obs: number;
  candidatesWith2Obs: number;
  candidatesWith3PlusObs: number;
  literalDuplicateObservationsCount: number;
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
  fullPackBytesPerEntry: number;

  novelPackPath: string;
  novelPackBytes: number;
  novelPackGzipBytes?: number;
  novelPackEntryCount: number;
  novelPackBytesPerEntry: number;

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
