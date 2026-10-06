/**
 * Candidate-level scheme evidence aggregator.
 *
 * Core scholarly invariants:
 *   1. Pure analysis: does NOT mutate candidate or set candidate.proposedCanonical.
 *   2. Preserves both raw source conflict and target-scheme consensus dimensions.
 *   3. Conservative consensus semantics: UNANIMOUS_DETERMINISTIC requires unambiguous agreement.
 *   4. Deterministic identity independent of evidence ordering.
 */

import { normalizePersian } from '../../normalization';
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

export interface CandidateSchemeAnalysisOptions {
  aggregatorVersion?: string;
  interpreterVersion?: string;
  ruleSetVersion?: string;
  analyzedAt?: string;
}

/**
 * Perform scheme interpretation across all supporting evidence records for a candidate
 * and aggregate target-scheme consensus.
 */
export function analyzeCandidateSchemeEvidence(
  candidate: LexicalCandidate,
  supportingEvidence: LexicalEvidence[],
  options?: CandidateSchemeAnalysisOptions
): CandidateSchemeAnalysis {
  const aggregatorVersion = options?.aggregatorVersion ?? SCHEME_AGGREGATOR_VERSION;
  const candidateNormalized = normalizePersian(candidate.persianForm).normalizedInput;

  // 1. Validate Persian Identity consistency for all supporting evidence
  for (const evi of supportingEvidence) {
    const evidenceNormalized = normalizePersian(evi.persianForm).normalizedInput;
    if (evidenceNormalized !== candidateNormalized) {
      throw new Error(
        `Cannot analyze scheme evidence for candidate "${candidate.id}" (Persian: "${candidate.persianForm}"): Evidence "${evi.id}" has mismatched Persian form "${evi.persianForm}".`
      );
    }
  }

  // 2. Interpret each external observation independently
  // Deterministically sort evidence by immutable ID to guarantee input-order invariance
  const sortedEvidence = [...supportingEvidence].sort((a, b) => a.id.localeCompare(b.id));

  // Deduplicate by evidence ID
  const seenIds = new Set<string>();
  const uniqueEvidence: LexicalEvidence[] = [];
  for (const evi of sortedEvidence) {
    if (!seenIds.has(evi.id)) {
      seenIds.add(evi.id);
      uniqueEvidence.push(evi);
    }
  }

  const interpretations: SchemeInterpretation[] = uniqueEvidence.map((evi) =>
    interpretEvidenceScheme(evi, {
      candidateId: candidate.id,
      interpreterVersion: options?.interpreterVersion,
      ruleSetVersion: options?.ruleSetVersion,
      analyzedAt: options?.analyzedAt
    })
  );

  // 3. Collect deterministic hypotheses
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

  // 4. Compute consensus status
  let consensusStatus: SchemeConsensusStatus;
  let consensusTargetHypothesis: string | null = null;

  if (interpretations.length === 0 || interpretations.every((i) => i.blockers.some((b) => b.kind === 'NO_ROMANIZATION'))) {
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
    blockers,
    appliedRuleIds,
    aggregatorVersion,
    analyzedAt: options?.analyzedAt
  };
}
