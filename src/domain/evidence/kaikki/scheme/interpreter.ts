/**
 * Pure interpreter for Kaikki / Wiktionary Persian evidence observations (Phase 7B).
 *
 * Core scholarly invariants:
 *   1. Interpretation is non-authoritative (produces target-scheme hypothesis only).
 *   2. Raw evidence is NEVER mutated (preserves original bytes/Unicode).
 *   3. Never performs global Latin search-and-replace.
 *   4. Relies on script-aware alignment + source-profile semantics.
 *   5. Preserves blockers with fine-grained diagnostics.
 *   6. Zero circularity: never queries runtime engine or authoritative lexicon.
 */

import { normalizePersian } from '../../../normalization';
import type { LexicalEvidence } from '../../types';
import { KAIKKI_SOURCE_ID } from '../extractor';
import { resolveEffectiveWiktionaryProfile } from '../profile/effective';
import type { WiktionaryProfileRecoveryResult } from '../profile/types';
import type { KaikkiEvidenceMetadata, KaikkiExtractedObservation } from '../types';
import { alignAndTransduceWiktionary } from './aligner';
import {
  computeMetadataFingerprint,
  generateKaikkiInterpretationId
} from './identity';
import {
  WIKT_INTERPRETATION_RULESET_VERSION,
  WIKT_INTERPRETER_VERSION
} from './rules';
import type {
  KaikkiSchemeInterpretation,
  SchemeInterpretationStatus
} from './types';

export interface KaikkiInterpretationOptions {
  candidateId?: string | null;
  profileRecovery?: WiktionaryProfileRecoveryResult | null;
  interpreterVersion?: string;
  ruleSetVersion?: string;
  analyzedAt?: string;
}

/**
 * Interpret an individual Kaikki LexicalEvidence observation into a non-authoritative IJMES hypothesis.
 */
