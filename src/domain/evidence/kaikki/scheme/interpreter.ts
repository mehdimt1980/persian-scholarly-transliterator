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

import type { LexicalEvidence } from '../../types';
import { KAIKKI_SOURCE_ID } from '../extractor';
import type { KaikkiEvidenceMetadata } from '../types';
import { alignAndTransduceWiktionary } from './aligner';
import {
  computeMetadataFingerprint,
  generateKaikkiInterpretationId
} from './identity';
import { classifyWiktionaryProfile } from './profileClassifier';
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

  const sourceProfile = classifyWiktionaryProfile(metadata);
  const metadataFingerprint = computeMetadataFingerprint(metadata);
  const rawObserved = evidence.observedRomanization ?? '';

  const id = generateKaikkiInterpretationId({
    evidenceId: evidence.id,
    sourceProfile,
    sourceMetadataFingerprint: metadataFingerprint,
    targetScheme: 'IJMES',
    interpreterVersion,
    ruleSetVersion,
    persianForm: evidence.persianForm,
    observedRomanization: rawObserved
  });

  const sourceTags = metadata.romanizationTags ?? metadata.varietyTags ?? [];

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
    interpreterVersion,
    ruleSetVersion,
    analyzedAt: options?.analyzedAt
  };
}

export class WiktionaryPersianSchemeInterpreter {
  public interpretEvidence(
    evidence: LexicalEvidence,
    metadata?: KaikkiEvidenceMetadata,
    options?: KaikkiInterpretationOptions
  ): KaikkiSchemeInterpretation {
    const rawMeta = (evidence as unknown as { rawMetadata?: KaikkiEvidenceMetadata }).rawMetadata;
    const resolvedMeta: KaikkiEvidenceMetadata = metadata ?? rawMeta ?? {
      rawSourceWord: evidence.persianForm,
      normalizedForm: evidence.persianForm,
      lemmaStatus: 'LEMMA' as const,
      ipaObservations: [],
      varietyTags: [],
      sourceSenseIds: [],
      glosses: []
    };
    return interpretKaikkiEvidence(evidence, resolvedMeta, options);
  }
}

