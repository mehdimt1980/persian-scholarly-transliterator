import { normalizePersian } from '../../normalization';
import { synthesizeCandidateFromEvidence } from '../candidate';
import {
  LexicalCandidate,
  LexicalEntityType,
  LexicalEvidence
} from '../types';
import {
  CandidateExtractionOptions,
  CandidateExtractionResult
} from './types';

/**
 * Cross-record candidate extraction aggregating candidate-eligible derived aligned evidence
 * into non-authoritative LexicalCandidate proposals.
 *
 * Core scholarly invariants:
 *   1. proposedCanonical is ALWAYS null (never infers or converts transliteration).
 *   2. Grouping is keyed by normalized Persian form, while exact raw orthographic variants survive in evidence.
 *   3. Entity reconciliation: If all supporting evidence agrees on an entity type, inherit it; otherwise fall back to WORD.
 *   4. Conflict preservation: ALA-LC disagreements are retained as review information without auto-resolution.
 *   5. Pure function: Does not mutate the authoritative lexicon, gold corpus, or frozen benchmarks.
 */
export function extractCandidatesFromAlignedEvidence(
  evidenceList: LexicalEvidence[],
  options?: CandidateExtractionOptions
): CandidateExtractionResult {
  const derivedSegments = evidenceList.filter((e) => e.derivation !== undefined);
  const eligibleSegments = derivedSegments.filter(
    (e) => e.derivation?.candidateEligibility === 'ELIGIBLE' && e.observedRomanization !== null
  );
  const contextBoundSegments = derivedSegments.filter(
    (e) => e.derivation?.candidateEligibility === 'CONTEXT_BOUND'
  );

  // Group eligible evidence by normalized Persian form
  const groups = new Map<string, LexicalEvidence[]>();
  for (const evi of eligibleSegments) {
    const norm = normalizePersian(evi.persianForm).normalizedInput;
    const existing = groups.get(norm) ?? [];
    existing.push(evi);
    groups.set(norm, existing);
  }

  const candidates: LexicalCandidate[] = [];

  for (const evis of groups.values()) {
    // Representative Persian form (first observed raw orthography)
    const representativePersian = evis[0].persianForm;

    // Entity type reconciliation
    const entityTypes = new Set(evis.map((e) => e.entityType));
    const reconciledEntityType: LexicalEntityType =
      entityTypes.size === 1 ? Array.from(entityTypes)[0] : 'WORD';

    // Synthesize candidate proposal (strictly proposedCanonical: null)
    const candidate = synthesizeCandidateFromEvidence(representativePersian, evis, {
      proposedCanonical: null,
      entityType: reconciledEntityType,
      derivedAt: options?.derivedAt,
      notes: options?.notes
    });

    // Mark provenance strategy explicitly
    candidate.derivationProvenance = {
      derivedAt: options?.derivedAt ?? new Date().toISOString(),
      strategy: 'ALIGNED_SEGMENT_SYNTHESIS',
      synthesizerVersion: options?.synthesizerVersion,
      notes: options?.notes
    };

    candidates.push(candidate);
  }

  // Sort candidates deterministically by normalized form
  candidates.sort((a, b) => a.normalizedForm.localeCompare(b.normalizedForm));

  return {
    candidates,
    parentObservationsCount: 0, // Filled if batch alignment pipeline is used
    derivedSegmentsCount: derivedSegments.length,
    eligibleSegmentsCount: eligibleSegments.length,
    contextBoundSegmentsCount: contextBoundSegments.length,
    unalignedObservationsCount: 0
  };
}
