/**
 * Append-only Adjudication Ledger (Phase 5E).
 *
 * Core invariants:
 *   1. Historical append-only governance ledger for CandidateAdjudicationDecision and PromotionReceipt.
 *   2. Strict intrinsic decision and receipt validation on every insertion.
 *   3. Re-adding identical decision/receipt is an idempotent no-op.
 *   4. Re-adding an existing ID with altered data (including altered snapshots) fails closed with immutability violation error.
 *   5. Defensive snapshot isolation on ingress and egress.
 *   6. Immediate governance reference validation on receipt insertion (no orphaned receipts or receipts for REJECT/DEFER).
 *   7. Recomputes and verifies deterministic decision IDs and receipt IDs.
 */

import { deepClone } from '../repository';
import { computeReviewBasisFingerprint } from './fingerprint';
import { generatePromotionReceiptId } from './identity';
import { validateAdjudicationDecisionIntegrity } from './decision';
import type {
  CandidateAdjudicationDecision,
  PromotionReceipt,
  SerializedAdjudicationStore
} from './types';

export class DecisionImmutabilityViolationError extends Error {
  public readonly decisionId: string;

  constructor(decisionId: string) {
    super(
      `Decision record "${decisionId}" already exists with different data. Human adjudication decisions are immutable historical events.`
    );
    this.name = 'DecisionImmutabilityViolationError';
    this.decisionId = decisionId;
  }
}

export class ReceiptImmutabilityViolationError extends Error {
  public readonly receiptId: string;

  constructor(receiptId: string) {
    super(
      `Promotion receipt "${receiptId}" already exists with different data. Promotion receipts are immutable historical audit records.`
    );
    this.name = 'ReceiptImmutabilityViolationError';
    this.receiptId = receiptId;
  }
}

export class InvalidPromotionReceiptError extends Error {
  constructor(message: string) {
    super(`[InvalidPromotionReceipt] ${message}`);
    this.name = 'InvalidPromotionReceiptError';
  }
}

export interface AdjudicationIntegrityReport {
  valid: boolean;
  errors: string[];
}

function isExactSameDecision(
  a: CandidateAdjudicationDecision,
  b: CandidateAdjudicationDecision
): boolean {
  if (a.id !== b.id) return false;
  if (a.reviewPacketId !== b.reviewPacketId) return false;
  if (a.reviewBasisFingerprint !== b.reviewBasisFingerprint) return false;
  if (a.candidateId !== b.candidateId) return false;
  if (a.schemeAnalysisId !== b.schemeAnalysisId) return false;
  if (a.disposition !== b.disposition) return false;
  if (a.reviewerRef !== b.reviewerRef) return false;
  if ((a.reviewerDisplayName ?? null) !== (b.reviewerDisplayName ?? null)) return false;
  if (a.rationale !== b.rationale) return false;
  if (a.decidedAt !== b.decidedAt) return false;
  if (a.decisionVersion !== b.decisionVersion) return false;

  const selA = a.canonicalSelection;
  const selB = b.canonicalSelection;
  if (!selA && !selB) {
    // Both null
  } else if (!selA || !selB) {
    return false;
  } else {
    if (selA.kind !== selB.kind) return false;
    if (selA.canonical !== selB.canonical) return false;
  }

  // Compare semantic review basis fingerprints of snapshots
  const fpA = computeReviewBasisFingerprint(a.candidateSnapshot, a.schemeAnalysisSnapshot);
  const fpB = computeReviewBasisFingerprint(b.candidateSnapshot, b.schemeAnalysisSnapshot);
  if (fpA !== fpB) return false;

  return true;
}

