import { CandidateEligibility } from '../types';

export interface AlignedSegmentEligibilityClassification {
  candidateEligibility: CandidateEligibility;
  exclusionReason?: string;
}

export const CONTEXT_BOUND_HYPHEN_REASON = 'Contains bound contextual marker or hyphen';
export const EMPTY_ROMANIZATION_REASON = 'Observed romanization is empty or null';

/**
 * Deterministically classify whether an observed Romanized segment is eligible
 * to form a standalone lexical candidate or is context-bound (e.g. carrying an attached
 * grammatical morpheme or izāfat marker such as -i, al-, -ʼi).
 *
 * This classifier is source-neutral, non-morphological (does not strip or alter text),
 * and shared across positional alignment, repository integrity validation, and candidate extraction.
 */
export function classifyAlignedSegmentEligibility(
  observedRomanization: string | null | undefined
): AlignedSegmentEligibilityClassification {
  if (!observedRomanization || observedRomanization.trim() === '') {
    return {
      candidateEligibility: 'CONTEXT_BOUND',
      exclusionReason: EMPTY_ROMANIZATION_REASON
    };
  }

  if (observedRomanization.includes('-')) {
    return {
      candidateEligibility: 'CONTEXT_BOUND',
      exclusionReason: CONTEXT_BOUND_HYPHEN_REASON
    };
  }

  return {
    candidateEligibility: 'ELIGIBLE',
    exclusionReason: undefined
  };
}
