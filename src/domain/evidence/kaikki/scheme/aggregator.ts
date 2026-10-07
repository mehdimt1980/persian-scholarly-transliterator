/**
 * Candidate-level scheme evidence aggregator for Kaikki / Wiktionary candidates (Phase 7B).
 *
 * Core scholarly invariants:
 *   1. Exact evidence set closure: Analysis MUST match candidate.evidenceIds exactly (no supersets, no subsets).
 *   2. Direct lexical candidate validation: All evidence must originate from KAIKKI_ENWIKTIONARY_FA.
 *   3. Persian identity validation: All evidence and metadata must match candidate.normalizedForm.
 *   4. Pre-adjudication invariant: candidate.proposedCanonical MUST remain null.
 *   5. Zero automatic authority: Produces consensus analysis without mutating candidate.
 *   6. Conservative consensus: UNANIMOUS_DETERMINISTIC requires all supporting evidence to converge.
 */

import { normalizePersian } from '../../../normalization';
import type { LexicalCandidate, LexicalEvidence } from '../../types';
import { KAIKKI_SOURCE_ID } from '../extractor';
import type { KaikkiEvidenceMetadata, KaikkiExtractedObservation } from '../types';
import { generateKaikkiCandidateAnalysisId } from './identity';
import { interpretKaikkiEvidence, type WiktionaryPersianSchemeInterpreter } from './interpreter';
import { WIKT_AGGREGATOR_VERSION } from './rules';
import type {
  KaikkiCandidateSchemeAnalysis,
  KaikkiSchemeInterpretation,
  KaikkiSchemeInterpretationBlocker,
  SchemeConsensusStatus
} from './types';

export interface KaikkiCandidateAnalysisOptions {
  aggregatorVersion?: string;
  interpreterVersion?: string;
  ruleSetVersion?: string;
  analyzedAt?: string;
}

export type KaikkiEvidenceSource =
  | Array<{ evidence: LexicalEvidence; metadata: KaikkiEvidenceMetadata }>
  | KaikkiExtractedObservation[]
  | { evidence: LexicalEvidence[]; metadata: KaikkiEvidenceMetadata[] }
  | ((evidenceId: string) => { evidence: LexicalEvidence; metadata: KaikkiEvidenceMetadata } | undefined);

interface NormalizedSourceResult {
  lookup: (evidenceId: string) => { evidence: LexicalEvidence; metadata: KaikkiEvidenceMetadata } | undefined;
  suppliedIds?: Set<string>;
}

function normalizeKaikkiEvidenceSource(
  source: KaikkiEvidenceSource
): NormalizedSourceResult {
  if (typeof source === 'function') {
    return { lookup: source };
  }

  if (Array.isArray(source)) {
    const map = new Map<string, { evidence: LexicalEvidence; metadata: KaikkiEvidenceMetadata }>();
    const suppliedIds = new Set<string>();

    for (const item of source) {
      const evi = item.evidence;
      if (map.has(evi.id)) {
        throw new Error(
          `Provided evidence array contains duplicate evidence ID "${evi.id}". Duplicate evidence inputs are prohibited.`
        );
      }
      map.set(evi.id, item);
      suppliedIds.add(evi.id);
    }
    return { lookup: (id: string) => map.get(id), suppliedIds };
  }

  if (source && Array.isArray(source.evidence) && Array.isArray(source.metadata)) {
    if (source.evidence.length !== source.metadata.length) {
      throw new Error(
        `Evidence count (${source.evidence.length}) does not match metadata count (${source.metadata.length}).`
      );
    }
    const map = new Map<string, { evidence: LexicalEvidence; metadata: KaikkiEvidenceMetadata }>();
    const suppliedIds = new Set<string>();

    for (let i = 0; i < source.evidence.length; i += 1) {
      const evi = source.evidence[i];
      const meta = source.metadata[i];
      if (map.has(evi.id)) {
        throw new Error(`Duplicate evidence ID "${evi.id}" in evidence array.`);
      }
      map.set(evi.id, { evidence: evi, metadata: meta });
      suppliedIds.add(evi.id);
    }
    return { lookup: (id: string) => map.get(id), suppliedIds };
  }

  throw new Error('Invalid evidence source provided to analyzeKaikkiCandidateSchemeEvidence.');
}

/**
 * Perform Wiktionary scheme interpretation and consensus aggregation for a LexicalCandidate.
 */
