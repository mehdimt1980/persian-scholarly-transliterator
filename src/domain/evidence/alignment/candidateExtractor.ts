import { normalizePersian } from '../../normalization';
import { synthesizeCandidateFromEvidence } from '../candidate';
import { validateDerivedEvidenceLineage } from '../repository';
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
 * Parent evidence source for lineage validation.
 * Can be a lookup function, an array of parent LexicalEvidence records, or an object with getEvidenceById.
 */
export type ParentEvidenceLookup =
  | ((id: string) => LexicalEvidence | undefined)
  | LexicalEvidence[]
  | { getEvidenceById(id: string): LexicalEvidence | undefined };

function toLookupFunction(
  source: ParentEvidenceLookup
): (id: string) => LexicalEvidence | undefined {
  if (typeof source === 'function') {
    return source;
  }
  if (Array.isArray(source)) {
    const map = new Map<string, LexicalEvidence>();
    for (const item of source) {
      map.set(item.id, item);
    }
    return (id: string) => map.get(id);
  }
  if (source && typeof source.getEvidenceById === 'function') {
    return (id: string) => source.getEvidenceById(id);
  }
  throw new Error('Invalid parent evidence source provided to extractCandidatesFromAlignedEvidence.');
}

/**
 * Cross-record candidate extraction aggregating candidate-eligible derived aligned evidence
 * into non-authoritative LexicalCandidate proposals.
 *
 * Core scholarly invariants:
 *   1. Full Lineage Validation:
 *      Strictly validates parent lineage (existence, exact Persian & Roman spans, non-recursive parent,
 *      non-forgeable eligibility, and full source/provenance identity consistency) via
 *      validateDerivedEvidenceLineage() before accepting any derived segment evidence.
 *   2. Input-order independent & normalized identity:
 *      Candidate Persian form and normalizedForm are strictly the normalized group identity.
 *      Evidence input ordering does NOT affect candidate identity or candidate ID.
 *   3. Deduplication & Determinism:
 *      Supporting evidence is deduplicated by immutable ID and sorted deterministically.
 *   4. proposedCanonical is ALWAYS null (never infers or converts transliteration).
 *   5. Entity reconciliation: If all supporting evidence agrees on an entity type, inherit it; otherwise fall back to WORD.
 *   6. Conflict preservation: ALA-LC disagreements are retained as review information without auto-resolution.
 *   7. Pure function: Does not mutate the authoritative lexicon, gold corpus, or frozen benchmarks.
 */
export function extractCandidatesFromAlignedEvidence(
  evidenceList: LexicalEvidence[],
  parentSource: ParentEvidenceLookup,
  options?: CandidateExtractionOptions
): CandidateExtractionResult {
  const parentLookup = toLookupFunction(parentSource);

  // 1. Filter and validate derived segments against parent lineage
  const derivedSegments: LexicalEvidence[] = [];
  const eligibleSegments: LexicalEvidence[] = [];
  const contextBoundSegments: LexicalEvidence[] = [];

  for (const evi of evidenceList) {
    if (!evi.derivation) {
      throw new Error(
        `Evidence "${evi.id}" has no derivation metadata. Only derived ALIGNED_SEGMENT evidence can produce candidate proposals.`
      );
    }

    if (evi.derivation.kind !== 'ALIGNED_SEGMENT') {
      throw new Error(
        `Evidence "${evi.id}" has invalid derivation kind "${evi.derivation.kind}". Only ALIGNED_SEGMENT is accepted.`
      );
    }

    // Validate full lineage and source span integrity against parent evidence
    validateDerivedEvidenceLineage(evi, parentLookup);

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