function isExactSameReceipt(a: PromotionReceipt, b: PromotionReceipt): boolean {
  if (a.id !== b.id) return false;
  if (a.decisionId !== b.decisionId) return false;
  if (a.promotionPlanId !== b.promotionPlanId) return false;
  if (a.reviewPacketId !== b.reviewPacketId) return false;
  if (a.reviewBasisFingerprint !== b.reviewBasisFingerprint) return false;
  if (a.candidateId !== b.candidateId) return false;
  if (a.schemeAnalysisId !== b.schemeAnalysisId) return false;
  if (a.canonical !== b.canonical) return false;
  if (a.action !== b.action) return false;
  if (a.lexiconEntryId !== b.lexiconEntryId) return false;
  if (a.lexicalReadingId !== b.lexicalReadingId) return false;
  if (a.baseLexiconFingerprint !== b.baseLexiconFingerprint) return false;
  if (a.resultLexiconFingerprint !== b.resultLexiconFingerprint) return false;
  if (a.promoterRef !== b.promoterRef) return false;
  if ((a.promoterDisplayName ?? null) !== (b.promoterDisplayName ?? null)) return false;
  if (a.promotedAt !== b.promotedAt) return false;
  if (a.promotionVersion !== b.promotionVersion) return false;

  return true;
}

/**
 * Validate that a promotion receipt satisfies all integrity and governance reference constraints
 * relative to its referenced decision.
 */
export function validatePromotionReceiptIntegrity(
  receipt: PromotionReceipt,
  referencedDecision?: CandidateAdjudicationDecision
): void {
  if (!receipt.id || receipt.id.trim() === '') {
    throw new InvalidPromotionReceiptError('Promotion receipt must have a non-empty id.');
  }

  if (!receipt.decisionId || receipt.decisionId.trim() === '') {
    throw new InvalidPromotionReceiptError(
      `Receipt "${receipt.id}" must specify non-empty decisionId.`
    );
  }

  if (!receipt.promotionPlanId || receipt.promotionPlanId.trim() === '') {
    throw new InvalidPromotionReceiptError(
      `Receipt "${receipt.id}" must specify non-empty promotionPlanId.`
    );
  }

  if (!receipt.promoterRef || receipt.promoterRef.trim() === '') {
    throw new InvalidPromotionReceiptError(
      `Receipt "${receipt.id}" must specify non-empty promoterRef.`
    );
  }

  if (!referencedDecision) {
    throw new InvalidPromotionReceiptError(
      `Receipt "${receipt.id}" references non-existent decision "${receipt.decisionId}". Orphaned promotion receipts are prohibited.`
    );
  }

  if (referencedDecision.disposition !== 'ACCEPT') {
    throw new InvalidPromotionReceiptError(
      `Receipt "${receipt.id}" references decision "${referencedDecision.id}" with disposition "${referencedDecision.disposition}". Only ACCEPT decisions may be promoted.`
    );
  }

  if (!referencedDecision.canonicalSelection) {
    throw new InvalidPromotionReceiptError(
      `Receipt "${receipt.id}" references decision "${referencedDecision.id}" lacking a canonical selection.`
    );
  }

  if (receipt.canonical !== referencedDecision.canonicalSelection.canonical) {
    throw new InvalidPromotionReceiptError(
      `Receipt "${receipt.id}" canonical "${receipt.canonical}" does not match decision canonical "${referencedDecision.canonicalSelection.canonical}".`
    );
  }

  if (receipt.candidateId !== referencedDecision.candidateId) {
    throw new InvalidPromotionReceiptError(
      `Receipt "${receipt.id}" candidateId "${receipt.candidateId}" does not match decision candidateId "${referencedDecision.candidateId}".`
    );
  }

  if (receipt.reviewPacketId !== referencedDecision.reviewPacketId) {
    throw new InvalidPromotionReceiptError(
      `Receipt "${receipt.id}" reviewPacketId "${receipt.reviewPacketId}" does not match decision reviewPacketId "${referencedDecision.reviewPacketId}".`
    );
  }

  if (receipt.reviewBasisFingerprint !== referencedDecision.reviewBasisFingerprint) {
    throw new InvalidPromotionReceiptError(
      `Receipt "${receipt.id}" reviewBasisFingerprint "${receipt.reviewBasisFingerprint}" does not match decision reviewBasisFingerprint "${referencedDecision.reviewBasisFingerprint}".`
    );
  }

  if (receipt.schemeAnalysisId !== referencedDecision.schemeAnalysisId) {
    throw new InvalidPromotionReceiptError(
      `Receipt "${receipt.id}" schemeAnalysisId "${receipt.schemeAnalysisId}" does not match decision schemeAnalysisId "${referencedDecision.schemeAnalysisId}".`
    );
  }

  // Recompute receipt ID
  const recomputedId = generatePromotionReceiptId({
    decisionId: receipt.decisionId,
    planId: receipt.promotionPlanId,
    baseLexiconFingerprint: receipt.baseLexiconFingerprint,
    promoterRef: receipt.promoterRef,
    promotedAt: receipt.promotedAt
  });

  if (recomputedId !== receipt.id) {
    throw new InvalidPromotionReceiptError(
      `Receipt ID "${receipt.id}" does not match recomputed deterministic receipt ID "${recomputedId}". Receipt identity tampering detected.`
    );
  }
}

