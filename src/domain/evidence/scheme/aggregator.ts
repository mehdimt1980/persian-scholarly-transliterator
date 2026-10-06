/**
 * Candidate-level scheme evidence aggregator.
 *
 * Core scholarly invariants:
 *   1. Exact evidence set closure: Analysis MUST use exactly candidate.evidenceIds.
 *      Subsets and supersets (injected evidence) fail closed immediately.
 *   2. Phase 5C candidate origin & pre-adjudication invariant:
 *      Candidate MUST have derivationProvenance.strategy === 'ALIGNED_SEGMENT_SYNTHESIS'
 *      and candidate.proposedCanonical === null.
 *   3. Every supporting evidence item MUST have derivation.kind === 'ALIGNED_SEGMENT'
 *      and pass full validateDerivedEvidenceLineage() revalidation.
 *   4. Duplicate evidence IDs in supplied arrays are rejected immediately before lookup creation.
 *   5. Preserves both raw source conflict and target-scheme consensus dimensions explicitly
 *      with genuine defensive snapshot isolation for rawSourceConflicts.
 *   6. Pure analysis: does NOT mutate candidate or set candidate.proposedCanonical.
 *   7. Conservative consensus semantics: UNANIMOUS_DETERMINISTIC requires unambiguous agreement.
 *   8. Deterministic identity independent of evidence ordering.
 */

import { normalizePersian } from '../../normalization';
import { validateDerivedEvidenceLineage } from '../repository';
import { LexicalCandidate, LexicalEvidence } from '../types';
import { generateCandidateAnalysisId } from './identity';
import { interpretEvidenceScheme } from './interpreter';
import {
  CandidateSchemeAnalysis,
  SchemeConsensusStatus,
  SchemeInterpretation,
  SchemeInterpretationBlocker
} from './types';

export const SCHEME_AGGREGATOR_VERSION = '1.0.0';

export type SchemeEvidenceLookup =
  | ((evidenceId: string) => LexicalEvidence | undefined)
  | LexicalEvidence[]
  | { getEvidenceById: (id: string) => LexicalEvidence | undefined };

export interface CandidateSchemeAnalysisOptions {
  aggregatorVersion?: string;
  interpreterVersion?: string;
  ruleSetVersion?: string;
  analyzedAt?: string;
  parentLookup?: (parentEvidenceId: string) => LexicalEvidence | undefined;
}

function toLookupFunction(source: SchemeEvidenceLookup): (id: string) => LexicalEvidence | undefined {
  if (typeof source === 'function') {
    return source;
  }
  if (Array.isArray(source)) {
    const map = new Map<string, LexicalEvidence>();
    for (const item of source) {
      if (map.has(item.id)) {
        throw new Error(
          `Provided evidence array contains duplicate evidence ID "${item.id}". Duplicate evidence inputs are prohibited.`
        );
      }
      map.set(item.id, item);
    }
    return (id: string) => map.get(id);
  }
  if (source && typeof source.getEvidenceById === 'function') {
    return (id: string) => source.getEvidenceById(id);
  }
  throw new Error('Invalid evidence source provided to analyzeCandidateSchemeEvidence.');
}

/**
 * Perform scheme interpretation across the exact supporting evidence records for a candidate
 * and aggregate target-scheme consensus.
 */
