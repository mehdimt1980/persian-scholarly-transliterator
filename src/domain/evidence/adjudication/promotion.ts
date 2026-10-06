/**
 * Explicit Lexicon Promotion Workflow (Phase 5E).
 *
 * Core scholarly invariants:
 *   1. Promotion is an explicit, separate action from review decision.
 *   2. Revalidates decision, absence of conflicting human decisions, live review basis,
 *      and base lexicon fingerprint before executing promotion (fail-closed).
 *   3. Returns a NEW LexiconRepository snapshot and leaves the supplied repository completely untouched.
 *   4. Append-only PromotionReceipt is recorded into the AdjudicationLedger.
 *   5. Double promotion of a single decision is strictly forbidden.
 */

import { LexiconRepository } from '../../lexicon/repository';
import { deepClone, LexicalEvidenceRepository } from '../repository';
import { ConflictingHumanDecisionsError, StaleReviewBasisError } from './decision';
import { computeLexiconFingerprint } from './fingerprint';
import {
  generatePromotedEntryId,
  generatePromotedReadingId,
  generatePromotionPlanId,
  generatePromotionReceiptId
} from './identity';
import { buildPromotedLexicalEntry, buildPromotedReading } from './lexiconAdapter';
import { prepareCandidateReviewPacket } from './reviewPacket';
import type { AdjudicationLedger } from './ledger';
import type {
  LexiconPromotionPlan,
  PromoterProvenance,
  PromotionAction,
  PromotionReceipt
} from './types';

export const PROMOTION_PLAN_VERSION = '1.0.0';
export const PROMOTION_VERSION = '1.0.0';

export class StaleLexiconBaseError extends Error {
  constructor(message: string) {
    super(`[StaleLexiconBase] ${message}`);
    this.name = 'StaleLexiconBaseError';
  }
}

export class DecisionAlreadyPromotedError extends Error {
  public readonly decisionId: string;
  public readonly receiptId: string;

  constructor(decisionId: string, receiptId: string) {
    super(
      `[DecisionAlreadyPromoted] Decision "${decisionId}" has already been promoted under receipt "${receiptId}". Decisions may be promoted at most once.`
    );
    this.name = 'DecisionAlreadyPromotedError';
    this.decisionId = decisionId;
    this.receiptId = receiptId;
  }
}

export class InvalidPromotionPlanError extends Error {
  constructor(message: string) {
    super(`[InvalidPromotionPlan] ${message}`);
    this.name = 'InvalidPromotionPlanError';
  }
}

export interface PromotionPlanOptions {
  planVersion?: string;
}

export interface ExecutePromotionOptions {
  promotionVersion?: string;
  now?: () => string;
}

/**
 * Pure function to prepare a deterministic LexiconPromotionPlan previewing
 * the exact actions required to promote an accepted human decision into a lexicon.
 */
