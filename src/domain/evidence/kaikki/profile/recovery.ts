/**
 * Wiktionary Persian Profile Recovery Engine (Phase 7E).
 *
 * Implements Tier A (Explicit), Tier B (Structural Linkage), and Tier C (Paired-Scheme Correspondence).
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
  PROFILE_POLICY_VERSION,
  PROFILE_RECOVERY_VERSION,
  type ProfileRecoveryMethod,
  type WiktionaryProfileRecoveryEvidence,
  type WiktionaryProfileRecoveryResult
} from './types';

export function generateProfileRecoveryId(params: {
  observationEvidenceId: string;
  sourceRecordId: string | null;
  recoveredProfile: WiktionaryPersianRomanizationProfile;
  method: ProfileRecoveryMethod;
  recoveryVersion: string;
  policyVersion: string;
}): string {
  const hash = crypto.createHash('sha256');
  hash.update(params.observationEvidenceId);
  hash.update('\0');
  hash.update(params.sourceRecordId ?? '');
  hash.update('\0');
  hash.update(params.recoveredProfile);
  hash.update('\0');
  hash.update(params.method);
  hash.update('\0');
  hash.update(params.recoveryVersion);
  hash.update('\0');
  hash.update(params.policyVersion);
  const digest = hash.digest('hex').slice(0, 16);
  return `rec-${digest}`;
}

/**
 * Valid correspondence between Classical and Iranian vowels/diphthongs in Wiktionary.
 */
const VALID_VOWEL_CORRESPONDENCES: Array<{
  cls: string;
  ira: string;
  phenomenon: string;
  isDiscriminative: boolean;
}> = [
  { cls: 'ā', ira: 'â', phenomenon: 'Long A', isDiscriminative: true },
  { cls: 'i', ira: 'e', phenomenon: 'Kasra (short i/e)', isDiscriminative: true },
  { cls: 'u', ira: 'o', phenomenon: 'Zamma (short u/o)', isDiscriminative: true },
  { cls: 'ī', ira: 'i', phenomenon: 'Long I', isDiscriminative: true },
  { cls: 'ū', ira: 'u', phenomenon: 'Long U', isDiscriminative: true },
  { cls: 'ē', ira: 'i', phenomenon: 'Majhul E', isDiscriminative: true },
  { cls: 'ē', ira: 'e', phenomenon: 'Majhul E / Short E', isDiscriminative: true },
  { cls: 'ō', ira: 'u', phenomenon: 'Majhul O', isDiscriminative: true },
  { cls: 'ō', ira: 'o', phenomenon: 'Majhul O / Short O', isDiscriminative: true },
  { cls: 'ay', ira: 'ey', phenomenon: 'Diphthong ay/ey', isDiscriminative: true },
  { cls: 'ai', ira: 'ey', phenomenon: 'Diphthong ai/ey', isDiscriminative: true },
  { cls: 'aw', ira: 'ow', phenomenon: 'Diphthong aw/ow', isDiscriminative: true },
  { cls: 'au', ira: 'ow', phenomenon: 'Diphthong au/ow', isDiscriminative: true },
  { cls: 'a', ira: 'a', phenomenon: 'Fathah (short a)', isDiscriminative: false }
];

export interface ProfileRecoveryOptions {
  recoveryVersion?: string;
  policyVersion?: string;
  recoveredAt?: string;
}

export class WiktionaryProfileRecoveryEngine {
  private readonly recoveryVersion: string;
  private readonly policyVersion: string;

  constructor(options?: ProfileRecoveryOptions) {
    this.recoveryVersion = options?.recoveryVersion ?? PROFILE_RECOVERY_VERSION;
    this.policyVersion = options?.policyVersion ?? PROFILE_POLICY_VERSION;
  }

