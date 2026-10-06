/**
 * Deterministic identity hashing for Phase 5E human adjudication and promotion entities.
 *
 * Invariant: All IDs are generated deterministically from semantic inputs without randomness.
 */

import crypto from 'node:crypto';
import type { AdjudicationDisposition, CanonicalSelection } from './types';

/**
 * Generate a deterministic identifier for a CandidateReviewPacket.
 * Excludes wall-clock timestamps (preparedAt) to ensure idempotent re-preparation.
 */
export function generateReviewPacketId(params: {
  candidateId: string;
  schemeAnalysisId: string;
  reviewBasisFingerprint: string;
  packetVersion: string;
}): string {
  const hash = crypto.createHash('sha256');
  hash.update(params.candidateId);
  hash.update('\0');
  hash.update(params.schemeAnalysisId);
  hash.update('\0');
  hash.update(params.reviewBasisFingerprint);
  hash.update('\0');
  hash.update(params.packetVersion);

  const digest = hash.digest('hex').slice(0, 16);
  return `rev-packet-${digest}`;
}

/**
 * Generate a deterministic identifier for a human CandidateAdjudicationDecision.
 * Uses decidedAt to distinguish genuine distinct human review events while keeping each immutable.
 */
export function generateDecisionId(params: {
  reviewPacketId: string;
  candidateId: string;
  reviewerRef: string;
  disposition: AdjudicationDisposition;
  canonicalSelection: CanonicalSelection | null;
  decidedAt: string;
}): string {
  const hash = crypto.createHash('sha256');
  hash.update(params.reviewPacketId);
  hash.update('\0');
  hash.update(params.candidateId);
  hash.update('\0');
  hash.update(params.reviewerRef);
  hash.update('\0');
  hash.update(params.disposition);
  hash.update('\0');

  if (params.canonicalSelection) {
    hash.update(params.canonicalSelection.kind);
    hash.update('\0');
    hash.update(params.canonicalSelection.canonical);
  } else {
    hash.update('null');
  }

  hash.update('\0');
  hash.update(params.decidedAt);

  const digest = hash.digest('hex').slice(0, 16);
  return `adj-dec-${digest}`;
}

/**
 * Generate a deterministic identifier for a LexiconPromotionPlan.
 */
export function generatePromotionPlanId(params: {
  decisionId: string;
  action: string;
  targetEntryId: string;
  targetReadingId: string;
  expectedBaseLexiconFingerprint: string;
  planVersion: string;
}): string {
  const hash = crypto.createHash('sha256');
  hash.update(params.decisionId);
  hash.update('\0');
  hash.update(params.action);
  hash.update('\0');
  hash.update(params.targetEntryId);
  hash.update('\0');
  hash.update(params.targetReadingId);
  hash.update('\0');
  hash.update(params.expectedBaseLexiconFingerprint);
  hash.update('\0');
  hash.update(params.planVersion);

  const digest = hash.digest('hex').slice(0, 16);
  return `prom-plan-${digest}`;
}

/**
 * Generate a deterministic identifier for a PromotionReceipt.
 */
export function generatePromotionReceiptId(params: {
  decisionId: string;
  planId: string;
  baseLexiconFingerprint: string;
  promoterRef: string;
  promotedAt: string;
}): string {
  const hash = crypto.createHash('sha256');
  hash.update(params.decisionId);
  hash.update('\0');
  hash.update(params.planId);
  hash.update('\0');
  hash.update(params.baseLexiconFingerprint);
  hash.update('\0');
  hash.update(params.promoterRef);
  hash.update('\0');
  hash.update(params.promotedAt);

  const digest = hash.digest('hex').slice(0, 16);
  return `prom-rcpt-${digest}`;
}

/**
 * Generate a deterministic lexical entry ID for a promoted candidate.
 */
export function generatePromotedEntryId(normalizedPersian: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(normalizedPersian);
  const digest = hash.digest('hex').slice(0, 16);
  return `lex:promoted:${digest}`;
}

/**
 * Generate a deterministic reading ID for a promoted canonical transliteration.
 */
export function generatePromotedReadingId(entryId: string, canonical: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(entryId);
  hash.update('\0');
  hash.update(canonical);
  const digest = hash.digest('hex').slice(0, 16);
  return `read:promoted:${digest}`;
}
