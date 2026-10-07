/**
 * Domain types for Wiktionary Persian Profile Recovery & Metadata Enrichment (Phase 7E).
 *
 * Distinguishes EXPLICIT source tags from RECOVERED source profiles.
 *
 * Core scholarly invariant:
 *   EXTERNAL OBSERVATION ≠ RECOVERED PROFILE ≠ IJMES HYPOTHESIS ≠ AUTHORITATIVE LEXICON ENTRY
 */

import type { WiktionaryPersianRomanizationProfile } from '../scheme/types';

export const PROFILE_RECOVERY_VERSION = '1.0.0';
export const PROFILE_POLICY_VERSION = '1.0.0';

export type ProfileRecoveryMethod =
  | 'EXPLICIT_ROMANIZATION_TAG'
  | 'STRUCTURAL_SOUND_LINK'
  | 'STRUCTURAL_TEMPLATE_LINK'
  | 'PAIRED_SCHEME_CORRESPONDENCE'
  | 'MULTI_SIGNAL_CONSENSUS'
  | 'NONE';

export type ProfileRecoveryStatus =
  | 'EXPLICIT'
  | 'RECOVERED'
  | 'UNRECOVERABLE'
  | 'CONFLICTING';

export type ProfileOrigin =
  | 'EXPLICIT'
  | 'RECOVERED_STRUCTURAL'
  | 'RECOVERED_PAIRED'
  | 'UNCLASSIFIED';

export type ProfileRecoveryBlockerKind =
  | 'PROFILE_RECOVERY_NO_SIGNAL'
  | 'PROFILE_RECOVERY_INSUFFICIENT_SIGNAL'
  | 'PROFILE_RECOVERY_AMBIGUOUS_PAIRING'
  | 'PROFILE_RECOVERY_CONFLICT'
  | 'PROFILE_RECOVERY_ALIGNMENT_FAILED'
  | 'PROFILE_RECOVERY_UNSUPPORTED_SOURCE_STRUCTURE';

export interface ProfileRecoveryBlocker {
  kind: ProfileRecoveryBlockerKind;
  reason: string;
  context?: string;
}

export type ProfileRecoveryEvidenceTier = 'TIER_A_EXPLICIT' | 'TIER_B_STRUCTURAL' | 'TIER_C_PAIRED';

export interface WiktionaryProfileRecoveryEvidence {
  tier: ProfileRecoveryEvidenceTier;
  method: ProfileRecoveryMethod;
  inferredProfile: 'CLASSICAL_DARI' | 'IRANIAN';
  detail: string;
  sourceField?: string;
  templateName?: string;
  templateArgName?: string;
  templateArgValue?: string;
  matchedSoundIndex?: number;
  pairedEvidenceId?: string;
  pairedObservedRomanization?: string;
  discriminativeFeatures?: string[];
}

export interface WiktionaryProfileRecoveryResult {
  /** Deterministic identifier for this recovery result */
  id: string;

  /** ID of the LexicalEvidence observation */
  observationEvidenceId: string;

  /** Upstream source record identifier */
  sourceRecordId: string | null;

  /** Source form index in forms[] if present */
  sourceFormIndex?: number;

  /** Raw Persian form */
  persianForm: string;

  /** Observed romanization string */
  observedRomanization: string;

  /** Original profile classified purely from explicit tags */
  originalProfile: WiktionaryPersianRomanizationProfile;

  /** Recovered profile identity */
  recoveredProfile: WiktionaryPersianRomanizationProfile;

  /** Final effective profile to use in interpretation */
  effectiveProfile: WiktionaryPersianRomanizationProfile;

  /** Profile origin classification for audit */
  profileOrigin: ProfileOrigin;

  /** Overall recovery status */
  recoveryStatus: ProfileRecoveryStatus;

  /** Primary recovery method used */
  method: ProfileRecoveryMethod;

  /** Supporting recovery evidence list */
  evidence: WiktionaryProfileRecoveryEvidence[];

  /** Blockers preventing recovery if unrecoverable/conflicting */
  blockers: ProfileRecoveryBlocker[];

  /** Engine recovery version */
  recoveryVersion: string;

  /** Policy rule version */
  policyVersion: string;

  /** Timestamp for audit (excluded from hash ID) */
  recoveredAt?: string;
}

/**
 * Phonological / Orthographic signature distinction between Iranian vs Classical/Dari in Wiktionary.
 */
export type ProfileSignatureCategory =
  | 'PROFILE_DISCRIMINATIVE'
  | 'PROFILE_COMPATIBLE_BUT_NONDISCRIMINATIVE'
  | 'UNSUPPORTED';

export interface WiktionarySourceProfileSignature {
  id: string;
  profile: 'CLASSICAL_DARI' | 'IRANIAN';
  phenomenon: string;
  category: ProfileSignatureCategory;
  sourceVowelOrDiphthong: string;
  pairedCounterpart?: string;
  description: string;
  sourceReference: string;
}

