/**
 * Wiktionary Persian Profile Recovery Engine (Phase 7E Hardened).
 *
 * Implements Tier A (Explicit), Tier B (Structural Linkage with Verified Semantics),
 * and Tier C (Position-Aligned Paired-Scheme Correspondence with Global Multi-Observation Reconciliation).
 *
 * Core scholarly invariant:
 *   EXTERNAL OBSERVATION ≠ RECOVERED PROFILE ≠ IJMES HYPOTHESIS ≠ AUTHORITATIVE LEXICON ENTRY
 */

import crypto from 'node:crypto';
import { alignAndTransduceWiktionary } from '../scheme/aligner';
import { classifyWiktionaryProfile } from '../scheme/profileClassifier';
import type { WiktionaryPersianRomanizationProfile } from '../scheme/types';
import type { KaikkiExtractedObservation, KaikkiRawEntry } from '../types';
import {
  matchAlignedSlotCorrespondence,
  VERIFIED_STRUCTURAL_PROFILE_RULES
} from './signatures';
import {
  PROFILE_POLICY_VERSION,
  PROFILE_RECOVERY_VERSION,
  type AlignedDiscriminativeSlotFeature,
  type ProfileRecoveryBlocker,
  type ProfileRecoveryMethod,
  type VerifiedStructuralProfileRule,
  type WiktionaryProfileRecoveryEvidence,
  type WiktionaryProfileRecoveryResult
} from './types';

/**
 * Reject placeholder and sentinel values in template parameters.
 */
function isValidStructuralTransliteration(val: string): boolean {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed.length === 0) return false;
  const sentinels = new Set(['-', '—', '―', '+', '?', 'none', 'n/a', 'null', 'undefined', '--']);
  if (sentinels.has(trimmed.toLowerCase())) return false;
  return true;
}

export function generateProfileRecoveryId(params: {
  observationEvidenceId: string;
  sourceRecordId: string | null;
  persianForm: string;
  recoveredProfile: WiktionaryPersianRomanizationProfile;
  method: ProfileRecoveryMethod;
  recoveryVersion: string;
  policyVersion: string;
  evidenceBasis?: {
    pairedEvidenceIds?: string[];
    alignedFeatureSignatures?: string[];
    alignedSpans?: string[];
    templateName?: string;
    templateArgName?: string;
    templateArgValue?: string;
    subdivisionId?: string;
  };
}): string {
  const hash = crypto.createHash('sha256');
  hash.update(params.observationEvidenceId);
  hash.update('\0');
  hash.update(params.sourceRecordId ?? '');
  hash.update('\0');
  hash.update(params.persianForm);
  hash.update('\0');
  hash.update(params.recoveredProfile);
  hash.update('\0');
  hash.update(params.method);
  hash.update('\0');
  hash.update(params.recoveryVersion);
  hash.update('\0');
  hash.update(params.policyVersion);

  if (params.evidenceBasis) {
    hash.update('\0');
    if (params.evidenceBasis.pairedEvidenceIds) {
      hash.update([...params.evidenceBasis.pairedEvidenceIds].sort().join(','));
    }
    hash.update('\0');
    if (params.evidenceBasis.alignedFeatureSignatures) {
      hash.update([...params.evidenceBasis.alignedFeatureSignatures].sort().join(','));
    }
    hash.update('\0');
    if (params.evidenceBasis.alignedSpans) {
      hash.update([...params.evidenceBasis.alignedSpans].sort().join(','));
    }
    hash.update('\0');
    hash.update(params.evidenceBasis.templateName ?? '');
    hash.update('\0');
    hash.update(params.evidenceBasis.templateArgName ?? '');
    hash.update('\0');
    hash.update(params.evidenceBasis.templateArgValue ?? '');
    hash.update('\0');
    hash.update(params.evidenceBasis.subdivisionId ?? '');
  }

  const digest = hash.digest('hex').slice(0, 16);
  return `rec-${digest}`;
}

export interface ProfileRecoveryOptions {
  recoveryVersion?: string;
  policyVersion?: string;
  recoveredAt?: string;
  structuralRules?: VerifiedStructuralProfileRule[];
}