  /**
   * Recovers profile identities for all observations belonging to a single source entry/record.
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
    const intermediateResults: Array<{
      obs: KaikkiExtractedObservation;
      explicitOrStructuralResult: WiktionaryProfileRecoveryResult | null;
    }> = [];

    for (const obs of observations) {
      const explicitOrStructural = this.evaluateExplicitAndStructural(rawEntry, obs, options);
      intermediateResults.push({ obs, explicitOrStructuralResult: explicitOrStructural });
    }

    // Step 2: Check if all observations were resolved by Tier A/B
    const unrecoveredObservations: KaikkiExtractedObservation[] = [];
    for (const item of intermediateResults) {
      if (item.explicitOrStructuralResult && item.explicitOrStructuralResult.recoveryStatus !== 'UNRECOVERABLE') {
        results.set(item.obs.evidence.id, item.explicitOrStructuralResult);
      } else {
        unrecoveredObservations.push(item.obs);
      }
    }

    if (unrecoveredObservations.length === 0) {
      return results;
    }

    // Step 3: Tier C (Paired-Scheme Correspondence) on remaining unrecovered observations
    const pairedResults = this.evaluatePairedCorrespondences(rawEntry, unrecoveredObservations, options);
    for (const [eviId, res] of pairedResults.entries()) {
      results.set(eviId, res);
    }

    // Step 4: Ensure all observations receive a deterministic result record
    for (const obs of observations) {
      if (!results.has(obs.evidence.id)) {
        const originalProfile = classifyWiktionaryProfile(obs.metadata);
        const unrecoverableId = generateProfileRecoveryId({
          observationEvidenceId: obs.evidence.id,
          sourceRecordId: obs.evidence.sourceRecordId,
          recoveredProfile: 'UNCLASSIFIED',
          method: 'NONE',
          recoveryVersion: this.recoveryVersion,
          policyVersion: this.policyVersion
        });

        results.set(obs.evidence.id, {
          id: unrecoverableId,
          observationEvidenceId: obs.evidence.id,
          sourceRecordId: obs.evidence.sourceRecordId,
          sourceFormIndex: obs.metadata.sourceFormIndex,
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
      }
    }

    return results;
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

    // Tier B: Direct structural template linkage
    if (Array.isArray(rawEntry.head_templates) && obs.metadata.sourceFormIndex !== undefined) {
      for (const tmpl of rawEntry.head_templates) {
        if (tmpl && typeof tmpl === 'object' && 'args' in tmpl && tmpl.args && typeof tmpl.args === 'object') {
          const args = tmpl.args as Record<string, unknown>;
          const tmplName = String((tmpl as any).name ?? '');

          // Check explicit cls / ira parameter bindings
          if (typeof args.cls === 'string' && args.cls.trim() === rawObserved.trim()) {
            const id = generateProfileRecoveryId({
              observationEvidenceId: obs.evidence.id,
              sourceRecordId: obs.evidence.sourceRecordId,
              recoveredProfile: 'CLASSICAL_DARI',
              method: 'STRUCTURAL_TEMPLATE_LINK',
              recoveryVersion: this.recoveryVersion,
              policyVersion: this.policyVersion
            });

            return {
              id,
              observationEvidenceId: obs.evidence.id,
              sourceRecordId: obs.evidence.sourceRecordId,
              sourceFormIndex: obs.metadata.sourceFormIndex,
              persianForm: obs.evidence.persianForm,
              observedRomanization: rawObserved,
              originalProfile: 'UNCLASSIFIED',
              recoveredProfile: 'CLASSICAL_DARI',
              effectiveProfile: 'CLASSICAL_DARI',
              profileOrigin: 'RECOVERED_STRUCTURAL',
              recoveryStatus: 'RECOVERED',
              method: 'STRUCTURAL_TEMPLATE_LINK',
              evidence: [
                {
                  tier: 'TIER_B_STRUCTURAL',
                  method: 'STRUCTURAL_TEMPLATE_LINK',
                  inferredProfile: 'CLASSICAL_DARI',
                  detail: `Matched explicit Classical argument in template ${tmplName}`,
                  templateName: tmplName,
                  templateArgName: 'cls',
                  templateArgValue: args.cls
                }
              ],
              blockers: [],
              recoveryVersion: this.recoveryVersion,
              policyVersion: this.policyVersion,
              recoveredAt: options?.recoveredAt
            };
          }

          if (typeof args.ira === 'string' && args.ira.trim() === rawObserved.trim()) {
            const id = generateProfileRecoveryId({
              observationEvidenceId: obs.evidence.id,
              sourceRecordId: obs.evidence.sourceRecordId,
              recoveredProfile: 'IRANIAN',
              method: 'STRUCTURAL_TEMPLATE_LINK',
              recoveryVersion: this.recoveryVersion,
              policyVersion: this.policyVersion
            });

            return {
              id,
              observationEvidenceId: obs.evidence.id,
              sourceRecordId: obs.evidence.sourceRecordId,
              sourceFormIndex: obs.metadata.sourceFormIndex,
              persianForm: obs.evidence.persianForm,
              observedRomanization: rawObserved,
              originalProfile: 'UNCLASSIFIED',
              recoveredProfile: 'IRANIAN',
              effectiveProfile: 'IRANIAN',
              profileOrigin: 'RECOVERED_STRUCTURAL',
              recoveryStatus: 'RECOVERED',
              method: 'STRUCTURAL_TEMPLATE_LINK',
              evidence: [
                {
                  tier: 'TIER_B_STRUCTURAL',
                  method: 'STRUCTURAL_TEMPLATE_LINK',
                  inferredProfile: 'IRANIAN',
                  detail: `Matched explicit Iranian argument in template ${tmplName}`,
                  templateName: tmplName,
                  templateArgName: 'ira',
                  templateArgValue: args.ira
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

    return null;
  }

  /**
   * Tier C: Paired-Scheme Correspondence Evaluation.
   */
  private evaluatePairedCorrespondences(
    rawEntry: KaikkiRawEntry,
    unrecoveredObs: KaikkiExtractedObservation[],
    options?: ProfileRecoveryOptions
  ): Map<string, WiktionaryProfileRecoveryResult> {
    const results = new Map<string, WiktionaryProfileRecoveryResult>();

    // Paired analysis requires at least 2 observations with non-empty romanizations
    const candidatePairs = unrecoveredObs.filter(
      (o) => o.evidence.observedRomanization && o.evidence.observedRomanization.trim().length > 0
    );

    if (candidatePairs.length < 2) {
      return results;
    }

    // Try all distinct pairs (i, j)
    for (let i = 0; i < candidatePairs.length; i++) {
      for (let j = i + 1; j < candidatePairs.length; j++) {
        const obsA = candidatePairs[i];
        const obsB = candidatePairs[j];

        // Invariant: Never pair across different source records
        if (obsA.evidence.sourceRecordId !== obsB.evidence.sourceRecordId) {
          continue;
        }

        // Invariant: Never pair across different etymology numbers if specified
        if (
          obsA.metadata.etymologyNumber !== undefined &&
          obsB.metadata.etymologyNumber !== undefined &&
          obsA.metadata.etymologyNumber !== obsB.metadata.etymologyNumber
        ) {
          continue;
        }

        // Invariant: Never pair across different head numbers if specified
        if (
          obsA.metadata.headNr !== undefined &&
          obsB.metadata.headNr !== undefined &&
          obsA.metadata.headNr !== obsB.metadata.headNr
        ) {
          continue;
        }

        // Invariant: Persian form must match exactly
        if (obsA.evidence.persianForm !== obsB.evidence.persianForm) {
          continue;
        }

        // Skip if either is already recovered
        if (results.has(obsA.evidence.id) && results.has(obsB.evidence.id)) {
          continue;
        }

        const romA = obsA.evidence.observedRomanization!;
        const romB = obsB.evidence.observedRomanization!;

        // Test Assignment 1: A is CLASSICAL_DARI, B is IRANIAN
        const match1 = this.analyzePairAssignment(obsA.evidence.persianForm, romA, romB);
        // Test Assignment 2: B is CLASSICAL_DARI, A is IRANIAN
        const match2 = this.analyzePairAssignment(obsA.evidence.persianForm, romB, romA);

        if (match1.valid && !match2.valid) {
          this.applyPairedRecovery(obsA, 'CLASSICAL_DARI', obsB, 'IRANIAN', match1, results, options);
        } else if (match2.valid && !match1.valid) {
          this.applyPairedRecovery(obsB, 'CLASSICAL_DARI', obsA, 'IRANIAN', match2, results, options);
        } else if (match1.valid && match2.valid) {
          // Ambiguous symmetrical match
          this.applyAmbiguousBlock(obsA, obsB, results, options);
        }
      }
    }

    return results;
  }