export class AdjudicationLedger {
  private readonly decisionsById: Map<string, CandidateAdjudicationDecision> = new Map();
  private readonly decisionsByCandidateId: Map<string, CandidateAdjudicationDecision[]> = new Map();
  private readonly decisionsByFingerprint: Map<string, CandidateAdjudicationDecision[]> = new Map();

  private readonly receiptsById: Map<string, PromotionReceipt> = new Map();
  private readonly receiptsByDecisionId: Map<string, PromotionReceipt> = new Map();

  constructor(initialData?: {
    decisions?: CandidateAdjudicationDecision[];
    receipts?: PromotionReceipt[];
  }) {
    if (initialData?.decisions) {
      for (const d of initialData.decisions) {
        this.addDecision(d);
      }
    }
    if (initialData?.receipts) {
      for (const r of initialData.receipts) {
        this.addReceipt(r);
      }
    }
  }

  // --- Decisions ---

  public addDecision(decision: CandidateAdjudicationDecision): void {
    // 1. Intrinsic decision integrity validation
    validateAdjudicationDecisionIntegrity(decision);

    const snapshot = deepClone(decision);
    const existing = this.decisionsById.get(snapshot.id);
    if (existing) {
      if (isExactSameDecision(existing, snapshot)) {
        return; // Idempotent no-op
      }
      throw new DecisionImmutabilityViolationError(snapshot.id);
    }

    this.decisionsById.set(snapshot.id, snapshot);

    // Index by candidate ID
    const candList = this.decisionsByCandidateId.get(snapshot.candidateId) ?? [];
    candList.push(snapshot);
    this.decisionsByCandidateId.set(snapshot.candidateId, candList);

    // Index by review basis fingerprint
    const fpList = this.decisionsByFingerprint.get(snapshot.reviewBasisFingerprint) ?? [];
    fpList.push(snapshot);
    this.decisionsByFingerprint.set(snapshot.reviewBasisFingerprint, fpList);
  }

  public getDecisionById(id: string): CandidateAdjudicationDecision | undefined {
    const d = this.decisionsById.get(id);
    return d ? deepClone(d) : undefined;
  }

  public getDecisionsByCandidateId(candidateId: string): CandidateAdjudicationDecision[] {
    const list = this.decisionsByCandidateId.get(candidateId) ?? [];
    return deepClone(list);
  }

  public getDecisionsByReviewBasisFingerprint(fingerprint: string): CandidateAdjudicationDecision[] {
    const list = this.decisionsByFingerprint.get(fingerprint) ?? [];
    return deepClone(list);
  }

  public getAllDecisions(): CandidateAdjudicationDecision[] {
    return deepClone(Array.from(this.decisionsById.values()));
  }

