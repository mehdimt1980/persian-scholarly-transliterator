/**
 * Append-only Adjudication Ledger (Phase 5E).
 *
 * Core invariants:
 *   1. Historical append-only governance ledger for CandidateAdjudicationDecision and PromotionReceipt.
 *   2. Re-adding identical decision/receipt is an idempotent no-op.
 *   3. Re-adding an existing ID with altered data fails closed with immutability violation error.
 *   4. Defensive snapshot isolation on ingress and egress.
 *   5. Integrity validation ensures no orphaned receipts and valid reference graphs.
 */

import { deepClone } from '../repository';
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
  if (!selA && !selB) return true;
  if (!selA || !selB) return false;
  if (selA.kind !== selB.kind) return false;
  if (selA.canonical !== selB.canonical) return false;

  return true;
}

function isExactSameReceipt(a: PromotionReceipt, b: PromotionReceipt): boolean {
  if (a.id !== b.id) return false;
  if (a.decisionId !== b.decisionId) return false;
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
    if (!decision.id || decision.id.trim() === '') {
      throw new Error('Adjudication decision must have a non-empty id.');
    }
    if (!decision.candidateId || decision.candidateId.trim() === '') {
      throw new Error(`Decision "${decision.id}" must specify candidateId.`);
    }
    if (!decision.reviewerRef || decision.reviewerRef.trim() === '') {
      throw new Error(`Decision "${decision.id}" must specify non-empty reviewerRef.`);
    }

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
    if (!receipt.id || receipt.id.trim() === '') {
      throw new Error('Promotion receipt must have a non-empty id.');
    }
    if (!receipt.decisionId || receipt.decisionId.trim() === '') {
      throw new Error(`Receipt "${receipt.id}" must specify decisionId.`);
    }

    const snapshot = deepClone(receipt);
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
    const ledger = new AdjudicationLedger({
      decisions: store.decisions,
      receipts: store.receipts
    });
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

    // Check each receipt references an existing ACCEPT decision
    for (const receipt of this.receiptsById.values()) {
      const dec = this.decisionsById.get(receipt.decisionId);
      if (!dec) {
        errors.push(`Receipt "${receipt.id}" references non-existent decision "${receipt.decisionId}".`);
      } else {
        if (dec.disposition !== 'ACCEPT') {
          errors.push(
            `Receipt "${receipt.id}" references decision "${dec.id}" with non-ACCEPT disposition "${dec.disposition}".`
          );
        }
        if (!dec.canonicalSelection) {
          errors.push(
            `Receipt "${receipt.id}" references decision "${dec.id}" lacking a canonical selection.`
          );
        } else if (dec.canonicalSelection.canonical !== receipt.canonical) {
          errors.push(
            `Receipt "${receipt.id}" canonical "${receipt.canonical}" does not match decision canonical "${dec.canonicalSelection.canonical}".`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