export function preparePromotionPlan(
  decisionId: string,
  evidenceRepository: LexicalEvidenceRepository,
  adjudicationLedger: AdjudicationLedger,
  currentLexiconRepository: LexiconRepository,
  options?: PromotionPlanOptions
): LexiconPromotionPlan {
  if (!decisionId || decisionId.trim() === '') {
    throw new InvalidPromotionPlanError('Decision ID must be a non-empty string.');
  }

  const decision = adjudicationLedger.getDecisionById(decisionId);
  if (!decision) {
    throw new InvalidPromotionPlanError(
      `Cannot prepare promotion plan: decision "${decisionId}" not found in adjudication ledger.`
    );
  }

  if (decision.disposition !== 'ACCEPT') {
    throw new InvalidPromotionPlanError(
      `Cannot prepare promotion plan for decision "${decisionId}" with disposition "${decision.disposition}". Only ACCEPT decisions can be promoted.`
    );
  }

  if (!decision.canonicalSelection) {
    throw new InvalidPromotionPlanError(
      `Decision "${decisionId}" is missing required canonical selection.`
    );
  }

  // Check if decision is already promoted
  const existingReceipt = adjudicationLedger.getReceiptByDecisionId(decisionId);
  if (existingReceipt) {
    throw new DecisionAlreadyPromotedError(decisionId, existingReceipt.id);
  }

  // Check for conflicting ACCEPT decisions on the same review basis
  const conflictingDecisions = adjudicationLedger.detectConflictingAcceptDecisions(
    decision.reviewBasisFingerprint
  );
  if (conflictingDecisions.length > 0) {
    throw new ConflictingHumanDecisionsError(
      decision.candidateId,
      decision.reviewBasisFingerprint,
      `Multiple ACCEPT decisions exist for this review basis with conflicting canonical selections: [${conflictingDecisions
        .map((d) => `"${d.canonicalSelection?.canonical}" by ${d.reviewerRef}`)
        .join(', ')}]. Governance resolution required.`
    );
  }

  // Verify review basis is still live and matching
  const livePacket = prepareCandidateReviewPacket(decision.candidateId, evidenceRepository);
  if (livePacket.reviewBasisFingerprint !== decision.reviewBasisFingerprint) {
    throw new StaleReviewBasisError(
      `Cannot prepare promotion plan: candidate "${decision.candidateId}" review basis has changed since decision was recorded (decision basis: ${decision.reviewBasisFingerprint}, live basis: ${livePacket.reviewBasisFingerprint}).`
    );
  }

  const expectedBaseLexiconFingerprint = computeLexiconFingerprint(currentLexiconRepository);
  const normalizedPersian = decision.candidateSnapshot.normalizedForm;
  const persianSurface = decision.candidateSnapshot.persianForm;
  const canonical = decision.canonicalSelection.canonical;

  const existingEntry = currentLexiconRepository.findByNormalized(normalizedPersian);

  let action: PromotionAction;
  let targetEntryId: string;
  let targetReadingId: string;

  if (!existingEntry) {
    action = 'CREATE_ENTRY';
    targetEntryId = generatePromotedEntryId(normalizedPersian);
    targetReadingId = generatePromotedReadingId(targetEntryId, canonical);
  } else {
    targetEntryId = existingEntry.id;
    const existingReading = existingEntry.readings.find((r) => r.canonical === canonical);
    if (existingReading) {
      action = 'ALREADY_PRESENT';
      targetReadingId = existingReading.id ?? generatePromotedReadingId(targetEntryId, canonical);
    } else {
      action = 'ADD_READING';
      targetReadingId = generatePromotedReadingId(targetEntryId, canonical);
    }
  }

  const planVersion = options?.planVersion ?? PROMOTION_PLAN_VERSION;
  const planId = generatePromotionPlanId({
    decisionId: decision.id,
    action,
    targetEntryId,
    targetReadingId,
    expectedBaseLexiconFingerprint,
    planVersion
  });

  return {
    id: planId,
    decisionId: decision.id,
    candidateId: decision.candidateId,
    canonical,
    normalizedPersian,
    persianSurface,
    action,
    targetEntryId,
    targetReadingId,
    expectedBaseLexiconFingerprint,
    reviewBasisFingerprint: decision.reviewBasisFingerprint,
    planVersion
  };
}

/**
 * Execute an explicit promotion plan against a base LexiconRepository.
 *
 * Revalidates all invariants, returns a NEW LexiconRepository snapshot,
 * and appends a PromotionReceipt to the AdjudicationLedger.
 */
