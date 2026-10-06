/**
 * Explicit Lexicon Promotion Workflow (Phase 5E).
 *
 * Core scholarly invariants:
 *   1. Promotion is an explicit, separate action from review decision.
 *   2. Complete PromotionPlan semantic binding: Every executable plan field is bound into deterministic plan ID.
 *   3. executePromotion enforces full plan equivalence against recomputed plan (zero tolerance for tampering).
 *   4. Revalidates decision snapshot integrity, absence of conflicting human decisions, live review basis,
 *      canonical-selection authority, and base lexicon fingerprint before executing promotion (fail-closed).
 *   5. Returns a NEW LexiconRepository snapshot and leaves the supplied repository completely untouched.
 *   6. Append-only PromotionReceipt (with promotionPlanId) is recorded into the AdjudicationLedger.
 *   7. Double promotion of a single decision is strictly forbidden.
 */

import { LexiconRepository } from '../../lexicon/repository';
import { validateManualTransliteration } from '../../review/validation';
import { deepClone, LexicalEvidenceRepository } from '../repository';
import {
  ConflictingHumanDecisionsError,
  InvalidAdjudicationDecisionError,
  StaleReviewBasisError,
  validateAdjudicationDecisionIntegrity
} from './decision';
import { computeLexiconFingerprint, computeReviewBasisFingerprint } from './fingerprint';
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
 * Validate that a promotion plan satisfies intrinsic integrity constraints
 * and has an untampered deterministic plan ID matching all executable fields.
 */
export function validatePromotionPlanIntegrity(plan: LexiconPromotionPlan): void {
  if (!plan || typeof plan !== 'object') {
    throw new InvalidPromotionPlanError('Promotion plan must be a non-null object.');
  }

  if (!plan.id || typeof plan.id !== 'string' || plan.id.trim() === '') {
    throw new InvalidPromotionPlanError('Promotion plan must specify a non-empty id.');
  }

  if (!plan.decisionId || typeof plan.decisionId !== 'string' || plan.decisionId.trim() === '') {
    throw new InvalidPromotionPlanError(`Plan "${plan.id}" must specify a non-empty decisionId.`);
  }

  if (!plan.candidateId || typeof plan.candidateId !== 'string' || plan.candidateId.trim() === '') {
    throw new InvalidPromotionPlanError(`Plan "${plan.id}" must specify a non-empty candidateId.`);
  }

  if (!plan.canonical || typeof plan.canonical !== 'string' || plan.canonical.trim() === '') {
    throw new InvalidPromotionPlanError(`Plan "${plan.id}" must specify a non-empty canonical.`);
  }

  if (!plan.normalizedPersian || typeof plan.normalizedPersian !== 'string' || plan.normalizedPersian.trim() === '') {
    throw new InvalidPromotionPlanError(`Plan "${plan.id}" must specify a non-empty normalizedPersian.`);
  }

  if (!plan.persianSurface || typeof plan.persianSurface !== 'string' || plan.persianSurface.trim() === '') {
    throw new InvalidPromotionPlanError(`Plan "${plan.id}" must specify a non-empty persianSurface.`);
  }

  const validActions = ['CREATE_ENTRY', 'ADD_READING', 'ALREADY_PRESENT'];
  if (!validActions.includes(plan.action)) {
    throw new InvalidPromotionPlanError(
      `Plan "${plan.id}" specifies invalid action "${plan.action}". Must be one of: ${validActions.join(', ')}.`
    );
  }

  if (!plan.targetEntryId || typeof plan.targetEntryId !== 'string' || plan.targetEntryId.trim() === '') {
    throw new InvalidPromotionPlanError(`Plan "${plan.id}" must specify a non-empty targetEntryId.`);
  }

  if (!plan.targetReadingId || typeof plan.targetReadingId !== 'string' || plan.targetReadingId.trim() === '') {
    throw new InvalidPromotionPlanError(`Plan "${plan.id}" must specify a non-empty targetReadingId.`);
  }

  if (!plan.expectedBaseLexiconFingerprint || typeof plan.expectedBaseLexiconFingerprint !== 'string' || plan.expectedBaseLexiconFingerprint.trim() === '') {
    throw new InvalidPromotionPlanError(`Plan "${plan.id}" must specify a non-empty expectedBaseLexiconFingerprint.`);
  }

  if (!plan.reviewBasisFingerprint || typeof plan.reviewBasisFingerprint !== 'string' || plan.reviewBasisFingerprint.trim() === '') {
    throw new InvalidPromotionPlanError(`Plan "${plan.id}" must specify a non-empty reviewBasisFingerprint.`);
  }

  if (!plan.planVersion || typeof plan.planVersion !== 'string' || plan.planVersion.trim() === '') {
    throw new InvalidPromotionPlanError(`Plan "${plan.id}" must specify a non-empty planVersion.`);
  }

  const recomputedId = generatePromotionPlanId({
    decisionId: plan.decisionId,
    candidateId: plan.candidateId,
    canonical: plan.canonical,
    normalizedPersian: plan.normalizedPersian,
    persianSurface: plan.persianSurface,
    action: plan.action,
    targetEntryId: plan.targetEntryId,
    targetReadingId: plan.targetReadingId,
    expectedBaseLexiconFingerprint: plan.expectedBaseLexiconFingerprint,
    reviewBasisFingerprint: plan.reviewBasisFingerprint,
    planVersion: plan.planVersion
  });

  if (recomputedId !== plan.id) {
    throw new InvalidPromotionPlanError(
      `Plan ID "${plan.id}" does not match recomputed deterministic plan ID "${recomputedId}". Plan identity tampering detected.`
    );
  }
}