interface ProposalWithEvidence {
  profile: 'CLASSICAL_DARI' | 'IRANIAN';
  evidence: WiktionaryProfileRecoveryEvidence;
}

export class WiktionaryProfileRecoveryEngine {
  private readonly recoveryVersion: string;
  private readonly policyVersion: string;
  private readonly structuralRules: VerifiedStructuralProfileRule[];

  constructor(options?: ProfileRecoveryOptions) {
    this.recoveryVersion = options?.recoveryVersion ?? PROFILE_RECOVERY_VERSION;
    this.policyVersion = options?.policyVersion ?? PROFILE_POLICY_VERSION;
    this.structuralRules = options?.structuralRules ?? VERIFIED_STRUCTURAL_PROFILE_RULES;
  }

  /**
   * Recovers profile identities for all observations belonging to a single source entry/record
   * using global multi-observation reconciliation (non-greedy, order-independent).
   */
  public recoverProfilesForEntry(
    rawEntry: KaikkiRawEntry,
    observations: KaikkiExtractedObservation[],
    options?: ProfileRecoveryOptions
  ): Map<string, WiktionaryProfileRecoveryResult> {
    const results = new Map<string, WiktionaryProfileRecoveryResult>();
    if (!observations || observations.length === 0) {
      return results;
    }

    // Step 1: Evaluate Tier A (Explicit) and Tier B (Structural Linkage) for each observation
    const explicitOrStructuralMap = new Map<string, WiktionaryProfileRecoveryResult>();
    for (const obs of observations) {
      const explicitOrStructural = this.evaluateExplicitAndStructural(rawEntry, obs, options);
      if (explicitOrStructural) {
        explicitOrStructuralMap.set(obs.evidence.id, explicitOrStructural);
      }
    }

    // Step 2: Global Paired Proposals Collection across all observation pairs
    const pairedProposalsMap = new Map<string, ProposalWithEvidence[]>();
    for (const obs of observations) {
      pairedProposalsMap.set(obs.evidence.id, []);
    }

    const unrecoveredObservations = observations.filter((obs) => {
      const existing = explicitOrStructuralMap.get(obs.evidence.id);
      return !existing || existing.recoveryStatus === 'UNRECOVERABLE';
    });

    if (unrecoveredObservations.length >= 2) {
      // Enumerate all distinct pairs (i, j) with i < j
      for (let i = 0; i < unrecoveredObservations.length; i++) {
        for (let j = i + 1; j < unrecoveredObservations.length; j++) {
          const obsA = unrecoveredObservations[i];
          const obsB = unrecoveredObservations[j];

          // Subdivision safety check
          if (!this.areSubdivisionsCompatible(obsA, obsB)) {
            continue;
          }

          const romA = obsA.evidence.observedRomanization;
          const romB = obsB.evidence.observedRomanization;
          if (!romA || !romB || romA.trim().length === 0 || romB.trim().length === 0) {
            continue;
          }

          // Test Hypothesis 1: obsA is Classical, obsB is Iranian
          const match1 = this.analyzePositionAlignedPair(obsA.evidence.persianForm, romA, romB);
          // Test Hypothesis 2: obsB is Classical, obsA is Iranian
          const match2 = this.analyzePositionAlignedPair(obsA.evidence.persianForm, romB, romA);

          if (match1.valid && !match2.valid) {
            const evA: WiktionaryProfileRecoveryEvidence = {
              tier: 'TIER_C_PAIRED',
              method: 'PAIRED_SCHEME_CORRESPONDENCE',
              inferredProfile: 'CLASSICAL_DARI',
              detail: match1.detail,
              pairedEvidenceId: obsB.evidence.id,
              pairedObservedRomanization: romB,
              discriminativeFeatures: match1.featureStrings,
              alignedFeatures: match1.alignedFeatures
            };
            const evB: WiktionaryProfileRecoveryEvidence = {
              tier: 'TIER_C_PAIRED',
              method: 'PAIRED_SCHEME_CORRESPONDENCE',
              inferredProfile: 'IRANIAN',
              detail: match1.detail,
              pairedEvidenceId: obsA.evidence.id,
              pairedObservedRomanization: romA,
              discriminativeFeatures: match1.featureStrings,
              alignedFeatures: match1.alignedFeatures
            };
            pairedProposalsMap.get(obsA.evidence.id)!.push({ profile: 'CLASSICAL_DARI', evidence: evA });
            pairedProposalsMap.get(obsB.evidence.id)!.push({ profile: 'IRANIAN', evidence: evB });
          } else if (match2.valid && !match1.valid) {
            const evB: WiktionaryProfileRecoveryEvidence = {
              tier: 'TIER_C_PAIRED',
              method: 'PAIRED_SCHEME_CORRESPONDENCE',
              inferredProfile: 'CLASSICAL_DARI',
              detail: match2.detail,
              pairedEvidenceId: obsA.evidence.id,
              pairedObservedRomanization: romA,
              discriminativeFeatures: match2.featureStrings,
              alignedFeatures: match2.alignedFeatures
            };
            const evA: WiktionaryProfileRecoveryEvidence = {
              tier: 'TIER_C_PAIRED',
              method: 'PAIRED_SCHEME_CORRESPONDENCE',
              inferredProfile: 'IRANIAN',
              detail: match2.detail,
              pairedEvidenceId: obsB.evidence.id,
              pairedObservedRomanization: romB,
              discriminativeFeatures: match2.featureStrings,
              alignedFeatures: match2.alignedFeatures
            };
            pairedProposalsMap.get(obsB.evidence.id)!.push({ profile: 'CLASSICAL_DARI', evidence: evB });
            pairedProposalsMap.get(obsA.evidence.id)!.push({ profile: 'IRANIAN', evidence: evA });
          }
        }
      }
    }

    // Step 3: Global Reconciliation per Observation
    for (const obs of observations) {
      const eviId = obs.evidence.id;
      const explicitOrStructural = explicitOrStructuralMap.get(eviId);

      // If Tier A or Tier B resolved explicitly/structurally
      if (
        explicitOrStructural &&
        (explicitOrStructural.recoveryStatus === 'EXPLICIT' || explicitOrStructural.recoveryStatus === 'RECOVERED')
      ) {
        // Check if any paired proposals contradict the explicit/structural profile
        const paired = pairedProposalsMap.get(eviId) ?? [];
        const hasContradictingPair = paired.some((p) => p.profile !== explicitOrStructural.recoveredProfile);

        if (hasContradictingPair) {
          // Conflict between explicit/structural and paired evidence
          const confId = generateProfileRecoveryId({
            observationEvidenceId: eviId,
            sourceRecordId: obs.evidence.sourceRecordId,
            persianForm: obs.evidence.persianForm,
            recoveredProfile: 'CONFLICTING',
            method: explicitOrStructural.method,
            recoveryVersion: this.recoveryVersion,
            policyVersion: this.policyVersion
          });

          results.set(eviId, {
            ...explicitOrStructural,
            id: confId,
            recoveredProfile: 'CONFLICTING',
            effectiveProfile: 'CONFLICTING',
            recoveryStatus: 'CONFLICTING',
            blockers: [
              {
                kind: 'PROFILE_RECOVERY_CONFLICT',
                reason: 'Explicit or structural profile contradicts paired scheme correspondence proposals.'
              }
            ]
          });
        } else {
          results.set(eviId, explicitOrStructural);
        }
        continue;
      }

      // If explicit was already CONFLICTING
      if (explicitOrStructural && explicitOrStructural.recoveryStatus === 'CONFLICTING') {
        results.set(eviId, explicitOrStructural);
        continue;
      }

      // Reconcile paired proposals for this observation
      const proposals = pairedProposalsMap.get(eviId) ?? [];
      const originalProfile = classifyWiktionaryProfile(obs.metadata);

      if (proposals.length === 0) {
        // Unrecoverable
        const unrecId = generateProfileRecoveryId({
          observationEvidenceId: eviId,
          sourceRecordId: obs.evidence.sourceRecordId,
          persianForm: obs.evidence.persianForm,
          recoveredProfile: 'UNCLASSIFIED',
          method: 'NONE',
          recoveryVersion: this.recoveryVersion,
          policyVersion: this.policyVersion
        });

        results.set(eviId, {
          id: unrecId,
          observationEvidenceId: eviId,
          sourceRecordId: obs.evidence.sourceRecordId,
          sourceFormIndex: obs.metadata.sourceFormIndex,
          formHeadNr: obs.metadata.romanizationHeadNr,
          persianForm: obs.evidence.persianForm,
          observedRomanization: obs.evidence.observedRomanization ?? '',
          originalProfile,
          recoveredProfile: 'UNCLASSIFIED',
          effectiveProfile: originalProfile,
          profileOrigin: 'UNCLASSIFIED',
          recoveryStatus: 'UNRECOVERABLE',
          method: 'NONE',
          evidence: [],
          blockers: [
            {
              kind: 'PROFILE_RECOVERY_NO_SIGNAL',
              reason: 'No explicit tag, structural link, or discriminative paired correspondence found.'
            }
          ],
          recoveryVersion: this.recoveryVersion,
          policyVersion: this.policyVersion,
          recoveredAt: options?.recoveredAt
        });
        continue;
      }

      const assignedProfiles = new Set(proposals.map((p) => p.profile));

      if (assignedProfiles.size > 1) {
        // Conflicting assignments from different paired partners
        const confId = generateProfileRecoveryId({
          observationEvidenceId: eviId,
          sourceRecordId: obs.evidence.sourceRecordId,
          persianForm: obs.evidence.persianForm,
          recoveredProfile: 'CONFLICTING',
          method: 'PAIRED_SCHEME_CORRESPONDENCE',
          recoveryVersion: this.recoveryVersion,
          policyVersion: this.policyVersion
        });

        results.set(eviId, {
          id: confId,
          observationEvidenceId: eviId,
          sourceRecordId: obs.evidence.sourceRecordId,
          sourceFormIndex: obs.metadata.sourceFormIndex,
          formHeadNr: obs.metadata.romanizationHeadNr,
          persianForm: obs.evidence.persianForm,
          observedRomanization: obs.evidence.observedRomanization ?? '',
          originalProfile,
          recoveredProfile: 'CONFLICTING',
          effectiveProfile: 'CONFLICTING',
          profileOrigin: 'UNCLASSIFIED',
          recoveryStatus: 'CONFLICTING',
          method: 'PAIRED_SCHEME_CORRESPONDENCE',
          evidence: proposals.map((p) => p.evidence),
          blockers: [
            {
              kind: 'PROFILE_RECOVERY_CONFLICT',
              reason: 'Different paired observations assign contradictory profiles to this observation.'
            }
          ],
          recoveryVersion: this.recoveryVersion,
          policyVersion: this.policyVersion,
          recoveredAt: options?.recoveredAt
        });
      } else {
        // Unanimous consistent profile assignment across all valid pairs
        const recoveredProfile = proposals[0].profile;
        const allEvidence = proposals.map((p) => p.evidence);

        // Collect all paired IDs, feature signatures, and spans deterministically
        const pairedIds = allEvidence
          .map((e) => e.pairedEvidenceId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
        const featureSignatures = Array.from(
          new Set(
            allEvidence.flatMap((e) =>
              (e.alignedFeatures ?? []).map((f) => f.signatureId)
            )
          )
        ).sort();
        const spans = Array.from(
          new Set(
            allEvidence.flatMap((e) =>
              (e.alignedFeatures ?? []).map((f) => `${f.persianSpan[0]}-${f.persianSpan[1]}`)
            )
          )
        ).sort();

        const id = generateProfileRecoveryId({
          observationEvidenceId: eviId,
          sourceRecordId: obs.evidence.sourceRecordId,
          persianForm: obs.evidence.persianForm,
          recoveredProfile,
          method: 'PAIRED_SCHEME_CORRESPONDENCE',
          recoveryVersion: this.recoveryVersion,
          policyVersion: this.policyVersion,
          evidenceBasis: {
            pairedEvidenceIds: pairedIds,
            alignedFeatureSignatures: featureSignatures,
            alignedSpans: spans,
            subdivisionId: obs.metadata.romanizationHeadNr !== undefined ? `fhead:${obs.metadata.romanizationHeadNr}` : undefined
          }
        });

        results.set(eviId, {
          id,
          observationEvidenceId: eviId,
          sourceRecordId: obs.evidence.sourceRecordId,
          sourceFormIndex: obs.metadata.sourceFormIndex,
          formHeadNr: obs.metadata.romanizationHeadNr,
          persianForm: obs.evidence.persianForm,
          observedRomanization: obs.evidence.observedRomanization ?? '',
          originalProfile,
          recoveredProfile,
          effectiveProfile: recoveredProfile,
          profileOrigin: 'RECOVERED_PAIRED',
          recoveryStatus: 'RECOVERED',
          method: 'PAIRED_SCHEME_CORRESPONDENCE',
          evidence: allEvidence,
          blockers: [],
          recoveryVersion: this.recoveryVersion,
          policyVersion: this.policyVersion,
          recoveredAt: options?.recoveredAt
        });
      }
    }

    return results;
  }

  /**
   * Check subdivision compatibility between two observations.
   */
  private areSubdivisionsCompatible(
    obsA: KaikkiExtractedObservation,
    obsB: KaikkiExtractedObservation
  ): boolean {
    // Invariant: Never pair across different source records
    if (obsA.evidence.sourceRecordId !== obsB.evidence.sourceRecordId) {
      return false;
    }

    // Invariant: Persian form must match exactly
    if (obsA.evidence.persianForm !== obsB.evidence.persianForm) {
      return false;
    }

    // Invariant: Etymology number must match if both are present
    if (
      obsA.metadata.etymologyNumber !== undefined &&
      obsB.metadata.etymologyNumber !== undefined &&
      obsA.metadata.etymologyNumber !== obsB.metadata.etymologyNumber
    ) {
      return false;
    }

    // Invariant: Entry-level head_nr must match if both are present
    if (
      obsA.metadata.headNr !== undefined &&
      obsB.metadata.headNr !== undefined &&
      obsA.metadata.headNr !== obsB.metadata.headNr
    ) {
      return false;
    }

    // Invariant: Form-level romanizationHeadNr (forms[].head_nr) must match if both are present
    if (
      obsA.metadata.romanizationHeadNr !== undefined &&
      obsB.metadata.romanizationHeadNr !== undefined &&
      obsA.metadata.romanizationHeadNr !== obsB.metadata.romanizationHeadNr
    ) {
      return false;
    }

    return true;
  }

  /**
   * Tier A & Tier B Evaluation.
   */
  private evaluateExplicitAndStructural(
    rawEntry: KaikkiRawEntry,
    obs: KaikkiExtractedObservation,
    options?: ProfileRecoveryOptions
  ): WiktionaryProfileRecoveryResult | null {
    const originalProfile = classifyWiktionaryProfile(obs.metadata);
    const rawObserved = obs.evidence.observedRomanization ?? '';

    // Tier A: Explicit per-observation profile tag
    if (originalProfile === 'CLASSICAL_DARI' || originalProfile === 'IRANIAN') {
      const id = generateProfileRecoveryId({
        observationEvidenceId: obs.evidence.id,
        sourceRecordId: obs.evidence.sourceRecordId,
        persianForm: obs.evidence.persianForm,
        recoveredProfile: originalProfile,
        method: 'EXPLICIT_ROMANIZATION_TAG',
        recoveryVersion: this.recoveryVersion,
        policyVersion: this.policyVersion
      });

      const evidence: WiktionaryProfileRecoveryEvidence = {
        tier: 'TIER_A_EXPLICIT',
        method: 'EXPLICIT_ROMANIZATION_TAG',
        inferredProfile: originalProfile,
        detail: `Explicit romanization tag: ${(obs.metadata.romanizationTags ?? []).join(', ')}`,
        sourceField: obs.evidence.sourceField ?? undefined
      };

      return {
        id,
        observationEvidenceId: obs.evidence.id,
        sourceRecordId: obs.evidence.sourceRecordId,
        sourceFormIndex: obs.metadata.sourceFormIndex,
        formHeadNr: obs.metadata.romanizationHeadNr,
        persianForm: obs.evidence.persianForm,
        observedRomanization: rawObserved,
        originalProfile,
        recoveredProfile: originalProfile,
        effectiveProfile: originalProfile,
        profileOrigin: 'EXPLICIT',
        recoveryStatus: 'EXPLICIT',
        method: 'EXPLICIT_ROMANIZATION_TAG',
        evidence: [evidence],
        blockers: [],
        recoveryVersion: this.recoveryVersion,
        policyVersion: this.policyVersion,
        recoveredAt: options?.recoveredAt
      };
    }

    if (originalProfile === 'CONFLICTING') {
      const id = generateProfileRecoveryId({
        observationEvidenceId: obs.evidence.id,
        sourceRecordId: obs.evidence.sourceRecordId,
        persianForm: obs.evidence.persianForm,
        recoveredProfile: 'CONFLICTING',
        method: 'EXPLICIT_ROMANIZATION_TAG',
        recoveryVersion: this.recoveryVersion,
        policyVersion: this.policyVersion
      });

      return {
        id,
        observationEvidenceId: obs.evidence.id,
        sourceRecordId: obs.evidence.sourceRecordId,
        sourceFormIndex: obs.metadata.sourceFormIndex,
        formHeadNr: obs.metadata.romanizationHeadNr,
        persianForm: obs.evidence.persianForm,
        observedRomanization: rawObserved,
        originalProfile: 'CONFLICTING',
        recoveredProfile: 'CONFLICTING',
        effectiveProfile: 'CONFLICTING',
        profileOrigin: 'EXPLICIT',
        recoveryStatus: 'CONFLICTING',
        method: 'EXPLICIT_ROMANIZATION_TAG',
        evidence: [],
        blockers: [
          {
            kind: 'PROFILE_RECOVERY_CONFLICT',
            reason: 'Observation contains contradictory explicit variety tags.'
          }
        ],
        recoveryVersion: this.recoveryVersion,
        policyVersion: this.policyVersion,
        recoveredAt: options?.recoveredAt
      };
    }

    // Tier B: Direct structural template linkage with verified template semantics
    if (
      this.structuralRules.length > 0 &&
      Array.isArray(rawEntry.head_templates) &&
      obs.metadata.sourceFormIndex !== undefined
    ) {
      for (const tmpl of rawEntry.head_templates) {
        if (tmpl && typeof tmpl === 'object' && 'args' in tmpl && tmpl.args && typeof tmpl.args === 'object') {
          const tmplName = String((tmpl as any).name ?? '').trim();
          const args = tmpl.args as Record<string, unknown>;

          for (const rule of this.structuralRules) {
            if (rule.templateName !== tmplName) {
              continue;
            }

            const rawVal = args[rule.argumentName];
            if (typeof rawVal === 'string' && isValidStructuralTransliteration(rawVal)) {
              const argVal = rawVal.trim();
              if (argVal === rawObserved.trim()) {
                const targetProfile: WiktionaryPersianRomanizationProfile =
                  rule.semantic === 'CLASSICAL_ROMANIZATION' ? 'CLASSICAL_DARI' : 'IRANIAN';

                // Validate script alignment under targetProfile
                const alignResult = alignAndTransduceWiktionary({
                  persianForm: obs.evidence.persianForm,
                  observedRomanization: argVal,
                  sourceProfile: targetProfile
                });

                if (alignResult.success) {
                  const id = generateProfileRecoveryId({
                    observationEvidenceId: obs.evidence.id,
                    sourceRecordId: obs.evidence.sourceRecordId,
                    persianForm: obs.evidence.persianForm,
                    recoveredProfile: targetProfile,
                    method: 'STRUCTURAL_TEMPLATE_LINK',
                    recoveryVersion: this.recoveryVersion,
                    policyVersion: this.policyVersion,
                    evidenceBasis: {
                      templateName: tmplName,
                      templateArgName: rule.argumentName,
                      templateArgValue: argVal
                    }
                  });

                  return {
                    id,
                    observationEvidenceId: obs.evidence.id,
                    sourceRecordId: obs.evidence.sourceRecordId,
                    sourceFormIndex: obs.metadata.sourceFormIndex,
                    formHeadNr: obs.metadata.romanizationHeadNr,
                    persianForm: obs.evidence.persianForm,
                    observedRomanization: rawObserved,
                    originalProfile: 'UNCLASSIFIED',
                    recoveredProfile: targetProfile,
                    effectiveProfile: targetProfile,
                    profileOrigin: 'RECOVERED_STRUCTURAL',
                    recoveryStatus: 'RECOVERED',
                    method: 'STRUCTURAL_TEMPLATE_LINK',
                    evidence: [
                      {
                        tier: 'TIER_B_STRUCTURAL',
                        method: 'STRUCTURAL_TEMPLATE_LINK',
                        inferredProfile: targetProfile,
                        detail: `Matched verified ${rule.semantic} argument '${rule.argumentName}' in template ${tmplName}`,
                        templateName: tmplName,
                        templateArgName: rule.argumentName,
                        templateArgValue: argVal
                      }
                    ],
                    blockers: [],
                    recoveryVersion: this.recoveryVersion,
                    policyVersion: this.policyVersion,
                    recoveredAt: options?.recoveredAt
                  };
                }
              }
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Evaluates position-aligned correspondence between a candidate Classical and Iranian romanization.
   */
  private analyzePositionAlignedPair(
    persianForm: string,
    romCls: string,
    romIra: string
  ): {
    valid: boolean;
    featureStrings: string[];
    alignedFeatures: AlignedDiscriminativeSlotFeature[];
    detail: string;
    blocker?: ProfileRecoveryBlocker;
  } {
    if (romCls.trim().toLowerCase() === romIra.trim().toLowerCase()) {
      return {
        valid: false,
        featureStrings: [],
        alignedFeatures: [],
        detail: 'Identical romanizations cannot form a distinctive pair.'
      };
    }

    const clsLower = romCls.normalize('NFC').toLowerCase().trim();
    const iraLower = romIra.normalize('NFC').toLowerCase().trim();

    // 1. Negative constraint check: prohibited markers in the opposite scheme
    if (clsLower.includes('â') || clsLower.includes('ey') || clsLower.includes('ow')) {
      return {
        valid: false,
        featureStrings: [],
        alignedFeatures: [],
        detail: 'Candidate Classical string contains Iranian markers (â/ey/ow).'
      };
    }
    if (
      iraLower.includes('ā') ||
      iraLower.includes('ī') ||
      iraLower.includes('ū') ||
      iraLower.includes('ē') ||
      iraLower.includes('ō')
    ) {
      return {
        valid: false,
        featureStrings: [],
        alignedFeatures: [],
        detail: 'Candidate Iranian string contains Classical macron markers (ā/ī/ū/ē/ō).'
      };
    }

    // 2. Script-aware alignment and slot tracing for both candidate profiles
    const alignCls = alignAndTransduceWiktionary({
      persianForm,
      observedRomanization: romCls,
      sourceProfile: 'CLASSICAL_DARI'
    });
    if (!alignCls.success || !alignCls.trace) {
      return {
        valid: false,
        featureStrings: [],
        alignedFeatures: [],
        detail: 'Candidate Classical form failed script-aware alignment.',
        blocker: {
          kind: 'PROFILE_RECOVERY_ALIGNMENT_FAILED',
          reason: 'Classical candidate failed script alignment.'
        }
      };
    }

    const alignIra = alignAndTransduceWiktionary({
      persianForm,
      observedRomanization: romIra,
      sourceProfile: 'IRANIAN'
    });
    if (!alignIra.success || !alignIra.trace) {
      return {
        valid: false,
        featureStrings: [],
        alignedFeatures: [],
        detail: 'Candidate Iranian form failed script-aware alignment.',
        blocker: {
          kind: 'PROFILE_RECOVERY_ALIGNMENT_FAILED',
          reason: 'Iranian candidate failed script alignment.'
        }
      };
    }

    // 3. Consonantal Skeleton Verification from Aligned Consonant Slots
    const consonantsCls = alignCls.trace.filter((s) => s.role === 'CONSONANT');
    const consonantsIra = alignIra.trace.filter((s) => s.role === 'CONSONANT');

    if (consonantsCls.length !== consonantsIra.length) {
      return {
        valid: false,
        featureStrings: [],
        alignedFeatures: [],
        detail: `Consonant slot count mismatch: ${consonantsCls.length} vs ${consonantsIra.length}.`
      };
    }

    for (let c = 0; c < consonantsCls.length; c++) {
      const slotC = consonantsCls[c];
      const slotI = consonantsIra[c];
      if (
        slotC.persianSpan[0] !== slotI.persianSpan[0] ||
        slotC.persianSpan[1] !== slotI.persianSpan[1] ||
        slotC.targetUnit !== slotI.targetUnit
      ) {
        return {
          valid: false,
          featureStrings: [],
          alignedFeatures: [],
          detail: `Incompatible consonant slot alignment at span [${slotC.persianSpan[0]}, ${slotC.persianSpan[1]}].`
        };
      }
    }

    // 4. Position-Aligned Discriminative Slot Analysis
    // Match vowel/diphthong slots aligning to the exact same Persian span/context
    const vowelsCls = alignCls.trace.filter((s) => s.role !== 'CONSONANT');
    const vowelsIra = alignIra.trace.filter((s) => s.role !== 'CONSONANT');

    const matchedFeatures: AlignedDiscriminativeSlotFeature[] = [];
    const featureStrings: string[] = [];
    const matchedSlotKeys = new Set<string>();

    for (const vCls of vowelsCls) {
      // Find corresponding Iranian vowel slot with the same Persian span
      const vIra = vowelsIra.find(
        (vi) =>
          vi.persianSpan[0] === vCls.persianSpan[0] &&
          vi.persianSpan[1] === vCls.persianSpan[1] &&
          vi.role === vCls.role
      );

      if (!vIra) {
        continue;
      }

      const correspondence = matchAlignedSlotCorrespondence(vCls.sourceUnit, vIra.sourceUnit);
      if (!correspondence) {
        // Incompatible vowel units at the same aligned Persian slot
        return {
          valid: false,
          featureStrings: [],
          alignedFeatures: [],
          detail: `Incompatible vowel correspondence at span [${vCls.persianSpan[0]}, ${vCls.persianSpan[1]}]: "${vCls.sourceUnit}" vs "${vIra.sourceUnit}".`
        };
      }

      if (correspondence.isDiscriminative) {
        const slotKey = `${vCls.persianSpan[0]}-${vCls.persianSpan[1]}-${correspondence.signatureId}`;
        if (!matchedSlotKeys.has(slotKey)) {
          matchedSlotKeys.add(slotKey);
          matchedFeatures.push({
            signatureId: correspondence.signatureId,
            phenomenon: correspondence.phenomenon,
            persianSpan: vCls.persianSpan,
            persianGraphemes: vCls.persianGraphemes,
            classicalUnit: vCls.sourceUnit,
            iranianUnit: vIra.sourceUnit
          });
          featureStrings.push(
            `[${vCls.persianSpan[0]}:${vCls.persianSpan[1]}] ${vCls.sourceUnit} (Classical) ↔ ${vIra.sourceUnit} (Iranian) [${correspondence.phenomenon}]`
          );
        }
      }
    }

    // Require >= 2 independent discriminative correspondences across distinct aligned slots
    if (matchedFeatures.length < 2) {
      return {
        valid: false,
        featureStrings,
        alignedFeatures: matchedFeatures,
        detail: `Insufficient position-aligned discriminative signal (${matchedFeatures.length} found, minimum 2 required).`
      };
    }

    return {
      valid: true,
      featureStrings,
      alignedFeatures: matchedFeatures,
      detail: `Validated position-aligned paired correspondence: ${featureStrings.join(', ')}`
    };
  }
}