export function executePromotion(
  plan: LexiconPromotionPlan,
  currentEvidenceRepository: LexicalEvidenceRepository,
  adjudicationLedger: AdjudicationLedger,
  currentLexiconRepository: LexiconRepository,
  promoter: PromoterProvenance,
  options?: ExecutePromotionOptions
): {
  repository: LexiconRepository;
  receipt: PromotionReceipt;
} {
  if (!promoter.promoterRef || promoter.promoterRef.trim() === '') {
    throw new Error('Promoter reference (promoterRef) must be a non-empty string.');
  }

  // 1. Re-validate decision exists and is ACCEPT
  const decision = adjudicationLedger.getDecisionById(plan.decisionId);
  if (!decision) {
    throw new InvalidPromotionPlanError(
      `Cannot execute promotion: decision "${plan.decisionId}" not found in adjudication ledger.`
    );
  }

  if (decision.disposition !== 'ACCEPT' || !decision.canonicalSelection) {
    throw new InvalidPromotionPlanError(
      `Cannot execute promotion: decision "${decision.id}" has invalid disposition or lacks canonical selection.`
    );
  }

  // 2. Re-validate no previous promotion
  const existingReceipt = adjudicationLedger.getReceiptByDecisionId(plan.decisionId);
  if (existingReceipt) {
    throw new DecisionAlreadyPromotedError(plan.decisionId, existingReceipt.id);
  }

  // 3. Re-validate no conflicting ACCEPT decisions
  const conflicts = adjudicationLedger.detectConflictingAcceptDecisions(
    decision.reviewBasisFingerprint
  );
  if (conflicts.length > 0) {
    throw new ConflictingHumanDecisionsError(
      decision.candidateId,
      decision.reviewBasisFingerprint,
      'Conflicting human decisions detected on review basis.'
    );
  }

  // 4. Re-validate review basis is still live and matching
  const livePacket = prepareCandidateReviewPacket(decision.candidateId, currentEvidenceRepository);
  if (
    livePacket.reviewBasisFingerprint !== decision.reviewBasisFingerprint ||
    livePacket.reviewBasisFingerprint !== plan.reviewBasisFingerprint
  ) {
    throw new StaleReviewBasisError(
      `Promotion rejected: live candidate review basis fingerprint ("${livePacket.reviewBasisFingerprint}") does not match decision/plan fingerprint ("${decision.reviewBasisFingerprint}").`
    );
  }

  // 5. Re-validate base lexicon fingerprint
  const currentLexiconFingerprint = computeLexiconFingerprint(currentLexiconRepository);
  if (currentLexiconFingerprint !== plan.expectedBaseLexiconFingerprint) {
    throw new StaleLexiconBaseError(
      `Promotion rejected: current lexicon fingerprint ("${currentLexiconFingerprint}") does not match plan expected base lexicon fingerprint ("${plan.expectedBaseLexiconFingerprint}"). Lexicon has been modified.`
    );
  }

  // 6. Recompute plan to ensure exact plan identity consistency
  const recomputedPlan = preparePromotionPlan(
    plan.decisionId,
    currentEvidenceRepository,
    adjudicationLedger,
    currentLexiconRepository,
    { planVersion: plan.planVersion }
  );
  if (recomputedPlan.id !== plan.id || recomputedPlan.action !== plan.action) {
    throw new InvalidPromotionPlanError(
      `Promotion rejected: plan "${plan.id}" does not recompute identically against current state.`
    );
  }

  // 7. Construct new lexicon entries array via defensive deep clone
  const entries = deepClone(currentLexiconRepository.getAllEntries());

  if (plan.action === 'CREATE_ENTRY') {
    const newEntry = buildPromotedLexicalEntry({
      entryId: plan.targetEntryId,
      readingId: plan.targetReadingId,
      persianSurface: plan.persianSurface,
      normalizedPersian: plan.normalizedPersian,
      canonical: plan.canonical,
      decision,
      entityType: decision.candidateSnapshot.entityType
    });
    entries.push(newEntry);
  } else if (plan.action === 'ADD_READING') {
    const entryIdx = entries.findIndex((e) => e.id === plan.targetEntryId);
    if (entryIdx === -1) {
      throw new Error(`Target entry "${plan.targetEntryId}" not found in cloned entries.`);
    }
    const targetEntry = entries[entryIdx];
    const newReading = buildPromotedReading({
      readingId: plan.targetReadingId,
      canonical: plan.canonical,
      decision,
      category: targetEntry.category,
      properName: targetEntry.properName
    });
    targetEntry.readings.push(newReading);
  } else if (plan.action === 'ALREADY_PRESENT') {
    // No modifications to lexicon entries needed
  }

  // 8. Instantiate and validate new LexiconRepository snapshot
  const newRepository = new LexiconRepository(entries);
  newRepository.assertValid();

  const resultLexiconFingerprint = computeLexiconFingerprint(newRepository);
  const promotedAt = promoter.promotedAt ?? (options?.now ? options.now() : new Date().toISOString());
  const promotionVersion = options?.promotionVersion ?? PROMOTION_VERSION;

  const receiptId = generatePromotionReceiptId({
    decisionId: plan.decisionId,
    planId: plan.id,
    baseLexiconFingerprint: plan.expectedBaseLexiconFingerprint,
    promoterRef: promoter.promoterRef.trim(),
    promotedAt
  });

  const receipt: PromotionReceipt = {
    id: receiptId,
    decisionId: plan.decisionId,
    reviewPacketId: decision.reviewPacketId,
    reviewBasisFingerprint: decision.reviewBasisFingerprint,
    candidateId: plan.candidateId,
    schemeAnalysisId: decision.schemeAnalysisId,
    canonical: plan.canonical,
    action: plan.action,
    lexiconEntryId: plan.targetEntryId,
    lexicalReadingId: plan.targetReadingId,
    baseLexiconFingerprint: plan.expectedBaseLexiconFingerprint,
    resultLexiconFingerprint,
    promoterRef: promoter.promoterRef.trim(),
    promoterDisplayName: promoter.promoterDisplayName?.trim(),
    promotedAt,
    promotionVersion
  };

  // 9. Record receipt in append-only ledger
  adjudicationLedger.addReceipt(receipt);

  return {
    repository: newRepository,
    receipt: deepClone(receipt)
  };
}