  /**
   * Tests whether (romCls, romIra) form a valid, script-anchored Classical↔Iranian correspondence pair.
   */
  private analyzePairAssignment(
    persianForm: string,
    romCls: string,
    romIra: string
  ): {
    valid: boolean;
    discriminativeFeatures: string[];
    detail: string;
  } {
    if (romCls === romIra) {
      return { valid: false, discriminativeFeatures: [], detail: 'Identical romanizations cannot form a distinctive pair.' };
    }

    // 1. Incompatible consonantal alignment / skeleton check
    const consonantsCls = romCls.normalize('NFD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[aeiouāīūēōâ'-]/gi, '');
    const consonantsIra = romIra.normalize('NFD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[aeiouāīūēōâ'-]/gi, '');
    if (consonantsCls !== consonantsIra) {
      return {
        valid: false,
        discriminativeFeatures: [],
        detail: `Consonantal skeleton mismatch: "${consonantsCls}" vs "${consonantsIra}".`
      };
    }

    // 2. Script-aware alignment check for both forms under tentative profiles
    const alignCls = alignAndTransduceWiktionary({
      persianForm,
      observedRomanization: romCls,
      sourceProfile: 'CLASSICAL_DARI'
    });
    if (!alignCls.success || alignCls.blockers.some((b) => b.kind === 'SOURCE_SCRIPT_ALIGNMENT_FAILED')) {
      return { valid: false, discriminativeFeatures: [], detail: 'Classical form failed script-aware alignment.' };
    }

    const alignIra = alignAndTransduceWiktionary({
      persianForm,
      observedRomanization: romIra,
      sourceProfile: 'IRANIAN'
    });
    if (!alignIra.success || alignIra.blockers.some((b) => b.kind === 'SOURCE_SCRIPT_ALIGNMENT_FAILED')) {
      return { valid: false, discriminativeFeatures: [], detail: 'Iranian form failed script-aware alignment.' };
    }

    // 3. Discriminative Feature Analysis
    const clsLower = romCls.normalize('NFC').toLowerCase();
    const iraLower = romIra.normalize('NFC').toLowerCase();

    // Check for negative constraints (prohibited features in wrong scheme)
    if (clsLower.includes('â') || clsLower.includes('ey') || clsLower.includes('ow')) {
      return { valid: false, discriminativeFeatures: [], detail: 'Candidate Classical string contains Iranian markers.' };
    }
    if (iraLower.includes('ā') || iraLower.includes('ī') || iraLower.includes('ū') || iraLower.includes('ē') || iraLower.includes('ō')) {
      return { valid: false, discriminativeFeatures: [], detail: 'Candidate Iranian string contains Classical markers.' };
    }

    const discriminativeFeatures: string[] = [];

    // Check known vowel pair correspondences
    for (const corr of VALID_VOWEL_CORRESPONDENCES) {
      if (corr.isDiscriminative) {
        if (clsLower.includes(corr.cls) && iraLower.includes(corr.ira)) {
          discriminativeFeatures.push(`${corr.cls} (Classical) ↔ ${corr.ira} (Iranian) [${corr.phenomenon}]`);
        }
      }
    }

    // Require >= 2 independent discriminative correspondences (or >= 1 if no other vowel slots exist)
    // Favor precision over yield: require >= 2 discriminative features for robust paired recovery
    if (discriminativeFeatures.length < 2) {
      return {
        valid: false,
        discriminativeFeatures,
        detail: `Insufficient discriminative signal (${discriminativeFeatures.length} found, minimum 2 required for paired recovery).`
      };
    }

    return {
      valid: true,
      discriminativeFeatures,
      detail: `Validated paired correspondence: ${discriminativeFeatures.join(', ')}`
    };
  }

  private applyPairedRecovery(
    obsCls: KaikkiExtractedObservation,
    profileCls: 'CLASSICAL_DARI',
    obsIra: KaikkiExtractedObservation,
    profileIra: 'IRANIAN',
    match: { discriminativeFeatures: string[]; detail: string },
    results: Map<string, WiktionaryProfileRecoveryResult>,
    options?: ProfileRecoveryOptions
  ): void {
    const idCls = generateProfileRecoveryId({
      observationEvidenceId: obsCls.evidence.id,
      sourceRecordId: obsCls.evidence.sourceRecordId,
      recoveredProfile: profileCls,
      method: 'PAIRED_SCHEME_CORRESPONDENCE',
      recoveryVersion: this.recoveryVersion,
      policyVersion: this.policyVersion
    });

    const idIra = generateProfileRecoveryId({
      observationEvidenceId: obsIra.evidence.id,
      sourceRecordId: obsIra.evidence.sourceRecordId,
      recoveredProfile: profileIra,
      method: 'PAIRED_SCHEME_CORRESPONDENCE',
      recoveryVersion: this.recoveryVersion,
      policyVersion: this.policyVersion
    });

    results.set(obsCls.evidence.id, {
      id: idCls,
      observationEvidenceId: obsCls.evidence.id,
      sourceRecordId: obsCls.evidence.sourceRecordId,
      sourceFormIndex: obsCls.metadata.sourceFormIndex,
      persianForm: obsCls.evidence.persianForm,
      observedRomanization: obsCls.evidence.observedRomanization ?? '',
      originalProfile: 'UNCLASSIFIED',
      recoveredProfile: profileCls,
      effectiveProfile: profileCls,
      profileOrigin: 'RECOVERED_PAIRED',
      recoveryStatus: 'RECOVERED',
      method: 'PAIRED_SCHEME_CORRESPONDENCE',
      evidence: [
        {
          tier: 'TIER_C_PAIRED',
          method: 'PAIRED_SCHEME_CORRESPONDENCE',
          inferredProfile: profileCls,
          detail: match.detail,
          pairedEvidenceId: obsIra.evidence.id,
          pairedObservedRomanization: obsIra.evidence.observedRomanization ?? undefined,
          discriminativeFeatures: match.discriminativeFeatures
        }
      ],
      blockers: [],
      recoveryVersion: this.recoveryVersion,
      policyVersion: this.policyVersion,
      recoveredAt: options?.recoveredAt
    });

    results.set(obsIra.evidence.id, {
      id: idIra,
      observationEvidenceId: obsIra.evidence.id,
      sourceRecordId: obsIra.evidence.sourceRecordId,
      sourceFormIndex: obsIra.metadata.sourceFormIndex,
      persianForm: obsIra.evidence.persianForm,
      observedRomanization: obsIra.evidence.observedRomanization ?? '',
      originalProfile: 'UNCLASSIFIED',
      recoveredProfile: profileIra,
      effectiveProfile: profileIra,
      profileOrigin: 'RECOVERED_PAIRED',
      recoveryStatus: 'RECOVERED',
      method: 'PAIRED_SCHEME_CORRESPONDENCE',
      evidence: [
        {
          tier: 'TIER_C_PAIRED',
          method: 'PAIRED_SCHEME_CORRESPONDENCE',
          inferredProfile: profileIra,
          detail: match.detail,
          pairedEvidenceId: obsCls.evidence.id,
          pairedObservedRomanization: obsCls.evidence.observedRomanization ?? undefined,
          discriminativeFeatures: match.discriminativeFeatures
        }
      ],
      blockers: [],
      recoveryVersion: this.recoveryVersion,
      policyVersion: this.policyVersion,
      recoveredAt: options?.recoveredAt
    });
  }

  private applyAmbiguousBlock(
    obsA: KaikkiExtractedObservation,
    obsB: KaikkiExtractedObservation,
    results: Map<string, WiktionaryProfileRecoveryResult>,
    options?: ProfileRecoveryOptions
  ): void {
    for (const obs of [obsA, obsB]) {
      const id = generateProfileRecoveryId({
        observationEvidenceId: obs.evidence.id,
        sourceRecordId: obs.evidence.sourceRecordId,
        recoveredProfile: 'UNCLASSIFIED',
        method: 'PAIRED_SCHEME_CORRESPONDENCE',
        recoveryVersion: this.recoveryVersion,
        policyVersion: this.policyVersion
      });

      results.set(obs.evidence.id, {
        id,
        observationEvidenceId: obs.evidence.id,
        sourceRecordId: obs.evidence.sourceRecordId,
        sourceFormIndex: obs.metadata.sourceFormIndex,
        persianForm: obs.evidence.persianForm,
        observedRomanization: obs.evidence.observedRomanization ?? '',
        originalProfile: 'UNCLASSIFIED',
        recoveredProfile: 'UNCLASSIFIED',
        effectiveProfile: 'UNCLASSIFIED',
        profileOrigin: 'UNCLASSIFIED',
        recoveryStatus: 'UNRECOVERABLE',
        method: 'PAIRED_SCHEME_CORRESPONDENCE',
        evidence: [],
        blockers: [
          {
            kind: 'PROFILE_RECOVERY_AMBIGUOUS_PAIRING',
            reason: 'Symmetrical correspondence match; cannot disambiguate profile roles unambiguously.'
          }
        ],
        recoveryVersion: this.recoveryVersion,
        policyVersion: this.policyVersion,
        recoveredAt: options?.recoveredAt
      });
    }
  }
}
