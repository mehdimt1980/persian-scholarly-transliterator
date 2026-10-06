/**
 * Review packet preparation for human adjudication (Phase 5E).
 *
 * Core invariants:
 *   1. Packets are prepared from actual evidence repository state, not caller-provided objects.
 *   2. Revalidates Phase 5C lineage and Phase 5D scheme analysis automatically.
 *   3. Defensive snapshot isolation protects stored records from caller mutation.
 *   4. Deterministic packet ID and review-basis fingerprint are invariant to preparedAt.
 */

import { deepClone, LexicalEvidenceRepository } from '../repository';
import { analyzeCandidateSchemeEvidence } from '../scheme/aggregator';
import { computeReviewBasisFingerprint } from './fingerprint';
import { generateReviewPacketId } from './identity';
import type { CandidateReviewPacket } from './types';

export const REVIEW_PACKET_VERSION = '1.0.0';

export interface PrepareReviewPacketOptions {
  packetVersion?: string;
  preparedAt?: string;
  aggregatorVersion?: string;
  interpreterVersion?: string;
  ruleSetVersion?: string;
  analyzedAt?: string;
}

/**
 * Prepare an immutable CandidateReviewPacket representing the exact evidence and scheme analysis
 * for human review.
 */
export function prepareCandidateReviewPacket(
  candidateId: string,
  evidenceRepository: LexicalEvidenceRepository,
  options?: PrepareReviewPacketOptions
): CandidateReviewPacket {
  if (!candidateId || candidateId.trim() === '') {
    throw new Error('Candidate ID must be a non-empty string.');
  }

  const candidate = evidenceRepository.getCandidateById(candidateId);
  if (!candidate) {
    throw new Error(
      `Cannot prepare review packet: candidate "${candidateId}" not found in evidence repository.`
    );
  }

  // Run Phase 5D scheme analysis (revalidates Phase 5C lineage and pre-adjudication invariants)
  const schemeAnalysis = analyzeCandidateSchemeEvidence(
    candidate,
    (id) => evidenceRepository.getEvidenceById(id),
    {
      aggregatorVersion: options?.aggregatorVersion,
      interpreterVersion: options?.interpreterVersion,
      ruleSetVersion: options?.ruleSetVersion,
      analyzedAt: options?.analyzedAt,
      parentLookup: (id) => evidenceRepository.getEvidenceById(id)
    }
  );

  const reviewBasisFingerprint = computeReviewBasisFingerprint(candidate, schemeAnalysis);
  const packetVersion = options?.packetVersion ?? REVIEW_PACKET_VERSION;

  const packetId = generateReviewPacketId({
    candidateId: candidate.id,
    schemeAnalysisId: schemeAnalysis.id,
    reviewBasisFingerprint,
    packetVersion
  });

  const sortedEvidenceIds = Array.from(new Set(candidate.evidenceIds)).sort();

  return {
    id: packetId,
    candidateId: candidate.id,
    candidateSnapshot: deepClone(candidate),
    schemeAnalysisId: schemeAnalysis.id,
    schemeAnalysisSnapshot: deepClone(schemeAnalysis),
    evidenceIds: sortedEvidenceIds,
    reviewBasisFingerprint,
    preparedAt: options?.preparedAt,
    packetVersion
  };
}