  /**
   * Detect conflicting ACCEPT decisions for the same review basis fingerprint
   * where different canonical selections were made.
   */
  public detectConflictingAcceptDecisions(
    reviewBasisFingerprint: string
  ): CandidateAdjudicationDecision[] {
    const decisions = this.decisionsByFingerprint.get(reviewBasisFingerprint) ?? [];
    const acceptDecisions = decisions.filter(
      (d) => d.disposition === 'ACCEPT' && d.canonicalSelection !== null
    );

    if (acceptDecisions.length <= 1) {
      return [];
    }

    const distinctCanonicals = new Set(
      acceptDecisions.map((d) => d.canonicalSelection!.canonical)
    );

    if (distinctCanonicals.size > 1) {
      return deepClone(acceptDecisions);
    }

    return [];
  }

  // --- Promotion Receipts ---

  public addReceipt(receipt: PromotionReceipt): void {
    const snapshot = deepClone(receipt);

    // 1. Resolve referenced decision
    const referencedDecision = this.decisionsById.get(snapshot.decisionId);

    // 2. Validate receipt integrity and references immediately
    validatePromotionReceiptIntegrity(snapshot, referencedDecision);

    const existing = this.receiptsById.get(snapshot.id);
    if (existing) {
      if (isExactSameReceipt(existing, snapshot)) {
        return; // Idempotent no-op
      }
      throw new ReceiptImmutabilityViolationError(snapshot.id);
    }

    // Check if decision is already promoted under a different receipt
    const existingForDecision = this.receiptsByDecisionId.get(snapshot.decisionId);
    if (existingForDecision && existingForDecision.id !== snapshot.id) {
      throw new Error(
        `Decision "${snapshot.decisionId}" is already promoted under receipt "${existingForDecision.id}". Duplicate promotion receipts for a single decision are prohibited.`
      );
    }

    this.receiptsById.set(snapshot.id, snapshot);
    this.receiptsByDecisionId.set(snapshot.decisionId, snapshot);
  }

  public getReceiptById(id: string): PromotionReceipt | undefined {
    const r = this.receiptsById.get(id);
    return r ? deepClone(r) : undefined;
  }

  public getReceiptByDecisionId(decisionId: string): PromotionReceipt | undefined {
    const r = this.receiptsByDecisionId.get(decisionId);
    return r ? deepClone(r) : undefined;
  }

  public getAllReceipts(): PromotionReceipt[] {
    return deepClone(Array.from(this.receiptsById.values()));
  }

  // --- Serialization & Integrity ---

  public serialize(): SerializedAdjudicationStore {
    return {
      version: 1,
      decisions: this.getAllDecisions(),
      receipts: this.getAllReceipts()
    };
  }

  public static deserialize(store: SerializedAdjudicationStore): AdjudicationLedger {
    if (store.version !== 1) {
      throw new Error(`Unsupported SerializedAdjudicationStore version: ${(store as any).version}`);
    }

    const ledger = new AdjudicationLedger();

    // Ingest decisions first
    for (const d of store.decisions) {
      ledger.addDecision(d);
    }

    // Ingest receipts
    for (const r of store.receipts) {
      ledger.addReceipt(r);
    }

    const report = ledger.validateIntegrity();
    if (!report.valid) {
      throw new Error(
        `Deserialized adjudication ledger failed integrity validation:\n${report.errors.map((e) => `  - ${e}`).join('\n')}`
      );
    }
    return ledger;
  }

  public validateIntegrity(): AdjudicationIntegrityReport {
    const errors: string[] = [];

    // Validate every decision
    for (const decision of this.decisionsById.values()) {
      try {
        validateAdjudicationDecisionIntegrity(decision);
      } catch (err: any) {
        errors.push(`Decision "${decision.id}" invalid: ${err.message}`);
      }
    }

    // Validate every receipt
    for (const receipt of this.receiptsById.values()) {
      const dec = this.decisionsById.get(receipt.decisionId);
      try {
        validatePromotionReceiptIntegrity(receipt, dec);
      } catch (err: any) {
        errors.push(`Receipt "${receipt.id}" invalid: ${err.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
