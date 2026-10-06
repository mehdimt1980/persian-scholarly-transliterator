import { normalizePersian } from '../../normalization';
import { synthesizeCandidateFromEvidence } from '../candidate';
import {
  LexicalCandidate,
  LexicalEntityType,
  LexicalEvidence
} from '../types';
import { classifyAlignedSegmentEligibility } from './eligibilityClassifier';
import {
  CandidateExtractionOptions,
  CandidateExtractionResult
} from './types';

/**
 * Cross-record candidate extraction aggregating candidate-eligible derived aligned evidence
 * into non-authoritative LexicalCandidate proposals.
 *
 * Core scholarly invariants:
 *   1. Input-order independent & normalized identity:
 *      Candidate Persian form and normalizedForm are strictly the normalized group identity.
 *      Evidence input ordering does NOT affect candidate identity or candidate ID.
 *   2. Deduplication & Determinism:
 *      Supporting evidence is deduplicated by immutable ID and sorted deterministically.
 *   3. Non-forgeable eligibility:
 *      Requires derivation.kind === 'ALIGNED_SEGMENT' and strictly verifies candidateEligibility
 *      against the deterministic classifier (fail-closed on forgery).
 *   4. proposedCanonical is ALWAYS null (never infers or converts transliteration).
 *   5. Entity reconciliation: If all supporting evidence agrees on an entity type, inherit it; otherwise fall back to WORD.
 *   6. Conflict preservation: ALA-LC disagreements are retained as review information without auto-resolution.
 *   7. Pure function: Does not mutate the authoritative lexicon, gold corpus, or frozen benchmarks.
 */
export function extractCandidatesFromAlignedEvidence(
  evidenceList: LexicalEvidence[],
  options?: CandidateExtractionOptions
): CandidateExtractionResult {
  // 1. Filter and validate derived segments
  const derivedSegments: LexicalEvidence[] = [];
  const eligibleSegments: LexicalEvidence[] = [];
  const contextBoundSegments: LexicalEvidence[] = [];

  for (const evi of evidenceList) {
    if (!evi.derivation) continue;

    if (evi.derivation.kind !== 'ALIGNED_SEGMENT') {
      throw new Error(
        `Evidence "${evi.id}" has invalid derivation kind "${evi.derivation.kind}". Only ALIGNED_SEGMENT is accepted.`
      );
    }

    if (!evi.observedRomanization) {
      throw new Error(
        `Evidence "${evi.id}" has no observed romanization. Cannot participate in candidate extraction.`
      );
    }

    // Validate eligibility against deterministic classifier (fail-closed on forged eligibility)
    const expectedClassification = classifyAlignedSegmentEligibility(evi.observedRomanization);
    if (evi.derivation.candidateEligibility !== expectedClassification.candidateEligibility) {
      throw new Error(
        `Evidence "${evi.id}" has forged or mismatched candidateEligibility "${evi.derivation.candidateEligibility}" (expected "${expectedClassification.candidateEligibility}").`
      );
    }
    if ((evi.derivation.exclusionReason ?? null) !== (expectedClassification.exclusionReason ?? null)) {
      throw new Error(
        `Evidence "${evi.id}" has mismatched exclusionReason "${evi.derivation.exclusionReason}" (expected "${expectedClassification.exclusionReason}").`
      );
    }

    derivedSegments.push(evi);

    if (evi.derivation.candidateEligibility === 'ELIGIBLE') {
      eligibleSegments.push(evi);
    } else {
      contextBoundSegments.push(evi);
    }
  }

  // 2. Group eligible evidence by normalized Persian form with deduplication
  const groups = new Map<string, Map<string, LexicalEvidence>>();
  for (const evi of eligibleSegments) {
    const norm = normalizePersian(evi.persianForm).normalizedInput;
    const groupMap = groups.get(norm) ?? new Map<string, LexicalEvidence>();
    groupMap.set(evi.id, evi); // Deduplicate by immutable evidence ID
    groups.set(norm, groupMap);
  }

  const candidates: LexicalCandidate[] = [];

  for (const [normKey, groupMap] of groups.entries()) {
    // Deterministic sorted evidence list
    const evis = Array.from(groupMap.values()).sort((a, b) => a.id.localeCompare(b.id));

    // Entity type reconciliation
    const entityTypes = new Set(evis.map((e) => e.entityType));
    const reconciledEntityType: LexicalEntityType =
      entityTypes.size === 1 ? Array.from(entityTypes)[0] : 'WORD';

    // Synthesize candidate proposal with stable normalized Persian identity
    const candidate = synthesizeCandidateFromEvidence(normKey, evis, {
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
    derivedSegmentsCount: derivedSegments.length,
    eligibleSegmentsCount: eligibleSegments.length,
    contextBoundSegmentsCount: contextBoundSegments.length,
    candidateGroupsCount: candidates.length
  };
}