export function interpretKaikkiEvidence(
  evidence: LexicalEvidence,
  metadata: KaikkiEvidenceMetadata,
  options?: KaikkiInterpretationOptions
): KaikkiSchemeInterpretation {
  const interpreterVersion = options?.interpreterVersion ?? WIKT_INTERPRETER_VERSION;
  const ruleSetVersion = options?.ruleSetVersion ?? WIKT_INTERPRETATION_RULESET_VERSION;
  const candidateId = options?.candidateId ?? null;
  const rawObserved = evidence.observedRomanization ?? '';

  // Check intrinsic metadata binding
  const normalizedPersian = normalizePersian(evidence.persianForm).normalizedInput;
  const isValidMetadata =
    metadata &&
    metadata.rawSourceWord === evidence.persianForm &&
    metadata.normalizedForm === normalizedPersian &&
    (!evidence.provenance?.sourceId || evidence.provenance.sourceId === KAIKKI_SOURCE_ID) &&
    (!evidence.sourceField ||
      !evidence.sourceField.startsWith('forms[') ||
      metadata.sourceFormIndex === undefined ||
      evidence.sourceField === `forms[${metadata.sourceFormIndex}]`);

  if (!isValidMetadata) {
    const invalidId = generateKaikkiInterpretationId({
      evidenceId: evidence.id,
      sourceProfile: 'UNCLASSIFIED',
      sourceMetadataFingerprint: 'insufficient-meta',
      targetScheme: 'IJMES',
      interpreterVersion,
      ruleSetVersion,
      persianForm: evidence.persianForm,
      observedRomanization: rawObserved
    });

    return {
      id: invalidId,
      candidateId,
      evidenceId: evidence.id,
      sourceProfile: 'UNCLASSIFIED',
      sourceMetadataFingerprint: 'insufficient-meta',
      sourceTags: [],
      sourceScheme: 'LOCAL',
      targetScheme: 'IJMES',
      rawObservedRomanization: rawObserved,
      comparisonSourceForm: rawObserved.normalize('NFC').toLowerCase(),
      targetHypothesis: null,
      status: 'CONTEXT_REQUIRED',
      appliedRuleIds: [],
      blockers: [
        {
          kind: 'INSUFFICIENT_SOURCE_METADATA',
          reason: 'Kaikki metadata is missing, incomplete, or does not match the evidence observation.'
        }
      ],
      profileOrigin: 'UNCLASSIFIED',
      interpreterVersion,
      ruleSetVersion,
      analyzedAt: options?.analyzedAt
    };
  }

  const profileResolution = resolveEffectiveWiktionaryProfile(metadata, options?.profileRecovery);
  const sourceProfile = profileResolution.effectiveProfile;
  const profileOrigin = profileResolution.profileOrigin;
  const recoveryId = profileResolution.recoveryId;
  const metadataFingerprint = computeMetadataFingerprint(metadata);

  const id = generateKaikkiInterpretationId({
    evidenceId: evidence.id,
    sourceProfile,
    sourceMetadataFingerprint: metadataFingerprint,
    targetScheme: 'IJMES',
    interpreterVersion,
    ruleSetVersion,
    persianForm: evidence.persianForm,
    observedRomanization: rawObserved,
    recoveryId
  });

  const sourceTags = metadata.romanizationTags ?? [];

  // Check 1: Missing romanization
  if (!evidence.observedRomanization || evidence.observedRomanization.trim() === '') {
    return {
      id,
      candidateId,
      evidenceId: evidence.id,
      sourceProfile,
      sourceMetadataFingerprint: metadataFingerprint,
      sourceTags,
      sourceScheme: 'LOCAL',
      targetScheme: 'IJMES',
      rawObservedRomanization: rawObserved,
      comparisonSourceForm: '',
      targetHypothesis: null,
      status: 'UNSUPPORTED',
      appliedRuleIds: [],
      blockers: [
        {
          kind: 'NO_ROMANIZATION',
          reason: 'Evidence observation has no observed romanization string.'
        }
      ],
      profileOrigin,
      recoveryId,
      interpreterVersion,
      ruleSetVersion,
      analyzedAt: options?.analyzedAt
    };
  }

  // Check 2: Non-lemma forms are blocked from automatic lexical hypothesis generation
  if (metadata.lemmaStatus === 'NON_LEMMA_FORM') {
    return {
      id,
      candidateId,
      evidenceId: evidence.id,
      sourceProfile,
      sourceMetadataFingerprint: metadataFingerprint,
      sourceTags,
      sourceScheme: 'LOCAL',
      targetScheme: 'IJMES',
      rawObservedRomanization: rawObserved,
      comparisonSourceForm: rawObserved.normalize('NFC').toLowerCase(),
      targetHypothesis: null,
      status: 'CONTEXT_REQUIRED',
      appliedRuleIds: [],
      blockers: [
        {
          kind: 'NON_LEMMA_SOURCE_FORM',
          reason: `Evidence is an inflected form or variant (${metadata.lemmaRelation?.kind ?? 'NON_LEMMA_FORM'}); excluded from direct lexical lemma hypotheses.`
        }
      ],
      profileOrigin,
      recoveryId,
      interpreterVersion,
      ruleSetVersion,
      analyzedAt: options?.analyzedAt
    };
  }

  // Run script-aware alignment & transduction
  const alignment = alignAndTransduceWiktionary({
    persianForm: evidence.persianForm,
    observedRomanization: evidence.observedRomanization ?? '',
    sourceProfile
  });

  if (!alignment.success || alignment.targetHypothesis === null) {
    return {
      id,
      candidateId,
      evidenceId: evidence.id,
      sourceProfile,
      sourceMetadataFingerprint: metadataFingerprint,
      sourceTags,
      sourceScheme: 'LOCAL',
      targetScheme: 'IJMES',
      rawObservedRomanization: rawObserved,
      comparisonSourceForm: rawObserved.normalize('NFC').toLowerCase(),
      targetHypothesis: null,
      status: 'CONTEXT_REQUIRED',
      appliedRuleIds: alignment.appliedRuleIds,
      blockers: alignment.blockers,
      profileOrigin,
      recoveryId,
      interpreterVersion,
      ruleSetVersion,
      analyzedAt: options?.analyzedAt
    };
  }

  const isDirect = rawObserved.normalize('NFC').toLowerCase() === alignment.targetHypothesis;
  const status: SchemeInterpretationStatus = isDirect ? 'DIRECT_EQUIVALENT' : 'DETERMINISTIC_EQUIVALENT';

  return {
    id,
    candidateId,
    evidenceId: evidence.id,
    sourceProfile,
    sourceMetadataFingerprint: metadataFingerprint,
    sourceTags,
    sourceScheme: 'LOCAL',
    targetScheme: 'IJMES',
    rawObservedRomanization: rawObserved,
    comparisonSourceForm: rawObserved.normalize('NFC').toLowerCase(),
    targetHypothesis: alignment.targetHypothesis,
    status,
    appliedRuleIds: alignment.appliedRuleIds,
    blockers: [],
    profileOrigin,
    recoveryId,
    interpreterVersion,
    ruleSetVersion,
    analyzedAt: options?.analyzedAt
  };
}

export class WiktionaryPersianSchemeInterpreter {
  public interpretEvidence(
    evidenceOrObservation: LexicalEvidence | KaikkiExtractedObservation,
    metadataOrOptions?: KaikkiEvidenceMetadata | KaikkiInterpretationOptions,
    options?: KaikkiInterpretationOptions
  ): KaikkiSchemeInterpretation {
    if ('evidence' in evidenceOrObservation && 'metadata' in evidenceOrObservation) {
      const obs = evidenceOrObservation as KaikkiExtractedObservation;
      const opts = (metadataOrOptions as KaikkiInterpretationOptions) ?? options;
      return interpretKaikkiEvidence(obs.evidence, obs.metadata, opts);
    }

    const evidence = evidenceOrObservation as LexicalEvidence;
    const metadata = metadataOrOptions as KaikkiEvidenceMetadata;
    return interpretKaikkiEvidence(evidence, metadata, options);
  }
}