/**
 * Assert exact semantic equivalence across all executable fields of two PromotionPlans.
 */
export function assertExactSamePromotionPlan(
  actual: LexiconPromotionPlan,
  expected: LexiconPromotionPlan
): void {
  validatePromotionPlanIntegrity(actual);
  validatePromotionPlanIntegrity(expected);

  if (actual.id !== expected.id) {
    throw new InvalidPromotionPlanError(
      `Plan ID mismatch: actual "${actual.id}" does not match expected "${expected.id}". Plan tampering detected.`
    );
  }
  if (actual.decisionId !== expected.decisionId) {
    throw new InvalidPromotionPlanError(
      `Plan decisionId mismatch: actual "${actual.decisionId}" vs expected "${expected.decisionId}".`
    );
  }
  if (actual.candidateId !== expected.candidateId) {
    throw new InvalidPromotionPlanError(
      `Plan candidateId mismatch: actual "${actual.candidateId}" vs expected "${expected.candidateId}".`
    );
  }
  if (actual.canonical !== expected.canonical) {
    throw new InvalidPromotionPlanError(
      `Plan canonical mismatch: actual "${actual.canonical}" vs expected "${expected.canonical}". Canonical substitution detected.`
    );
  }
  if (actual.normalizedPersian !== expected.normalizedPersian) {
    throw new InvalidPromotionPlanError(
      `Plan normalizedPersian mismatch: actual "${actual.normalizedPersian}" vs expected "${expected.normalizedPersian}".`
    );
  }
  if (actual.persianSurface !== expected.persianSurface) {
    throw new InvalidPromotionPlanError(
      `Plan persianSurface mismatch: actual "${actual.persianSurface}" vs expected "${expected.persianSurface}".`
    );
  }
  if (actual.action !== expected.action) {
    throw new InvalidPromotionPlanError(
      `Plan action mismatch: actual "${actual.action}" vs expected "${expected.action}".`
    );
  }
  if (actual.targetEntryId !== expected.targetEntryId) {
    throw new InvalidPromotionPlanError(
      `Plan targetEntryId mismatch: actual "${actual.targetEntryId}" vs expected "${expected.targetEntryId}".`
    );
  }
  if (actual.targetReadingId !== expected.targetReadingId) {
    throw new InvalidPromotionPlanError(
      `Plan targetReadingId mismatch: actual "${actual.targetReadingId}" vs expected "${expected.targetReadingId}".`
    );
  }
  if (actual.expectedBaseLexiconFingerprint !== expected.expectedBaseLexiconFingerprint) {
    throw new InvalidPromotionPlanError(
      `Plan expectedBaseLexiconFingerprint mismatch: actual "${actual.expectedBaseLexiconFingerprint}" vs expected "${expected.expectedBaseLexiconFingerprint}".`
    );
  }
  if (actual.reviewBasisFingerprint !== expected.reviewBasisFingerprint) {
    throw new InvalidPromotionPlanError(
      `Plan reviewBasisFingerprint mismatch: actual "${actual.reviewBasisFingerprint}" vs expected "${expected.reviewBasisFingerprint}".`
    );
  }
  if (actual.planVersion !== expected.planVersion) {
    throw new InvalidPromotionPlanError(
      `Plan planVersion mismatch: actual "${actual.planVersion}" vs expected "${expected.planVersion}".`
    );
  }
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

  // 1. Validate intrinsic decision integrity
  validateAdjudicationDecisionIntegrity(decision);

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

  // 2. Check if decision is already promoted
  const existingReceipt = adjudicationLedger.getReceiptByDecisionId(decisionId);
  if (existingReceipt) {
    throw new DecisionAlreadyPromotedError(decisionId, existingReceipt.id);
  }

  // 3. Check for conflicting ACCEPT decisions on the same review basis
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

  // 4. Verify live review packet matches decision basis completely
  const livePacket = prepareCandidateReviewPacket(decision.candidateId, evidenceRepository);
  if (livePacket.id !== decision.reviewPacketId) {
    throw new StaleReviewBasisError(
      `Cannot prepare promotion plan: live review packet ID ("${livePacket.id}") does not match decision packet ID ("${decision.reviewPacketId}").`
    );
  }

  if (livePacket.reviewBasisFingerprint !== decision.reviewBasisFingerprint) {
    throw new StaleReviewBasisError(
      `Cannot prepare promotion plan: candidate "${decision.candidateId}" review basis has changed since decision was recorded (decision basis: ${decision.reviewBasisFingerprint}, live basis: ${livePacket.reviewBasisFingerprint}).`
    );
  }

  if (livePacket.schemeAnalysisId !== decision.schemeAnalysisId) {
    throw new StaleReviewBasisError(
      `Cannot prepare promotion plan: live scheme analysis ID ("${livePacket.schemeAnalysisId}") does not match decision scheme analysis ID ("${decision.schemeAnalysisId}").`
    );
  }

  // 5. Revalidate snapshot fingerprint
  const recomputedDecisionFingerprint = computeReviewBasisFingerprint(
    decision.candidateSnapshot,
    decision.schemeAnalysisSnapshot
  );
  if (recomputedDecisionFingerprint !== decision.reviewBasisFingerprint) {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" candidate/scheme snapshot does not recompute to declared reviewBasisFingerprint.`
    );
  }

  // 6. Revalidate canonical selection authority
  const canonical = decision.canonicalSelection.canonical;
  if (decision.canonicalSelection.kind === 'SELECT_SCHEME_HYPOTHESIS') {
    if (
      !decision.schemeAnalysisSnapshot.deterministicTargetHypotheses.includes(canonical) ||
      !livePacket.schemeAnalysisSnapshot.deterministicTargetHypotheses.includes(canonical)
    ) {
      throw new InvalidAdjudicationDecisionError(
        `Selected scheme hypothesis "${canonical}" is not present in live deterministic target hypotheses.`
      );
    }
  } else if (decision.canonicalSelection.kind === 'MANUAL_CANONICAL') {
    const val = validateManualTransliteration(canonical);
    if (!val.valid || val.normalized !== canonical) {
      throw new InvalidAdjudicationDecisionError(
        `Manual canonical "${canonical}" failed validation: ${val.error ?? 'Invalid value.'}`
      );
    }
  }

  const expectedBaseLexiconFingerprint = computeLexiconFingerprint(currentLexiconRepository);
  const normalizedPersian = decision.candidateSnapshot.normalizedForm;
  const persianSurface = decision.candidateSnapshot.persianForm;

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

  // 1. Re-validate decision exists and satisfies intrinsic integrity
  const decision = adjudicationLedger.getDecisionById(plan.decisionId);
  if (!decision) {
    throw new InvalidPromotionPlanError(
      `Cannot execute promotion: decision "${plan.decisionId}" not found in adjudication ledger.`
    );
  }

  validateAdjudicationDecisionIntegrity(decision);

  if (decision.disposition !== 'ACCEPT' || !decision.canonicalSelection) {
    throw new InvalidPromotionPlanError(
      `Cannot execute promotion: decision "${decision.id}" has invalid disposition or lacks canonical selection.`
    );
  }

  // 2. Explicitly bind plan to selected human decision
  if (plan.decisionId !== decision.id) {
    throw new InvalidPromotionPlanError(
      `Plan decisionId "${plan.decisionId}" does not match decision ID "${decision.id}".`
    );
  }
  if (plan.candidateId !== decision.candidateId) {
    throw new InvalidPromotionPlanError(
      `Plan candidateId "${plan.candidateId}" does not match decision candidateId "${decision.candidateId}".`
    );
  }
  if (plan.canonical !== decision.canonicalSelection.canonical) {
    throw new InvalidPromotionPlanError(
      `Plan canonical "${plan.canonical}" does not match decision canonical "${decision.canonicalSelection.canonical}". Canonical substitution detected.`
    );
  }
  if (plan.reviewBasisFingerprint !== decision.reviewBasisFingerprint) {
    throw new InvalidPromotionPlanError(
      `Plan reviewBasisFingerprint "${plan.reviewBasisFingerprint}" does not match decision reviewBasisFingerprint "${decision.reviewBasisFingerprint}".`
    );
  }

  // 3. Re-validate no previous promotion
  const existingReceipt = adjudicationLedger.getReceiptByDecisionId(plan.decisionId);
  if (existingReceipt) {
    throw new DecisionAlreadyPromotedError(plan.decisionId, existingReceipt.id);
  }

  // 4. Re-validate no conflicting ACCEPT decisions
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

  // 5. Re-validate live review packet completely
  const livePacket = prepareCandidateReviewPacket(decision.candidateId, currentEvidenceRepository);
  if (
    livePacket.id !== decision.reviewPacketId ||
    livePacket.reviewBasisFingerprint !== decision.reviewBasisFingerprint ||
    livePacket.reviewBasisFingerprint !== plan.reviewBasisFingerprint ||
    livePacket.candidateId !== decision.candidateId ||
    livePacket.schemeAnalysisId !== decision.schemeAnalysisId
  ) {
    throw new StaleReviewBasisError(
      `Promotion rejected: live candidate review basis does not match decision/plan basis.`
    );
  }

  // 6. Re-validate decision snapshot recomputed fingerprint
  const recomputedDecisionFp = computeReviewBasisFingerprint(
    decision.candidateSnapshot,
    decision.schemeAnalysisSnapshot
  );
  if (recomputedDecisionFp !== decision.reviewBasisFingerprint) {
    throw new InvalidAdjudicationDecisionError(
      `Decision "${decision.id}" snapshot does not recompute to declared reviewBasisFingerprint.`
    );
  }

  // 7. Re-validate canonical selection authority
  const canonical = decision.canonicalSelection.canonical;
  if (decision.canonicalSelection.kind === 'SELECT_SCHEME_HYPOTHESIS') {
    if (
      !decision.schemeAnalysisSnapshot.deterministicTargetHypotheses.includes(canonical) ||
      !livePacket.schemeAnalysisSnapshot.deterministicTargetHypotheses.includes(canonical)
    ) {
      throw new InvalidAdjudicationDecisionError(
        `Selected scheme hypothesis "${canonical}" is not present in live deterministic target hypotheses.`
      );
    }
  } else if (decision.canonicalSelection.kind === 'MANUAL_CANONICAL') {
    const val = validateManualTransliteration(canonical);
    if (!val.valid || val.normalized !== canonical) {
      throw new InvalidAdjudicationDecisionError(
        `Manual canonical "${canonical}" failed validation: ${val.error ?? 'Invalid value.'}`
      );
    }
  }

  // 8. Re-validate base lexicon fingerprint
  const currentLexiconFingerprint = computeLexiconFingerprint(currentLexiconRepository);
  if (currentLexiconFingerprint !== plan.expectedBaseLexiconFingerprint) {
    throw new StaleLexiconBaseError(
      `Promotion rejected: current lexicon fingerprint ("${currentLexiconFingerprint}") does not match plan expected base lexicon fingerprint ("${plan.expectedBaseLexiconFingerprint}"). Lexicon has been modified.`
    );
  }

  // 9. Recompute plan and enforce complete plan equivalence
  const recomputedPlan = preparePromotionPlan(
    plan.decisionId,
    currentEvidenceRepository,
    adjudicationLedger,
    currentLexiconRepository,
    { planVersion: plan.planVersion }
  );

  assertExactSamePromotionPlan(plan, recomputedPlan);

  // 10. Construct new lexicon entries array via defensive deep clone
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

  // 11. Instantiate and validate new LexiconRepository snapshot
  const newRepository = new LexiconRepository(entries);
  newRepository.assertValid();

  const resultLexiconFingerprint = computeLexiconFingerprint(newRepository);
  const promotedAt = promoter.promotedAt ?? (options?.now ? options.now() : new Date().toISOString());
  const promotionVersion = options?.promotionVersion ?? PROMOTION_VERSION;

  const receiptId = generatePromotionReceiptId({
    decisionId: plan.decisionId,
    promotionPlanId: plan.id,
    candidateId: plan.candidateId,
    reviewPacketId: decision.reviewPacketId,
    reviewBasisFingerprint: decision.reviewBasisFingerprint,
    schemeAnalysisId: decision.schemeAnalysisId,
    canonical: plan.canonical,
    action: plan.action,
    lexiconEntryId: plan.targetEntryId,
    lexicalReadingId: plan.targetReadingId,
    baseLexiconFingerprint: plan.expectedBaseLexiconFingerprint,
    resultLexiconFingerprint,
    promoterRef: promoter.promoterRef.trim(),
    promotedAt,
    promotionVersion
  });

  const receipt: PromotionReceipt = {
    id: receiptId,
    decisionId: plan.decisionId,
    promotionPlanId: plan.id,
    promotionPlanSnapshot: deepClone(plan),
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

  // 12. Record receipt in append-only ledger
  adjudicationLedger.addReceipt(receipt);

  return {
    repository: newRepository,
    receipt: deepClone(receipt)
  };
}
