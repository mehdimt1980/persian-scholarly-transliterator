/**
 * Domain types for human adjudication and explicit lexicon promotion (Phase 5E).
 *
 * Core scholarly invariants:
 *   EVIDENCE ≠ SCHEME HYPOTHESIS ≠ HUMAN DECISION ≠ LEXICON PROMOTION
 *
 *   1. Non-authoritative upstream layers: Neither LexicalEvidence nor CandidateSchemeAnalysis
 *      ever authorizes lexical entry creation automatically.
 *   2. Explicit human decision: Reviewer must supply non-empty reviewerRef and rationale.
 *      For ACCEPT, reviewer must explicitly choose a canonical form.
 *   3. Immutable review packet: Captures candidate snapshot, Phase 5D scheme analysis snapshot,
 *      supporting evidence IDs, and deterministic review-basis fingerprint.
 *   4. Explicit promotion action: ACCEPT does not mutate the lexicon. Promotion is a separate,
 *      auditable event requiring valid promotion plan, stale-state protection, and promoter provenance.
 *   5. Snapshot isolation: Promotion returns a new LexiconRepository snapshot and never mutates
 *      the supplied repository or DEFAULT_LEXICON_REPOSITORY.
 */

import type { LexicalCandidate } from '../types';
import type { CandidateSchemeAnalysis } from '../scheme/types';

/**
 * Reviewer disposition on a candidate review basis.
 */
export type AdjudicationDisposition = 'ACCEPT' | 'REJECT' | 'DEFER';

/**
 * Kind of canonical transliteration selection made by the human reviewer.
 */
export type CanonicalSelectionKind = 'SELECT_SCHEME_HYPOTHESIS' | 'MANUAL_CANONICAL';

/**
 * Explicit canonical transliteration selection provided by the reviewer.
 */
export type CanonicalSelection =
  | {
      kind: 'SELECT_SCHEME_HYPOTHESIS';
      canonical: string;
    }
  | {
      kind: 'MANUAL_CANONICAL';
      canonical: string;
    };

/**
 * Immutable review packet presenting exact candidate state and Phase 5D scheme analysis.
 */
export interface CandidateReviewPacket {
  /** Deterministic packet identifier */
  id: string;

  /** ID of the candidate under review */
  candidateId: string;

  /** Defensive snapshot of the LexicalCandidate */
  candidateSnapshot: LexicalCandidate;

  /** Deterministic ID of the Phase 5D CandidateSchemeAnalysis */
  schemeAnalysisId: string;

  /** Defensive snapshot of the Phase 5D analysis */
  schemeAnalysisSnapshot: CandidateSchemeAnalysis;

  /** Deduplicated, deterministically sorted list of supporting LexicalEvidence IDs */
  evidenceIds: string[];

  /** Deterministic semantic fingerprint of the full review basis */
  reviewBasisFingerprint: string;

  /** Optional wall-clock preparation timestamp (excluded from deterministic ID/fingerprint) */
  preparedAt?: string;

  /** Software version of the review packet generator */
  packetVersion: string;
}

/**
 * Immutable record of a human adjudication decision.
 */
export interface CandidateAdjudicationDecision {
  /** Deterministic identifier for this human decision event */
  id: string;

  /** ID of the review packet that was presented */
  reviewPacketId: string;

  /** Review-basis fingerprint at the time of decision */
  reviewBasisFingerprint: string;

  /** ID of the candidate */
  candidateId: string;

  /** ID of the Phase 5D scheme analysis */
  schemeAnalysisId: string;

  /** Human reviewer disposition */
  disposition: AdjudicationDisposition;

  /** Explicit canonical selection (strictly non-null for ACCEPT; strictly null for REJECT/DEFER) */
  canonicalSelection: CanonicalSelection | null;

  /** Caller-asserted reviewer identifier (non-empty) */
  reviewerRef: string;

  /** Optional human-readable display name of the reviewer */
  reviewerDisplayName?: string;

  /** Scholarly rationale explaining the decision (non-empty) */
  rationale: string;

  /** ISO 8601 timestamp of when the decision was recorded */
  decidedAt: string;

  /** Defensive snapshot of candidate at review time */
  candidateSnapshot: LexicalCandidate;

  /** Defensive snapshot of scheme analysis at review time */
  schemeAnalysisSnapshot: CandidateSchemeAnalysis;

  /** Decision schema version */
  decisionVersion: string;
}

/**
 * Request payload for recording a human adjudication decision.
 */
export interface AdjudicationDecisionRequest {
  reviewPacketId: string;
  reviewBasisFingerprint: string;
  candidateId: string;
  disposition: AdjudicationDisposition;
  canonicalSelection?: CanonicalSelection | null;
  reviewerRef: string;
  reviewerDisplayName?: string;
  rationale: string;
  decidedAt?: string;
}

/**
 * Action determined during lexicon promotion planning.
 */
export type PromotionAction =
  | 'CREATE_ENTRY'
  | 'ADD_READING'
  | 'ALREADY_PRESENT';

/**
 * Preview/plan of proposed changes to a LexiconRepository from an accepted human decision.
 */
export interface LexiconPromotionPlan {
  /** Deterministic identifier for this promotion plan */
  id: string;

  /** ID of the accepted human decision */
  decisionId: string;

  /** ID of the candidate */
  candidateId: string;

  /** Canonical transliteration to be promoted */
  canonical: string;

  /** Normalized Persian script string */
  normalizedPersian: string;

  /** Persian surface script string */
  persianSurface: string;

  /** Target promotion action against the base lexicon */
  action: PromotionAction;

  /** Deterministic entry ID (new or existing) */
  targetEntryId: string;

  /** Deterministic reading ID (new or existing) */
  targetReadingId: string;

  /** Fingerprint of the base lexicon at plan preparation time */
  expectedBaseLexiconFingerprint: string;

  /** Fingerprint of the review basis */
  reviewBasisFingerprint: string;

  /** Promotion plan version */
  planVersion: string;
}

/**
 * Immutable receipt recorded when an accepted human decision is promoted to a LexiconRepository.
 */
export interface PromotionReceipt {
  /** Deterministic identifier for this promotion event */
  id: string;

  /** ID of the promoted human decision */
  decisionId: string;

  /** ID of the review packet */
  reviewPacketId: string;

  /** Fingerprint of the review basis */
  reviewBasisFingerprint: string;

  /** ID of the candidate */
  candidateId: string;

  /** ID of the scheme analysis */
  schemeAnalysisId: string;

  /** Promoted canonical transliteration */
  canonical: string;

  /** Action performed */
  action: PromotionAction;

  /** Target lexical entry ID in the resulting repository */
  lexiconEntryId: string;

  /** Target lexical reading ID in the resulting repository */
  lexicalReadingId: string;

  /** Fingerprint of base lexicon before promotion */
  baseLexiconFingerprint: string;

  /** Fingerprint of resulting lexicon after promotion */
  resultLexiconFingerprint: string;

  /** Caller-asserted promoter identifier (non-empty) */
  promoterRef: string;

  /** Optional promoter display name */
  promoterDisplayName?: string;

  /** ISO 8601 timestamp of promotion execution */
  promotedAt: string;

  /** Promotion engine version */
  promotionVersion: string;
}

/**
 * Caller-asserted provenance for executing a promotion action.
 */
export interface PromoterProvenance {
  promoterRef: string;
  promoterDisplayName?: string;
  promotedAt?: string;
}

/**
 * Serialized representation of append-only adjudication ledger.
 */
export interface SerializedAdjudicationStore {
  version: 1;
  decisions: CandidateAdjudicationDecision[];
  receipts: PromotionReceipt[];
}
