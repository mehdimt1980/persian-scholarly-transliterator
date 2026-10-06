/**
 * Human adjudication decision recording and validation (Phase 5E).
 *
 * Core invariants:
 *   1. Human decision is explicit authority; scheme consensus is never automatic authority.
 *   2. Non-empty reviewerRef and rationale required for all decisions.
 *   3. ACCEPT requires explicit canonical selection (either exact Phase 5D hypothesis or validated manual canonical).
 *   4. REJECT / DEFER strictly forbid canonical selection.
 *   5. Stale-review basis protection: Decision recording fails closed if live repository review basis
 *      differs from the supplied packet ID or review-basis fingerprint.
 *   6. Candidate remains unmodified; human decision is recorded separately in the ledger.
 */

import { validateManualTransliteration } from '../../review/validation';
import { deepClone, LexicalEvidenceRepository } from '../repository';
import { generateDecisionId } from './identity';
import { prepareCandidateReviewPacket } from './reviewPacket';
import type {
  AdjudicationDecisionRequest,
  CandidateAdjudicationDecision,
  CanonicalSelection
} from './types';
import type { AdjudicationLedger } from './ledger';

export const DECISION_VERSION = '1.0.0';

export class InvalidAdjudicationDecisionError extends Error {
  constructor(message: string) {
    super(`[InvalidAdjudicationDecision] ${message}`);
    this.name = 'InvalidAdjudicationDecisionError';
  }
}

export class StaleReviewBasisError extends Error {
  constructor(message: string) {
    super(`[StaleReviewBasis] ${message}`);
    this.name = 'StaleReviewBasisError';
  }
}

export class ConflictingHumanDecisionsError extends Error {
  public readonly candidateId: string;
  public readonly reviewBasisFingerprint: string;

  constructor(candidateId: string, reviewBasisFingerprint: string, message: string) {
    super(
      `[ConflictingHumanDecisions] Candidate "${candidateId}" (basis: ${reviewBasisFingerprint}): ${message}`
    );
    this.name = 'ConflictingHumanDecisionsError';
    this.candidateId = candidateId;
    this.reviewBasisFingerprint = reviewBasisFingerprint;
  }
}

export interface RecordDecisionOptions {
  decisionVersion?: string;
  now?: () => string;
}

/**
 * Validate decision request inputs against the verified live review packet.
 */
function validateAndNormalizeCanonicalSelection(
  disposition: string,
  selection: CanonicalSelection | null | undefined,
  deterministicTargetHypotheses: string[]
): CanonicalSelection | null {
  if (disposition === 'REJECT' || disposition === 'DEFER') {
    if (selection !== null && selection !== undefined) {
      throw new InvalidAdjudicationDecisionError(
        `Decisions with disposition "${disposition}" must not contain a canonical selection.`
      );
    }
    return null;
  }

  if (disposition === 'ACCEPT') {
    if (!selection) {
      throw new InvalidAdjudicationDecisionError(
        'Decisions with disposition "ACCEPT" strictly require an explicit canonical selection.'
      );
    }

    if (selection.kind === 'SELECT_SCHEME_HYPOTHESIS') {
      const target = selection.canonical;
      if (!deterministicTargetHypotheses.includes(target)) {
        throw new InvalidAdjudicationDecisionError(
          `Selected scheme hypothesis "${target}" is not present in Phase 5D deterministicTargetHypotheses: [${deterministicTargetHypotheses.join(', ')}].`
        );
      }
      return {
        kind: 'SELECT_SCHEME_HYPOTHESIS',
        canonical: target
      };
    }

    if (selection.kind === 'MANUAL_CANONICAL') {
      const validation = validateManualTransliteration(selection.canonical);
      if (!validation.valid || !validation.normalized) {
        throw new InvalidAdjudicationDecisionError(
          `Manual canonical transliteration "${selection.canonical}" failed validation: ${validation.error ?? 'Invalid input.'}`
        );
      }
      return {
        kind: 'MANUAL_CANONICAL',
        canonical: validation.normalized
      };
    }

    throw new InvalidAdjudicationDecisionError(
      `Unsupported canonical selection kind: "${(selection as any).kind}".`
    );
  }

  throw new InvalidAdjudicationDecisionError(`Unsupported disposition: "${disposition}".`);
}

/**
 * Record an immutable human adjudication decision into the ledger after revalidating
 * against the live review basis.
 */
export function recordAdjudicationDecision(
  request: AdjudicationDecisionRequest,
  currentEvidenceRepository: LexicalEvidenceRepository,
  adjudicationLedger: AdjudicationLedger,
  options?: RecordDecisionOptions
): CandidateAdjudicationDecision {
  if (!request.reviewerRef || request.reviewerRef.trim() === '') {
    throw new InvalidAdjudicationDecisionError('Reviewer reference (reviewerRef) must be non-empty.');
  }

  if (!request.rationale || request.rationale.trim() === '') {
    throw new InvalidAdjudicationDecisionError('Decision rationale must be non-empty.');
  }

  // 1. Rebuild live review packet to guard against stale review basis
  const livePacket = prepareCandidateReviewPacket(
    request.candidateId,
    currentEvidenceRepository
  );

  if (livePacket.id !== request.reviewPacketId) {
    throw new StaleReviewBasisError(
      `Supplied reviewPacketId "${request.reviewPacketId}" does not match live review packet ID "${livePacket.id}". Candidate or evidence state has changed.`
    );
  }

  if (livePacket.reviewBasisFingerprint !== request.reviewBasisFingerprint) {
    throw new StaleReviewBasisError(
      `Supplied reviewBasisFingerprint "${request.reviewBasisFingerprint}" does not match live fingerprint "${livePacket.reviewBasisFingerprint}".`
    );
  }

  // 2. Validate and normalize canonical selection
  const canonicalSelection = validateAndNormalizeCanonicalSelection(
    request.disposition,
    request.canonicalSelection,
    livePacket.schemeAnalysisSnapshot.deterministicTargetHypotheses
  );

  const decidedAt = request.decidedAt ?? (options?.now ? options.now() : new Date().toISOString());
  const decisionVersion = options?.decisionVersion ?? DECISION_VERSION;

  const decisionId = generateDecisionId({
    reviewPacketId: livePacket.id,
    candidateId: livePacket.candidateId,
    reviewerRef: request.reviewerRef.trim(),
    disposition: request.disposition,
    canonicalSelection,
    decidedAt
  });

  const decision: CandidateAdjudicationDecision = {
    id: decisionId,
    reviewPacketId: livePacket.id,
    reviewBasisFingerprint: livePacket.reviewBasisFingerprint,
    candidateId: livePacket.candidateId,
    schemeAnalysisId: livePacket.schemeAnalysisId,
    disposition: request.disposition,
    canonicalSelection,
    reviewerRef: request.reviewerRef.trim(),
    reviewerDisplayName: request.reviewerDisplayName?.trim(),
    rationale: request.rationale.trim(),
    decidedAt,
    candidateSnapshot: deepClone(livePacket.candidateSnapshot),
    schemeAnalysisSnapshot: deepClone(livePacket.schemeAnalysisSnapshot),
    decisionVersion
  };

  // 3. Record in append-only ledger
  adjudicationLedger.addDecision(decision);

  return deepClone(decision);
}