/**
 * Metadata Observability Audit structures.
 */
export interface MetadataObservabilityAudit {
  totalPersianRecords: number;
  totalFormsCount: number;
  totalRomanizationObservations: number;

  formsTagsCardinality: Record<string, number>;
  formsRawTagsCardinality: Record<string, number>;
  formsWithSourceField: number;
  formsWithHeadNr: number;

  recordsWithSounds: number;
  totalSoundBlocks: number;
  soundTagsCardinality: Record<string, number>;
  soundRawTagsCardinality: Record<string, number>;
  soundsWithForm: number;
  soundsWithText: number;
  soundsWithNote: number;

  recordsWithHeadTemplates: number;
  headTemplateNamesCardinality: Record<string, number>;
  recordsWithEtymologyTemplates: number;

  recordsWithSenses: number;
  sensesTagsCardinality: Record<string, number>;

  multiRomanizationCohort: {
    recordsWith1Romanization: number;
    recordsWith2Romanizations: number;
    recordsWith3PlusRomanizations: number;
    totalMultiRomanizationRecords: number;
    pairedDiscriminatingCandidates: number;
  };

  structuralLinkagePotentials: {
    romanizationMatchesSoundForm: number;
    romanizationSharesHeadNrWithSound: number;
    headTemplateContainsExplicitRom: number;
  };
}

export interface Phase7EProfileRecoverySummary {
  experimentVersion: string;
  recoveryVersion: string;
  policyVersion: string;
  timestamp: string;
  sourceSha256: string;
  sourceFile: string;
  totalPersianRecords: number;
  totalFormsCount: number;
  totalObservations: number;
  recordsWithRomanization: number;

  metadataAudit: MetadataObservabilityAudit;

  observationRecovery: {
    baselineUnclassified: number;
    recoveredTotal: number;
    recoveredIranian: number;
    recoveredClassicalDari: number;
    stillUnclassified: number;
    newConflicting: number;
    recoveryYieldRate: number;
  };

  recoveryMethodDistribution: Record<ProfileRecoveryMethod, number>;

  multiRomanizationCohort: {
    totalMultiRomanizationRecords: number;
    pairedDiscriminatingRecords: number;
    successfullyRecoveredRecords: number;
    ambiguousRecords: number;
    nonDiscriminatingRecords: number;
    alignmentFailures: number;
    pairedRecoverySuccessRate: number;
  };

  candidateConsensus: {
    baseline: {
      unanimousDeterministic: number;
      partial: number;
      conflictingDeterministic: number;
      blocked: number;
      noInterpretableEvidence: number;
    };
    recovered: {
      unanimousDeterministic: number;
      partial: number;
      conflictingDeterministic: number;
      blocked: number;
      noInterpretableEvidence: number;
    };
  };

  blockersHistogram: Array<{
    kind: string;
    count: number;
    percentage: number;
  }>;

  fallbackEligibility: {
    beforeEligible: number;
    afterEligible: number;
    novelEligibleForms: number;
    reviewedOverlaps: number;
    exactReviewedMatches: number;
    reviewedDivergences: number;
    divergenceRate: number;
  };

  experimentalPack: {
    fullEntryCount: number;
    fullSizeBytes: number;
    fullGzipBytes: number;
    novelEntryCount: number;
    novelSizeBytes: number;
    novelGzipBytes: number;
    bytesPerEntry: number;
    browserPackFeasibility: string;
  };

  corpusEvaluation: {
    displayCoverageBefore: number;
    displayCoverageAfter: number;
    authoritativeCoverageBefore: number;
    authoritativeCoverageAfter: number;
    lexicalMissRecovery: number;
    uniqueFormMissRecovery: number;
  };

  auditSamples: {
    structurallyRecoveredIranian: Array<{ persianForm: string; romanization: string; template: string }>;
    structurallyRecoveredClassical: Array<{ persianForm: string; romanization: string; template: string }>;
    pairedRecoveries: Array<{ persianForm: string; classical: string; iranian: string; features: string[] }>;
    stillUnclassifiedPairs: Array<{ persianForm: string; romanizations: string[]; reason: string }>;
    conflicts: Array<{ persianForm: string; romanizations: string[]; reason: string }>;
    newFallbackEntries: Array<{ persianForm: string; canonical: string; origin: string; method: string }>;
    reviewedDivergences: Array<{ persianForm: string; recoveredHypothesis: string; reviewedCanonical: string }>;
  };

  governance: {
    falseAuthoritative: 0;
    underBlocked: 0;
    automaticPromotions: 0;
    authoritativeLexiconMutations: 0;
    productionFallbackPackUnchanged: boolean;
  };
}