export function analyzeKaikkiCandidateSchemeEvidence(
  candidate: LexicalCandidate,
  evidenceSource: KaikkiEvidenceSource,
  options?: KaikkiCandidateAnalysisOptions
): KaikkiCandidateSchemeAnalysis {
  if (candidate.proposedCanonical !== null) {
    throw new Error(
      `Candidate "${candidate.id}" has non-null proposedCanonical ("${candidate.proposedCanonical}"). Pre-adjudication scheme analysis strictly requires candidate.proposedCanonical === null.`
    );
  }

  const { lookup, suppliedIds } = normalizeKaikkiEvidenceSource(evidenceSource);
  const aggregatorVersion = options?.aggregatorVersion ?? WIKT_AGGREGATOR_VERSION;

  // Enforce true exact evidence closure: reject supersets, subsets, and extraneous items
  if (suppliedIds) {
    const candidateIdSet = new Set(candidate.evidenceIds);
    if (suppliedIds.size !== candidate.evidenceIds.length) {
      throw new Error(
        `Supplied evidence source contains ${suppliedIds.size} records, but candidate "${candidate.id}" requires exactly ${candidate.evidenceIds.length} records. Exact evidence closure violation.`
      );
    }
    for (const sId of suppliedIds) {
      if (!candidateIdSet.has(sId)) {
        throw new Error(
          `Supplied evidence "${sId}" is not referenced by candidate "${candidate.id}". Exact evidence closure violation.`
        );
      }
    }
  }

  const interpretations: KaikkiSchemeInterpretation[] = [];
  const blockers: KaikkiSchemeInterpretationBlocker[] = [];
  const appliedRulesSet = new Set<string>();

  // Validate exact evidence closure and Persian identity
  for (const evidenceId of candidate.evidenceIds) {
    const item = lookup(evidenceId);
    if (!item) {
      throw new Error(
        `Candidate "${candidate.id}" references evidence "${evidenceId}", which was not found in the supplied evidence source.`
      );
    }

    // Source provenance validation
    const sourceId = item.evidence.provenance?.sourceId;
    if (sourceId !== KAIKKI_SOURCE_ID) {
      throw new Error(
        `Evidence "${evidenceId}" has sourceId "${sourceId}". Kaikki candidate analysis strictly requires sourceId === "${KAIKKI_SOURCE_ID}".`
      );
    }

    // Persian normalized identity validation
    const normPersian = normalizePersian(item.evidence.persianForm).normalizedInput;
    if (normPersian !== candidate.normalizedForm || item.metadata.normalizedForm !== candidate.normalizedForm) {
      throw new Error(
        `Evidence "${evidenceId}" normalized form ("${normPersian}") does not match candidate "${candidate.id}" normalized form ("${candidate.normalizedForm}").`
      );
    }

    const interp = interpretKaikkiEvidence(item.evidence, item.metadata, {
      candidateId: candidate.id,
      interpreterVersion: options?.interpreterVersion,
      ruleSetVersion: options?.ruleSetVersion,
      analyzedAt: options?.analyzedAt
    });

    interpretations.push(interp);

    for (const r of interp.appliedRuleIds) appliedRulesSet.add(r);
    for (const b of interp.blockers) blockers.push(b);
  }

  // Deduplicate target hypotheses
  const hypotheses = interpretations
    .map((i) => i.targetHypothesis)
    .filter((h): h is string => h !== null && h.trim().length > 0);

  const distinctHypotheses = Array.from(new Set(hypotheses)).sort();

  let consensusStatus: SchemeConsensusStatus;
  let consensusTargetHypothesis: string | null = null;

  if (distinctHypotheses.length === 1) {
    // Check if all interpretations produced a valid hypothesis without blockers
    const allSuccessful = interpretations.every(
      (i) => i.status === 'DIRECT_EQUIVALENT' || i.status === 'DETERMINISTIC_EQUIVALENT'
    );

    if (allSuccessful) {
      consensusStatus = 'UNANIMOUS_DETERMINISTIC';
      consensusTargetHypothesis = distinctHypotheses[0];
    } else {
      consensusStatus = 'PARTIAL';
      consensusTargetHypothesis = null;
    }
  } else if (distinctHypotheses.length > 1) {
    consensusStatus = 'CONFLICTING_DETERMINISTIC';
    consensusTargetHypothesis = null;
  } else {
    const hasAnyRomanization = interpretations.some(
      (i) => i.rawObservedRomanization && i.rawObservedRomanization.trim().length > 0
    );
    consensusStatus = hasAnyRomanization ? 'BLOCKED' : 'NO_INTERPRETABLE_EVIDENCE';
    consensusTargetHypothesis = null;
  }

  const id = generateKaikkiCandidateAnalysisId({
    candidateId: candidate.id,
    interpretationIds: interpretations.map((i) => i.id),
    aggregatorVersion
  });

  return {
    id,
    candidateId: candidate.id,
    persianForm: candidate.persianForm,
    interpretations,
    deterministicTargetHypotheses: distinctHypotheses,
    consensusStatus,
    consensusTargetHypothesis,
    rawSourceConflicts: [...(candidate.conflicts ?? [])],
    rawCandidateStatus: candidate.status,
    blockers,
    appliedRuleIds: Array.from(appliedRulesSet).sort(),
    aggregatorVersion,
    analyzedAt: options?.analyzedAt
  };
}

export const aggregateKaikkiCandidateHypotheses = analyzeKaikkiCandidateSchemeEvidence;

export class KaikkiCandidateSchemeAggregator {
  public analyzeCandidate(
    candidate: LexicalCandidate,
    evidenceSource: KaikkiEvidenceSource,
    _interpreter?: WiktionaryPersianSchemeInterpreter,
    options?: KaikkiCandidateAnalysisOptions
  ): KaikkiCandidateSchemeAnalysis {
    return analyzeKaikkiCandidateSchemeEvidence(candidate, evidenceSource, options);
  }
}
