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
 *   7. Intrinsic decision validator enforces full internal structural coherence, snapshot integrity,
 *      recomputed fingerprint equality, and recomputed ID equality.
 */

import { validateManualTransliteration } from '../../review/validation';
import { deepClone, LexicalEvidenceRepository } from '../repository';
import { computeReviewBasisFingerprint } from './fingerprint';
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
 * Pure intrinsic validator for CandidateAdjudicationDecision records.
 * Enforces all structural invariants, snapshot coherence, fingerprint equality,
 * and decision ID determinism without requiring live repository access.
 */
export function validateAdjudicationDecisionIntegrity(
  decision: CandidateAdjudicationDecision
): void {
  if (!decision.id || decision.id.trim() === '') {
    throw new InvalidAdjudicationDecisionError('Decision record must have a non-empty id.');
  }

  if (!decision.reviewerRef || decision.reviewerRef.trim() === '') {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" must specify non-empty reviewerRef.`
    );
  }

  if (!decision.rationale || decision.rationale.trim() === '') {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" must specify non-empty rationale.`
    );
  }

  if (!decision.candidateId || decision.candidateId.trim() === '') {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" must specify candidateId.`
    );
  }

  if (!decision.schemeAnalysisId || decision.schemeAnalysisId.trim() === '') {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" must specify schemeAnalysisId.`
    );
  }

  if (!decision.reviewPacketId || decision.reviewPacketId.trim() === '') {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" must specify reviewPacketId.`
    );
  }

  if (!decision.reviewBasisFingerprint || decision.reviewBasisFingerprint.trim() === '') {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" must specify reviewBasisFingerprint.`
    );
  }

  if (!decision.candidateSnapshot) {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" is missing candidateSnapshot.`
    );
  }

  if (!decision.schemeAnalysisSnapshot) {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" is missing schemeAnalysisSnapshot.`
    );
  }

  // 1. Validate snapshot internal relationships
  if (decision.candidateSnapshot.id !== decision.candidateId) {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" candidateSnapshot.id ("${decision.candidateSnapshot.id}") does not match candidateId ("${decision.candidateId}").`
    );
  }

  if (decision.schemeAnalysisSnapshot.id !== decision.schemeAnalysisId) {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" schemeAnalysisSnapshot.id ("${decision.schemeAnalysisSnapshot.id}") does not match schemeAnalysisId ("${decision.schemeAnalysisId}").`
    );
  }

  if (decision.schemeAnalysisSnapshot.candidateId !== decision.candidateId) {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" schemeAnalysisSnapshot.candidateId ("${decision.schemeAnalysisSnapshot.candidateId}") does not match candidateId ("${decision.candidateId}").`
    );
  }

  // 2. Validate candidate snapshot Phase 5C origin & pre-adjudication invariant
  if (decision.candidateSnapshot.derivationProvenance?.strategy !== 'ALIGNED_SEGMENT_SYNTHESIS') {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" candidateSnapshot must have derivation strategy "ALIGNED_SEGMENT_SYNTHESIS", found "${decision.candidateSnapshot.derivationProvenance?.strategy ?? 'UNKNOWN'}".`
    );
  }

  if (decision.candidateSnapshot.proposedCanonical !== null) {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" candidateSnapshot must have proposedCanonical === null, found "${decision.candidateSnapshot.proposedCanonical}".`
    );
  }

  // 3. Validate disposition and canonical selection
  if (decision.disposition === 'REJECT' || decision.disposition === 'DEFER') {
    if (decision.canonicalSelection !== null) {
      throw new InvalidAdjudicationDecisionError(
        `Decision "${decision.id}" with disposition "${decision.disposition}" must have canonicalSelection === null.`
      );
    }
  } else if (decision.disposition === 'ACCEPT') {
    if (!decision.canonicalSelection) {
      throw new InvalidAdjudicationDecisionError(
        `Decision "${decision.id}" with disposition "ACCEPT" strictly requires canonicalSelection.`
      );
    }

    const sel = decision.canonicalSelection;
    if (sel.kind === 'SELECT_SCHEME_HYPOTHESIS') {
      if (!decision.schemeAnalysisSnapshot.deterministicTargetHypotheses.includes(sel.canonical)) {
        throw new InvalidAdjudicationDecisionError(
          `Decision "${decision.id}" selected scheme hypothesis "${sel.canonical}" is not in schemeAnalysisSnapshot.deterministicTargetHypotheses: [${decision.schemeAnalysisSnapshot.deterministicTargetHypotheses.join(', ')}].`
        );
      }
    } else if (sel.kind === 'MANUAL_CANONICAL') {
      const val = validateManualTransliteration(sel.canonical);
      if (!val.valid || val.normalized !== sel.canonical) {
        throw new InvalidAdjudicationDecisionError(
          `Decision "${decision.id}" manual canonical "${sel.canonical}" failed validation: ${val.error ?? 'Unnormalized or invalid value.'}`
        );
      }
    } else {
      throw new InvalidAdjudicationDecisionError(
        `Decision "${decision.id}" has unsupported canonical selection kind "${(sel as any).kind}".`
      );
    }
  } else {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" has invalid disposition "${decision.disposition}".`
    );
  }

  // 4. Validate recomputed review-basis fingerprint
  const recomputedFingerprint = computeReviewBasisFingerprint(
    decision.candidateSnapshot,
    decision.schemeAnalysisSnapshot
  );
  if (recomputedFingerprint !== decision.reviewBasisFingerprint) {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" declared reviewBasisFingerprint "${decision.reviewBasisFingerprint}" does not match recomputed fingerprint "${recomputedFingerprint}". Snapshot data has been altered.`
    );
  }

  // 5. Validate recomputed decision ID
  const recomputedId = generateDecisionId({
    reviewPacketId: decision.reviewPacketId,
    candidateId: decision.candidateId,
    reviewerRef: decision.reviewerRef,
    disposition: decision.disposition,
    canonicalSelection: decision.canonicalSelection,
    decidedAt: decision.decidedAt
  });

  if (recomputedId !== decision.id) {
    throw new InvalidAdjudicationDecisionError(
      `Decision record ID "${decision.id}" does not match recomputed deterministic ID "${recomputedId}". Decision identity tampering detected.`
    );
  }
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

  // 3. Validate intrinsic integrity before adding to ledger
  validateAdjudicationDecisionIntegrity(decision);

  // 4. Record in append-only ledger
  adjudicationLedger.addDecision(decision);

  return deepClone(decision);
}