export function analyzeCandidateSchemeEvidence(
  candidate: LexicalCandidate,
  evidenceSource: SchemeEvidenceLookup,
  options?: CandidateSchemeAnalysisOptions
): CandidateSchemeAnalysis {
  // 1. Validate Phase 5C candidate origin and pre-adjudication invariant
  if (candidate.derivationProvenance?.strategy !== 'ALIGNED_SEGMENT_SYNTHESIS') {
    throw new Error(
      `Candidate "${candidate.id}" has unsupported derivation strategy "${candidate.derivationProvenance?.strategy ?? 'UNKNOWN'}". Phase 5D scheme-aware candidate analysis strictly requires Phase 5C "ALIGNED_SEGMENT_SYNTHESIS" candidates.`
    );
  }

  if (candidate.proposedCanonical !== null) {
    throw new Error(
      `Candidate "${candidate.id}" has non-null proposedCanonical ("${candidate.proposedCanonical}"). Phase 5D pre-adjudication scheme analysis strictly requires candidate.proposedCanonical === null.`
    );
  }

  const aggregatorVersion = options?.aggregatorVersion ?? SCHEME_AGGREGATOR_VERSION;
  const candidateNormalized = normalizePersian(candidate.persianForm).normalizedInput;
  const lookupFn = toLookupFunction(evidenceSource);
  const parentLookupFn = options?.parentLookup ?? lookupFn;

  // 2. If evidenceSource was provided as an Array, enforce strict set equality with candidate.evidenceIds
  if (Array.isArray(evidenceSource)) {
    const candidateIdSet = new Set(candidate.evidenceIds);
    const sourceIdSet = new Set(evidenceSource.map((e) => e.id));

    for (const eid of candidateIdSet) {
      if (!sourceIdSet.has(eid)) {
        throw new Error(
          `Candidate "${candidate.id}" scheme analysis failed: provided evidence array is missing supporting evidence "${eid}". Analyzing a subset is prohibited.`
        );
      }
    }
    for (const eid of sourceIdSet) {
      if (!candidateIdSet.has(eid)) {
        throw new Error(
          `Candidate "${candidate.id}" scheme analysis failed: provided evidence array contains extra unreferenced evidence "${eid}". Injecting foreign evidence is prohibited.`
        );
      }
    }
  }

  // 3. Resolve every referenced evidence ID from candidate.evidenceIds
  const resolvedEvidence: LexicalEvidence[] = [];
  const seenCandidateIds = new Set<string>();

  for (const eid of candidate.evidenceIds) {
    if (seenCandidateIds.has(eid)) {
      throw new Error(
        `Candidate "${candidate.id}" contains duplicate evidence reference "${eid}".`
      );
    }
    seenCandidateIds.add(eid);

    const evi = lookupFn(eid);
    if (!evi) {
      throw new Error(
        `Candidate "${candidate.id}" references non-existent supporting evidence ID "${eid}".`
      );
    }

    // Require ALIGNED_SEGMENT derivation on every supporting evidence item
    if (!evi.derivation || evi.derivation.kind !== 'ALIGNED_SEGMENT') {
      throw new Error(
        `Candidate "${candidate.id}" supporting evidence "${evi.id}" is missing required "ALIGNED_SEGMENT" derivation. Phase 5D scheme-aware analysis strictly requires validated Phase 5C aligned segment evidence.`
      );
    }

    // Validate Persian identity
    const evidenceNormalized = normalizePersian(evi.persianForm).normalizedInput;
    if (evidenceNormalized !== candidateNormalized) {
      throw new Error(
        `Candidate "${candidate.id}" (Persian: "${candidate.persianForm}") Persian identity mismatch: Evidence "${evi.id}" has normalized Persian "${evidenceNormalized}".`
      );
    }

    // Revalidate derived segment lineage against parent evidence
    validateDerivedEvidenceLineage(evi, parentLookupFn);

    resolvedEvidence.push(evi);
  }

  // 4. Deterministically sort evidence by immutable ID to guarantee input-order invariance
  const sortedEvidence = [...resolvedEvidence].sort((a, b) => a.id.localeCompare(b.id));

  // 5. Interpret each external observation independently
  const interpretations: SchemeInterpretation[] = sortedEvidence.map((evi) =>
    interpretEvidenceScheme(evi, {
      candidateId: candidate.id,
      interpreterVersion: options?.interpreterVersion,
      ruleSetVersion: options?.ruleSetVersion,
      analyzedAt: options?.analyzedAt
    })
  );

  // 6. Collect deterministic hypotheses, blockers, and applied rules
  const hypothesisSet = new Set<string>();
  const blockers: SchemeInterpretationBlocker[] = [];
  const appliedRulesSet = new Set<string>();

  let hasContextRequiredOrUnsupported = false;

  for (const interp of interpretations) {
    if (interp.targetHypothesis !== null) {
      hypothesisSet.add(interp.targetHypothesis);
    }
    if (interp.status === 'CONTEXT_REQUIRED' || interp.status === 'UNSUPPORTED') {
      hasContextRequiredOrUnsupported = true;
    }
    for (const b of interp.blockers) {
      blockers.push(b);
    }
    for (const r of interp.appliedRuleIds) {
      appliedRulesSet.add(r);
    }
  }

  const deterministicTargetHypotheses = Array.from(hypothesisSet).sort();
  const appliedRuleIds = Array.from(appliedRulesSet).sort();

  // 7. Compute consensus status
  let consensusStatus: SchemeConsensusStatus;
  let consensusTargetHypothesis: string | null = null;

  if (
    interpretations.length === 0 ||
    interpretations.every((i) => i.blockers.some((b) => b.kind === 'NO_ROMANIZATION'))
  ) {
    consensusStatus = 'NO_INTERPRETABLE_EVIDENCE';
  } else if (deterministicTargetHypotheses.length === 1) {
    if (!hasContextRequiredOrUnsupported) {
      // All interpretable supporting evidence agrees on exactly one target hypothesis
      consensusStatus = 'UNANIMOUS_DETERMINISTIC';
      consensusTargetHypothesis = deterministicTargetHypotheses[0];
    } else {
      // Some evidence resolved, but other evidence was context-required or unsupported
      consensusStatus = 'PARTIAL';
      consensusTargetHypothesis = null;
    }
  } else if (deterministicTargetHypotheses.length > 1) {
    // Multiple conflicting target hypotheses
    consensusStatus = 'CONFLICTING_DETERMINISTIC';
    consensusTargetHypothesis = null;
  } else {
    // Zero target hypotheses (all blocked or context-required)
    consensusStatus = 'BLOCKED';
    consensusTargetHypothesis = null;
  }

  const analysisId = generateCandidateAnalysisId({
    candidateId: candidate.id,
    targetScheme: 'IJMES',
    aggregatorVersion,
    interpretationIds: interpretations.map((i) => i.id)
  });

  return {
    id: analysisId,
    candidateId: candidate.id,
    persianForm: candidate.persianForm,
    interpretations,
    deterministicTargetHypotheses,
    consensusStatus,
    consensusTargetHypothesis,
    rawSourceConflicts: candidate.conflicts.map((conflict) => ({ ...conflict })),
    rawCandidateStatus: candidate.status,
    blockers,
    appliedRuleIds,
    aggregatorVersion,
    analyzedAt: options?.analyzedAt
  };
}
