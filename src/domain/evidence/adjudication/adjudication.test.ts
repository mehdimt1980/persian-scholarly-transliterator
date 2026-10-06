import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { LexicalEvidenceRepository } from '../repository';
import { LexiconRepository } from '../../lexicon/repository';
import { DEFAULT_LEXICON_REPOSITORY } from '../../../data/lexicon';
import { parseMarcXml } from '../loc/xmlParser';
import { extractEvidenceFromMarcRecord } from '../loc/extractor';
import { processEvidenceAlignmentBatch } from '../alignment/batchOrchestrator';
import { synthesizeCandidateFromEvidence } from '../candidate';
import { LexicalEvidence } from '../types';
import {
  prepareCandidateReviewPacket,
  computeReviewBasisFingerprint,
  computeLexiconFingerprint,
  recordAdjudicationDecision,
  preparePromotionPlan,
  executePromotion,
  assertExactSamePromotionPlan,
  validateAdjudicationDecisionIntegrity,
  validatePromotionReceiptIntegrity,
  validatePromotionPlanIntegrity,
  generateDecisionId,
  generatePromotionPlanId,
  generatePromotionReceiptId,
  AdjudicationLedger,
  InvalidAdjudicationDecisionError,
  InvalidPromotionPlanError,
  InvalidPromotionReceiptError,
  StaleReviewBasisError,
  ConflictingHumanDecisionsError,
  StaleLexiconBaseError,
  DecisionAlreadyPromotedError,
  DecisionImmutabilityViolationError,
  ReceiptImmutabilityViolationError,
  CandidateAdjudicationDecision,
  LexiconPromotionPlan,
  PromotionReceipt,
  SerializedAdjudicationStore
} from './index';

function createSyntheticAlignedEvidence(params: {
  id: string;
  persianForm: string;
  observedRomanization: string;
  romanizationScheme?: 'ALA_LC' | 'IJMES';
  entityType?: 'WORD' | 'PERSON' | 'PLACE' | 'ORGANIZATION';
  parentPersian?: string;
  parentRoman?: string;
}): { parent: LexicalEvidence; child: LexicalEvidence } {
  const pForm = params.persianForm;
  const rForm = params.observedRomanization;
  const parentPersian = params.parentPersian ?? pForm;
  const parentRoman = params.parentRoman ?? rForm;

  const parentId = `evi-parent-${params.id}`;
  const parent: LexicalEvidence = {
    id: parentId,
    sourceType: 'LIBRARY_CATALOG',
    sourceRecordId: 'REC-001',
    sourceUri: null,
    sourceField: '100$a',
    persianForm: parentPersian,
    observedRomanization: parentRoman,
    romanizationScheme: params.romanizationScheme ?? 'ALA_LC',
    entityType: params.entityType ?? 'WORD',
    context: null,
    provenance: {
      sourceId: 'LOC',
      retrievalMethod: 'API',
      retrievedAt: '2026-01-01T00:00:00Z'
    },
    status: 'OBSERVED'
  };

  const pStart = parentPersian.indexOf(pForm);
  const rStart = parentRoman.indexOf(rForm);

  const child: LexicalEvidence = {
    id: `evi-child-${params.id}`,
    sourceType: 'LIBRARY_CATALOG',
    sourceRecordId: 'REC-001',
    sourceUri: null,
    sourceField: '100$a',
    persianForm: pForm,
    observedRomanization: rForm,
    romanizationScheme: params.romanizationScheme ?? 'ALA_LC',
    entityType: params.entityType ?? 'WORD',
    context: null,
    provenance: {
      sourceId: 'LOC',
      retrievalMethod: 'API',
      retrievedAt: '2026-01-01T00:00:00Z'
    },
    status: 'OBSERVED',
    derivation: {
      kind: 'ALIGNED_SEGMENT',
      parentEvidenceId: parentId,
      segmentIndex: 0,
      persianSpan: { start: pStart, end: pStart + pForm.length },
      romanizationSpan: { start: rStart, end: rStart + rForm.length },
      alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
      candidateEligibility: 'ELIGIBLE',
      alignerVersion: '1.0.0',
      derivedAt: '2026-01-01T00:00:00Z'
    }
  };

  return { parent, child };
}

function createValidSyntheticContext(idSuffix = 'valid-helper-1') {
  const { parent, child } = createSyntheticAlignedEvidence({
    id: idSuffix,
    persianForm: 'سعدی',
    observedRomanization: 'Saʻdī',
    entityType: 'PERSON'
  });
  const candidate = synthesizeCandidateFromEvidence('سعدی', [child], { entityType: 'PERSON' });
  (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

  const repo = new LexicalEvidenceRepository({
    evidence: [parent, child],
    candidates: [candidate]
  });

  const packet = prepareCandidateReviewPacket(candidate.id, repo);
  const decidedAt = '2026-01-01T00:00:00Z';
  const reviewerRef = 'reviewer@example.edu';
  const disposition = 'ACCEPT' as const;
  const canonicalSelection = {
    kind: 'SELECT_SCHEME_HYPOTHESIS' as const,
    canonical: 'saʿdī'
  };

  const id = generateDecisionId({
    reviewPacketId: packet.id,
    candidateId: candidate.id,
    reviewerRef,
    disposition,
    canonicalSelection,
    decidedAt
  });

  const decision: CandidateAdjudicationDecision = {
    id,
    reviewPacketId: packet.id,
    reviewBasisFingerprint: packet.reviewBasisFingerprint,
    candidateId: candidate.id,
    schemeAnalysisId: packet.schemeAnalysisId,
    disposition,
    canonicalSelection,
    reviewerRef,
    rationale: 'Scholarly acceptance.',
    decidedAt,
    candidateSnapshot: packet.candidateSnapshot,
    schemeAnalysisSnapshot: packet.schemeAnalysisSnapshot,
    decisionVersion: '1.0.0'
  };

  const ledger = new AdjudicationLedger();
  ledger.addDecision(decision);

  return { parent, child, candidate, repo, packet, decision, ledger };
}

function createValidSyntheticDecision(
  overrides?: Partial<CandidateAdjudicationDecision>
): CandidateAdjudicationDecision {
  const ctx = createValidSyntheticContext('valid-helper-1');
  return {
    ...ctx.decision,
    ...overrides
  };
}

function createValidSyntheticReceipt(
  decision: CandidateAdjudicationDecision,
  plan: LexiconPromotionPlan,
  overrides?: Partial<PromotionReceipt>
): PromotionReceipt {
  const promoterRef = 'promoter@example.edu';
  const promotedAt = '2026-01-01T00:00:00Z';
  const promotionVersion = '1.0.0';
  const resultLexiconFingerprint = plan.action === 'ALREADY_PRESENT'
    ? plan.expectedBaseLexiconFingerprint
    : 'lex-result-fp-1';

  const baseParams = {
    decisionId: decision.id,
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
    promoterRef,
    promotedAt,
    promotionVersion
  };

  const id = generatePromotionReceiptId(baseParams);

  return {
    id,
    decisionId: decision.id,
    promotionPlanId: plan.id,
    promotionPlanSnapshot: { ...plan },
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
    promoterRef,
    promotedAt,
    promotionVersion,
    ...overrides
  };
}

describe('Phase 5E: Human Adjudication & Explicit Lexicon Promotion', () => {
  describe('1. Review Packet Preparation & Invariants', () => {
    it('prepares an immutable review packet with deterministic ID and fingerprint', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'sadi-1',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī',
        entityType: 'PERSON'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [child], {
        entityType: 'PERSON'
      });
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet1 = prepareCandidateReviewPacket(candidate.id, repo, {
        preparedAt: '2026-01-01T10:00:00Z'
      });
      const packet2 = prepareCandidateReviewPacket(candidate.id, repo, {
        preparedAt: '2026-02-02T12:00:00Z'
      });

      expect(packet1.id).toBe(packet2.id);
      expect(packet1.reviewBasisFingerprint).toBe(packet2.reviewBasisFingerprint);
      expect(packet1.candidateId).toBe(candidate.id);
      expect(packet1.schemeAnalysisSnapshot.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
      expect(packet1.schemeAnalysisSnapshot.consensusTargetHypothesis).toBe('saʿdī');
      expect(packet1.evidenceIds).toEqual([child.id]);
    });

    it('fails closed when candidate is missing from repository', () => {
      const repo = new LexicalEvidenceRepository();
      expect(() => prepareCandidateReviewPacket('cand-unknown', repo)).toThrow(
        /not found in evidence repository/
      );
    });

    it('changes review-basis fingerprint when candidate or evidence state changes', () => {
      const { parent: p1, child: c1 } = createSyntheticAlignedEvidence({
        id: 'term-1',
        persianForm: 'حافظ',
        observedRomanization: 'Ḥāfiẓ',
        entityType: 'PERSON'
      });

      const cand1 = synthesizeCandidateFromEvidence('حافظ', [c1], { entityType: 'PERSON' });
      (cand1.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo1 = new LexicalEvidenceRepository({
        evidence: [p1, c1],
        candidates: [cand1]
      });
      const packet1 = prepareCandidateReviewPacket(cand1.id, repo1);

      const { parent: p2, child: c2 } = createSyntheticAlignedEvidence({
        id: 'term-2',
        persianForm: 'حافظ',
        observedRomanization: 'Hafiz',
        entityType: 'PERSON'
      });
      const cand2 = synthesizeCandidateFromEvidence('حافظ', [c1, c2], { entityType: 'PERSON' });
      (cand2.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo2 = new LexicalEvidenceRepository({
        evidence: [p1, c1, p2, c2],
        candidates: [cand2]
      });
      const packet2 = prepareCandidateReviewPacket(cand2.id, repo2);

      expect(packet1.reviewBasisFingerprint).not.toBe(packet2.reviewBasisFingerprint);
      expect(packet1.id).not.toBe(packet2.id);
    });
  });

  describe('2. Advisory Consensus & Zero Automatic Authority Invariant', () => {
    it('guarantees UNANIMOUS_DETERMINISTIC consensus alone carries zero authority', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'sadi-2',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī',
        entityType: 'PERSON'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [child], {
        entityType: 'PERSON'
      });
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      const ledger = new AdjudicationLedger();

      expect(packet.schemeAnalysisSnapshot.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
      expect(packet.schemeAnalysisSnapshot.consensusTargetHypothesis).toBe('saʿdī');

      expect(candidate.proposedCanonical).toBeNull();
      expect(candidate.status).toBe('UNREVIEWED');
      expect(ledger.getAllDecisions()).toHaveLength(0);
      expect(ledger.getAllReceipts()).toHaveLength(0);
      expect(DEFAULT_LEXICON_REPOSITORY.findByNormalized('سعدی')).toBeUndefined();
    });
  });

  describe('3. Human Decision Recording & Intrinsic Integrity Validation', () => {
    it('records an explicit ACCEPT decision with SELECT_SCHEME_HYPOTHESIS', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'sadi-3',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī',
        entityType: 'PERSON'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [child], {
        entityType: 'PERSON'
      });
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      const ledger = new AdjudicationLedger();

      const decision = recordAdjudicationDecision(
        {
          reviewPacketId: packet.id,
          reviewBasisFingerprint: packet.reviewBasisFingerprint,
          candidateId: candidate.id,
          disposition: 'ACCEPT',
          canonicalSelection: {
            kind: 'SELECT_SCHEME_HYPOTHESIS',
            canonical: 'saʿdī'
          },
          reviewerRef: 'reviewer-alice@example.edu',
          rationale: 'Confirmed classical poet Saʿdī under standard IJMES.'
        },
        repo,
        ledger
      );

      expect(decision.id).toMatch(/^adj-dec-/);
      expect(decision.disposition).toBe('ACCEPT');
      expect(decision.canonicalSelection?.canonical).toBe('saʿdī');
      expect(decision.reviewerRef).toBe('reviewer-alice@example.edu');
      expect(ledger.getDecisionById(decision.id)).toBeDefined();

      const storedCand = repo.getCandidateById(candidate.id)!;
      expect(storedCand.status).toBe('UNREVIEWED');
      expect(storedCand.proposedCanonical).toBeNull();
    });

    it('rejects ACCEPT if selected scheme hypothesis is not in deterministicTargetHypotheses', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'sadi-4',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī',
        entityType: 'PERSON'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [child], {
        entityType: 'PERSON'
      });
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      const ledger = new AdjudicationLedger();

      expect(() =>
        recordAdjudicationDecision(
          {
            reviewPacketId: packet.id,
            reviewBasisFingerprint: packet.reviewBasisFingerprint,
            candidateId: candidate.id,
            disposition: 'ACCEPT',
            canonicalSelection: {
              kind: 'SELECT_SCHEME_HYPOTHESIS',
              canonical: 'sadi-unlisted'
            },
            reviewerRef: 'reviewer-alice@example.edu',
            rationale: 'Invalid selection test'
          },
          repo,
          ledger
        )
      ).toThrow(InvalidAdjudicationDecisionError);
    });

    it('records an ACCEPT decision with MANUAL_CANONICAL and preserves scholarly Unicode exactly', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'blocked-1',
        persianForm: 'روزنامه',
        observedRomanization: 'Rūznāmah'
      });

      const candidate = synthesizeCandidateFromEvidence('روزنامه', [child]);
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      expect(packet.schemeAnalysisSnapshot.consensusStatus).toBe('BLOCKED');

      const ledger = new AdjudicationLedger();
      const decision = recordAdjudicationDecision(
        {
          reviewPacketId: packet.id,
          reviewBasisFingerprint: packet.reviewBasisFingerprint,
          candidateId: candidate.id,
          disposition: 'ACCEPT',
          canonicalSelection: {
            kind: 'MANUAL_CANONICAL',
            canonical: ' rūznāmah '
          },
          reviewerRef: 'specialist-bob@example.edu',
          rationale: 'Scholarly manual resolution of silent heh for 19th-century periodical entry.'
        },
        repo,
        ledger
      );

      expect(decision.canonicalSelection?.canonical).toBe('rūznāmah');
    });

    it('enforces canonicalSelection = null for REJECT and DEFER', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'rej-1',
        persianForm: 'کلمه',
        observedRomanization: 'Kalimah'
      });

      const candidate = synthesizeCandidateFromEvidence('کلمه', [child]);
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      const ledger = new AdjudicationLedger();

      const rejDecision = recordAdjudicationDecision(
        {
          reviewPacketId: packet.id,
          reviewBasisFingerprint: packet.reviewBasisFingerprint,
          candidateId: candidate.id,
          disposition: 'REJECT',
          reviewerRef: 'reviewer@example.edu',
          rationale: 'Corrupted source observation.'
        },
        repo,
        ledger
      );
      expect(rejDecision.canonicalSelection).toBeNull();

      expect(() =>
        recordAdjudicationDecision(
          {
            reviewPacketId: packet.id,
            reviewBasisFingerprint: packet.reviewBasisFingerprint,
            candidateId: candidate.id,
            disposition: 'REJECT',
            canonicalSelection: {
              kind: 'MANUAL_CANONICAL',
              canonical: 'kalimah'
            },
            reviewerRef: 'reviewer@example.edu',
            rationale: 'Invalid test'
          },
          repo,
          ledger
        )
      ).toThrow(InvalidAdjudicationDecisionError);

      const defDecision = recordAdjudicationDecision(
        {
          reviewPacketId: packet.id,
          reviewBasisFingerprint: packet.reviewBasisFingerprint,
          candidateId: candidate.id,
          disposition: 'DEFER',
          reviewerRef: 'reviewer@example.edu',
          rationale: 'Postponed pending additional dictionary evidence.'
        },
        repo,
        ledger
      );
      expect(defDecision.canonicalSelection).toBeNull();
    });

    it('fails closed when reviewerRef or rationale is empty', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'empty-test-1',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [child]);
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      const ledger = new AdjudicationLedger();

      expect(() =>
        recordAdjudicationDecision(
          {
            reviewPacketId: packet.id,
            reviewBasisFingerprint: packet.reviewBasisFingerprint,
            candidateId: candidate.id,
            disposition: 'ACCEPT',
            canonicalSelection: {
              kind: 'SELECT_SCHEME_HYPOTHESIS',
              canonical: 'saʿdī'
            },
            reviewerRef: '   ',
            rationale: 'Valid rationale'
          },
          repo,
          ledger
        )
      ).toThrow(InvalidAdjudicationDecisionError);

      expect(() =>
        recordAdjudicationDecision(
          {
            reviewPacketId: packet.id,
            reviewBasisFingerprint: packet.reviewBasisFingerprint,
            candidateId: candidate.id,
            disposition: 'ACCEPT',
            canonicalSelection: {
              kind: 'SELECT_SCHEME_HYPOTHESIS',
              canonical: 'saʿdī'
            },
            reviewerRef: 'reviewer@example.edu',
            rationale: '   '
          },
          repo,
          ledger
        )
      ).toThrow(InvalidAdjudicationDecisionError);
    });

    it('fails closed with StaleReviewBasisError when review basis changed before decision recording', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'stale-1',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [child]);
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      const ledger = new AdjudicationLedger();

      expect(() =>
        recordAdjudicationDecision(
          {
            reviewPacketId: packet.id,
            reviewBasisFingerprint: 'rev-basis-stale-fake',
            candidateId: candidate.id,
            disposition: 'ACCEPT',
            canonicalSelection: {
              kind: 'SELECT_SCHEME_HYPOTHESIS',
              canonical: 'saʿdī'
            },
            reviewerRef: 'reviewer@example.edu',
            rationale: 'Rationale'
          },
          repo,
          ledger
        )
      ).toThrow(StaleReviewBasisError);
    });
  });

  describe('4. Adjudication Ledger Immutability, Intrinsic Ingress Validation & Defensive Copies', () => {
    it('is idempotent on identical re-insert and fails closed on altered decision', () => {
      const ledger = new AdjudicationLedger();
      const decision = createValidSyntheticDecision();

      ledger.addDecision(decision);
      expect(() => ledger.addDecision(decision)).not.toThrow();

      const altered = { ...decision, rationale: 'Altered rationale' };
      expect(() => ledger.addDecision(altered)).toThrow(DecisionImmutabilityViolationError);
    });

    it('rejects altered scheme analysis snapshot under the same decision ID', () => {
      const ledger = new AdjudicationLedger();
      const decision = createValidSyntheticDecision();
      ledger.addDecision(decision);

      const alteredSnapshot = {
        ...decision.schemeAnalysisSnapshot,
        deterministicTargetHypotheses: ['tampered-hypothesis']
      };

      const alteredDecision = {
        ...decision,
        schemeAnalysisSnapshot: alteredSnapshot
      };

      expect(() => ledger.addDecision(alteredDecision)).toThrow();
    });

    it('protects stored decisions from caller mutation via defensive cloning', () => {
      const ledger = new AdjudicationLedger();
      const decision = createValidSyntheticDecision();
      ledger.addDecision(decision);

      const retrieved = ledger.getDecisionById(decision.id)!;
      retrieved.rationale = 'Mutated';
      (retrieved.candidateSnapshot as any).persianForm = 'MutatedPersian';

      const fresh = ledger.getDecisionById(decision.id)!;
      expect(fresh.rationale).toBe('Scholarly acceptance.');
      expect(fresh.candidateSnapshot.persianForm).toBe('سعدی');
    });

    it('round-trips serialization and deserialization with integrity validation', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('roundtrip-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);
      const receipt = createValidSyntheticReceipt(decision, plan);
      ledger.addReceipt(receipt);

      const serialized = ledger.serialize();
      const restored = AdjudicationLedger.deserialize(serialized);

      expect(restored.getDecisionById(decision.id)).toBeDefined();
      expect(restored.getReceiptById(receipt.id)).toBeDefined();
      expect(restored.validateIntegrity().valid).toBe(true);
    });
  });

  describe('5. Conflicting Human ACCEPT Decisions Detection', () => {
    it('detects multiple ACCEPT decisions for same review basis with conflicting canonicals and blocks promotion', () => {
      const { parent: p1, child: c1 } = createSyntheticAlignedEvidence({
        id: 'gul-1',
        persianForm: 'گلستان',
        observedRomanization: 'Gulistān'
      });
      const { parent: p2, child: c2 } = createSyntheticAlignedEvidence({
        id: 'gul-2',
        persianForm: 'گلستان',
        observedRomanization: 'Golestān'
      });

      const candidate = synthesizeCandidateFromEvidence('گلستان', [c1, c2]);
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [p1, c1, p2, c2],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      const ledger = new AdjudicationLedger();

      const decA = recordAdjudicationDecision(
        {
          reviewPacketId: packet.id,
          reviewBasisFingerprint: packet.reviewBasisFingerprint,
          candidateId: candidate.id,
          disposition: 'ACCEPT',
          canonicalSelection: {
            kind: 'SELECT_SCHEME_HYPOTHESIS',
            canonical: 'gulistān'
          },
          reviewerRef: 'reviewer-a@example.edu',
          rationale: 'Traditional classical transliteration.',
          decidedAt: '2026-01-01T10:00:00Z'
        },
        repo,
        ledger
      );

      const decB = recordAdjudicationDecision(
        {
          reviewPacketId: packet.id,
          reviewBasisFingerprint: packet.reviewBasisFingerprint,
          candidateId: candidate.id,
          disposition: 'ACCEPT',
          canonicalSelection: {
            kind: 'SELECT_SCHEME_HYPOTHESIS',
            canonical: 'golestān'
          },
          reviewerRef: 'reviewer-b@example.edu',
          rationale: 'Contemporary standard transliteration.',
          decidedAt: '2026-01-01T11:00:00Z'
        },
        repo,
        ledger
      );

      const conflicts = ledger.detectConflictingAcceptDecisions(packet.reviewBasisFingerprint);
      expect(conflicts).toHaveLength(2);

      const isolatedLexicon = new LexiconRepository([]);

      expect(() =>
        preparePromotionPlan(decA.id, repo, ledger, isolatedLexicon)
      ).toThrow(ConflictingHumanDecisionsError);

      expect(() =>
        preparePromotionPlan(decB.id, repo, ledger, isolatedLexicon)
      ).toThrow(ConflictingHumanDecisionsError);
    });
  });

  describe('6. Promotion Planning & Full Semantic Binding', () => {
    it('prepares a promotion plan and binds every semantic field into plan ID', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'plan-1',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī',
        entityType: 'PERSON'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [child], {
        entityType: 'PERSON'
      });
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      const ledger = new AdjudicationLedger();

      const decision = recordAdjudicationDecision(
        {
          reviewPacketId: packet.id,
          reviewBasisFingerprint: packet.reviewBasisFingerprint,
          candidateId: candidate.id,
          disposition: 'ACCEPT',
          canonicalSelection: {
            kind: 'SELECT_SCHEME_HYPOTHESIS',
            canonical: 'saʿdī'
          },
          reviewerRef: 'reviewer@example.edu',
          rationale: 'Accepted classical poet.'
        },
        repo,
        ledger
      );

      const isolatedLexicon = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, isolatedLexicon);

      expect(plan.id).toMatch(/^prom-plan-/);
      expect(plan.action).toBe('CREATE_ENTRY');
      expect(plan.canonical).toBe('saʿdī');
      expect(plan.targetEntryId).toMatch(/^lex:promoted:/);
      expect(plan.targetReadingId).toMatch(/^read:promoted:/);
      expect(plan.expectedBaseLexiconFingerprint).toBe(computeLexiconFingerprint(isolatedLexicon));

      // Test individual field alteration changing plan ID
      const baseParams = {
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
      };

      expect(generatePromotionPlanId({ ...baseParams, canonical: 'forged' })).not.toBe(plan.id);
      expect(generatePromotionPlanId({ ...baseParams, candidateId: 'cand-alt' })).not.toBe(plan.id);
      expect(generatePromotionPlanId({ ...baseParams, normalizedPersian: 'alt' })).not.toBe(plan.id);
      expect(generatePromotionPlanId({ ...baseParams, persianSurface: 'alt' })).not.toBe(plan.id);
      expect(generatePromotionPlanId({ ...baseParams, reviewBasisFingerprint: 'rev-basis-alt' })).not.toBe(plan.id);
      expect(generatePromotionPlanId({ ...baseParams, targetEntryId: 'lex:alt' })).not.toBe(plan.id);
      expect(generatePromotionPlanId({ ...baseParams, targetReadingId: 'read:alt' })).not.toBe(plan.id);
      expect(generatePromotionPlanId({ ...baseParams, action: 'ADD_READING' })).not.toBe(plan.id);
    });

    it('refuses to plan promotion for REJECT or DEFER decisions', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'rej-plan-1',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [child]);
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      const ledger = new AdjudicationLedger();

      const defDecision = recordAdjudicationDecision(
        {
          reviewPacketId: packet.id,
          reviewBasisFingerprint: packet.reviewBasisFingerprint,
          candidateId: candidate.id,
          disposition: 'DEFER',
          reviewerRef: 'reviewer@example.edu',
          rationale: 'Deferred'
        },
        repo,
        ledger
      );

      const isolatedLexicon = new LexiconRepository([]);
      expect(() => preparePromotionPlan(defDecision.id, repo, ledger, isolatedLexicon)).toThrow(
        /Only ACCEPT decisions can be promoted/
      );
    });
  });

  describe('7. Promotion Execution, Complete Plan Equivalence & Stale State Rejections', () => {
    it('executes promotion and produces a new LexiconRepository snapshot without mutating the base repository', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'exec-1',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī',
        entityType: 'PERSON'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [child], {
        entityType: 'PERSON'
      });
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      const ledger = new AdjudicationLedger();

      const decision = recordAdjudicationDecision(
        {
          reviewPacketId: packet.id,
          reviewBasisFingerprint: packet.reviewBasisFingerprint,
          candidateId: candidate.id,
          disposition: 'ACCEPT',
          canonicalSelection: {
            kind: 'SELECT_SCHEME_HYPOTHESIS',
            canonical: 'saʿdī'
          },
          reviewerRef: 'reviewer-alice@example.edu',
          rationale: 'Accepted classical poet.'
        },
        repo,
        ledger
      );

      const initialLexicon = new LexiconRepository([]);
      const baseFpBefore = computeLexiconFingerprint(initialLexicon);

      const plan = preparePromotionPlan(decision.id, repo, ledger, initialLexicon);
      const result = executePromotion(plan, repo, ledger, initialLexicon, {
        promoterRef: 'promoter-carol@example.edu',
        promoterDisplayName: 'Carol Scholarly Curator',
        promotedAt: '2026-01-01T15:00:00Z'
      });

      expect(initialLexicon.getAllEntries()).toHaveLength(0);
      expect(computeLexiconFingerprint(initialLexicon)).toBe(baseFpBefore);
      expect(DEFAULT_LEXICON_REPOSITORY.findByNormalized('سعدی')).toBeUndefined();

      const newRepo = result.repository;
      expect(newRepo.getAllEntries()).toHaveLength(1);
      const entry = newRepo.findByNormalized('سعدی')!;
      expect(entry).toBeDefined();
      expect(entry.surface).toBe('سعدی');
      expect(entry.category).toBe('proper-noun');
      expect(entry.properName?.type).toBe('PERSON');
      expect(entry.readings).toHaveLength(1);

      const reading = entry.readings[0];
      expect(reading.canonical).toBe('saʿdī');
      expect(reading.confidence).toBe(1.0);
      expect(reading.source).toBe('Phase 5E human-adjudicated lexical promotion');
      expect(reading.sources?.[0].type).toBe('REVIEWED_PROJECT_ENTRY');
      expect(reading.sources?.[0].reference).toContain(`decision=${decision.id}`);

      const receipt = result.receipt;
      expect(receipt.id).toMatch(/^prom-rcpt-/);
      expect(receipt.decisionId).toBe(decision.id);
      expect(receipt.promotionPlanId).toBe(plan.id);
      expect(receipt.canonical).toBe('saʿdī');
      expect(receipt.action).toBe('CREATE_ENTRY');
      expect(receipt.promoterRef).toBe('promoter-carol@example.edu');
      expect(ledger.getReceiptById(receipt.id)).toBeDefined();
    });

    it('rejects promotion if plan canonical was tampered with (assertExactSamePromotionPlan)', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'tamper-1',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī',
        entityType: 'PERSON'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [child], {
        entityType: 'PERSON'
      });
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      const ledger = new AdjudicationLedger();

      const decision = recordAdjudicationDecision(
        {
          reviewPacketId: packet.id,
          reviewBasisFingerprint: packet.reviewBasisFingerprint,
          candidateId: candidate.id,
          disposition: 'ACCEPT',
          canonicalSelection: {
            kind: 'SELECT_SCHEME_HYPOTHESIS',
            canonical: 'saʿdī'
          },
          reviewerRef: 'reviewer@example.edu',
          rationale: 'Accepted'
        },
        repo,
        ledger
      );

      const initialLexicon = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, initialLexicon);

      const tamperedPlan = {
        ...plan,
        canonical: 'forged-canonical'
      };

      expect(() =>
        executePromotion(tamperedPlan, repo, ledger, initialLexicon, {
          promoterRef: 'promoter@example.edu'
        })
      ).toThrow(InvalidPromotionPlanError);

      expect(ledger.getAllReceipts()).toHaveLength(0);
      expect(initialLexicon.getAllEntries()).toHaveLength(0);
    });

    it('fails closed when executing promotion against a modified base lexicon (StaleLexiconBaseError)', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'stale-lex-1',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī',
        entityType: 'PERSON'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [child], {
        entityType: 'PERSON'
      });
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      const ledger = new AdjudicationLedger();

      const decision = recordAdjudicationDecision(
        {
          reviewPacketId: packet.id,
          reviewBasisFingerprint: packet.reviewBasisFingerprint,
          candidateId: candidate.id,
          disposition: 'ACCEPT',
          canonicalSelection: {
            kind: 'SELECT_SCHEME_HYPOTHESIS',
            canonical: 'saʿdī'
          },
          reviewerRef: 'reviewer@example.edu',
          rationale: 'Accepted'
        },
        repo,
        ledger
      );

      const baseLexicon = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, baseLexicon);

      const alteredLexicon = new LexiconRepository([
        {
          id: 'lex:test',
          surface: 'کتاب',
          normalized: 'کتاب',
          readings: [{ canonical: 'kitāb', confidence: 1.0, source: 'Test' }]
        }
      ]);

      expect(() =>
        executePromotion(plan, repo, ledger, alteredLexicon, {
          promoterRef: 'promoter@example.edu'
        })
      ).toThrow(StaleLexiconBaseError);
    });

    it('prevents double promotion of the same decision (fail-closed)', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'double-prom-1',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī',
        entityType: 'PERSON'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [child], {
        entityType: 'PERSON'
      });
      (candidate.derivationProvenance as any).strategy = 'ALIGNED_SEGMENT_SYNTHESIS';

      const repo = new LexicalEvidenceRepository({
        evidence: [parent, child],
        candidates: [candidate]
      });

      const packet = prepareCandidateReviewPacket(candidate.id, repo);
      const ledger = new AdjudicationLedger();

      const decision = recordAdjudicationDecision(
        {
          reviewPacketId: packet.id,
          reviewBasisFingerprint: packet.reviewBasisFingerprint,
          candidateId: candidate.id,
          disposition: 'ACCEPT',
          canonicalSelection: {
            kind: 'SELECT_SCHEME_HYPOTHESIS',
            canonical: 'saʿdī'
          },
          reviewerRef: 'reviewer@example.edu',
          rationale: 'Accepted'
        },
        repo,
        ledger
      );

      const isolatedLexicon = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, isolatedLexicon);
      executePromotion(plan, repo, ledger, isolatedLexicon, {
        promoterRef: 'promoter@example.edu'
      });

      expect(() =>
        preparePromotionPlan(decision.id, repo, ledger, isolatedLexicon)
      ).toThrow(DecisionAlreadyPromotedError);

      expect(() =>
        executePromotion(plan, repo, ledger, isolatedLexicon, {
          promoterRef: 'promoter@example.edu'
        })
      ).toThrow(DecisionAlreadyPromotedError);
    });
  });

  describe('8. Explicit Attack Vectors (Section 18 Security Gates)', () => {
    it('Attack A: rejects promotion canonical substitution', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-a-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);

      const forgedPlan = { ...plan, canonical: 'forged' };
      expect(() => executePromotion(forgedPlan, repo, ledger, lex, { promoterRef: 'prom@example.edu' })).toThrow(
        /Canonical substitution detected|Plan canonical mismatch/
      );
    });

    it('Attack B: rejects promotion Persian identity substitution', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-b-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);

      const forgedPlan1 = { ...plan, normalizedPersian: 'forged' };
      expect(() => executePromotion(forgedPlan1, repo, ledger, lex, { promoterRef: 'prom@example.edu' })).toThrow();

      const forgedPlan2 = { ...plan, persianSurface: 'forged' };
      expect(() => executePromotion(forgedPlan2, repo, ledger, lex, { promoterRef: 'prom@example.edu' })).toThrow();
    });

    it('Attack C: rejects promotion candidateId substitution', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-c-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);

      const forgedPlan = { ...plan, candidateId: 'cand-forged' };
      expect(() => executePromotion(forgedPlan, repo, ledger, lex, { promoterRef: 'prom@example.edu' })).toThrow();
    });

    it('Attack D: rejects promotion reviewBasisFingerprint substitution', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-d-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);

      const forgedPlan = { ...plan, reviewBasisFingerprint: 'rev-basis-forged' };
      expect(() => executePromotion(forgedPlan, repo, ledger, lex, { promoterRef: 'prom@example.edu' })).toThrow();
    });

    it('Attack E: rejects forged ledger decision ID', () => {
      const decision = createValidSyntheticDecision();
      const forged = { ...decision, id: 'adj-dec-forged-fake-id' };
      const ledger = new AdjudicationLedger();
      expect(() => ledger.addDecision(forged)).toThrow(InvalidAdjudicationDecisionError);
    });

    it('Attack F: rejects forged decision fingerprint where snapshot does not hash to declared fingerprint', () => {
      const decision = createValidSyntheticDecision();
      const forged = { ...decision, reviewBasisFingerprint: 'rev-basis-forged-fingerprint' };
      const ledger = new AdjudicationLedger();
      expect(() => ledger.addDecision(forged)).toThrow(InvalidAdjudicationDecisionError);
    });

    it('Attack G: rejects forged scheme-analysis snapshot under existing decision ID', () => {
      const decision = createValidSyntheticDecision();
      const ledger = new AdjudicationLedger();
      ledger.addDecision(decision);

      const alteredSnapshot = {
        ...decision.schemeAnalysisSnapshot,
        deterministicTargetHypotheses: ['unauthorized-hypothesis']
      };
      const alteredDecision = { ...decision, schemeAnalysisSnapshot: alteredSnapshot };

      expect(() => ledger.addDecision(alteredDecision)).toThrow();
    });

    it('Attack H: rejects ACCEPT with invalid SELECT_SCHEME_HYPOTHESIS at ledger insertion', () => {
      const decision = createValidSyntheticDecision();
      const forged = {
        ...decision,
        canonicalSelection: {
          kind: 'SELECT_SCHEME_HYPOTHESIS' as const,
          canonical: 'not-in-hypotheses'
        }
      };
      const ledger = new AdjudicationLedger();
      expect(() => ledger.addDecision(forged)).toThrow(InvalidAdjudicationDecisionError);
    });

    it('Attack I: rejects ACCEPT with structurally invalid MANUAL_CANONICAL at ledger insertion', () => {
      const decision = createValidSyntheticDecision();
      const forged = {
        ...decision,
        canonicalSelection: {
          kind: 'MANUAL_CANONICAL' as const,
          canonical: 'سعدی' // Arabic script not allowed in manual canonical
        }
      };
      const ledger = new AdjudicationLedger();
      expect(() => ledger.addDecision(forged)).toThrow(InvalidAdjudicationDecisionError);
    });

    it('Attack J: rejects REJECT / DEFER with canonical selection at ledger insertion', () => {
      const decision = createValidSyntheticDecision();
      const forgedReject = {
        ...decision,
        disposition: 'REJECT' as const,
        canonicalSelection: { kind: 'MANUAL_CANONICAL' as const, canonical: 'test' }
      };
      const ledger = new AdjudicationLedger();
      expect(() => ledger.addDecision(forgedReject)).toThrow(InvalidAdjudicationDecisionError);

      const forgedDefer = {
        ...decision,
        disposition: 'DEFER' as const,
        canonicalSelection: { kind: 'MANUAL_CANONICAL' as const, canonical: 'test' }
      };
      expect(() => ledger.addDecision(forgedDefer)).toThrow(InvalidAdjudicationDecisionError);
    });

    it('Attack K: rejects orphan receipt insertion immediately', () => {
      const { decision, repo } = createValidSyntheticContext('atk-k-1');
      const lex = new LexiconRepository([]);
      const dummyLedger = new AdjudicationLedger();
      dummyLedger.addDecision(decision);
      const plan = preparePromotionPlan(decision.id, repo, dummyLedger, lex);

      const orphanReceipt = createValidSyntheticReceipt(decision, plan, {
        decisionId: 'adj-dec-non-existent'
      });

      const emptyLedger = new AdjudicationLedger();
      expect(() => emptyLedger.addReceipt(orphanReceipt)).toThrow(InvalidPromotionReceiptError);
    });

    it('Attack L: rejects receipt referencing REJECT/DEFER decision', () => {
      const { decision: validDecision, repo, ledger } = createValidSyntheticContext('atk-l-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(validDecision.id, repo, ledger, lex);

      const deferId = generateDecisionId({
        reviewPacketId: validDecision.reviewPacketId,
        candidateId: validDecision.candidateId,
        reviewerRef: validDecision.reviewerRef,
        disposition: 'DEFER',
        canonicalSelection: null,
        decidedAt: validDecision.decidedAt
      });

      const deferDecision: CandidateAdjudicationDecision = {
        ...validDecision,
        id: deferId,
        disposition: 'DEFER',
        canonicalSelection: null
      };

      const deferLedger = new AdjudicationLedger();
      deferLedger.addDecision(deferDecision);

      const receipt = createValidSyntheticReceipt(
        validDecision,
        plan,
        { decisionId: deferDecision.id }
      );

      expect(() => deferLedger.addReceipt(receipt)).toThrow(InvalidPromotionReceiptError);
    });

    it('Attack M: rejects forged receipt ID at insertion', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-m-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);
      const validReceipt = createValidSyntheticReceipt(decision, plan);

      const forged = { ...validReceipt, id: 'prom-rcpt-forged-fake-id' };
      expect(() => ledger.addReceipt(forged)).toThrow(InvalidPromotionReceiptError);
    });

    it('Attack N: rejects receipt canonical mismatch with decision', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-n-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);
      const receipt = createValidSyntheticReceipt(decision, plan, {
        canonical: 'mismatched-canonical'
      });

      expect(() => ledger.addReceipt(receipt)).toThrow(InvalidPromotionReceiptError);
    });

    it('Attack O: rejects deserialization of malformed authority store', () => {
      const decision = createValidSyntheticDecision();
      const malformedStore: SerializedAdjudicationStore = {
        version: 1,
        decisions: [{ ...decision, id: 'forged-id' }],
        receipts: []
      };

      expect(() => AdjudicationLedger.deserialize(malformedStore)).toThrow();
    });

    it('Attack P: rejects forged promotionPlanId in receipt', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-p-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);
      const receipt = createValidSyntheticReceipt(decision, plan, {
        promotionPlanId: 'prom-plan-forged-fake'
      });

      expect(() => ledger.addReceipt(receipt)).toThrow(InvalidPromotionReceiptError);
    });

    it('Attack Q: rejects tampered receipt action differing from plan snapshot', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-q-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);
      expect(plan.action).toBe('CREATE_ENTRY');

      const receipt = createValidSyntheticReceipt(decision, plan, {
        action: 'ADD_READING'
      });

      expect(() => ledger.addReceipt(receipt)).toThrow(InvalidPromotionReceiptError);
    });

    it('Attack R: rejects tampered lexical entry ID differing from plan snapshot', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-r-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);

      const receipt = createValidSyntheticReceipt(decision, plan, {
        lexiconEntryId: 'lex:promoted:tampered-entry-id'
      });

      expect(() => ledger.addReceipt(receipt)).toThrow(InvalidPromotionReceiptError);
    });

    it('Attack S: rejects tampered lexical reading ID differing from plan snapshot', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-s-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);

      const receipt = createValidSyntheticReceipt(decision, plan, {
        lexicalReadingId: 'read:promoted:tampered-reading-id'
      });

      expect(() => ledger.addReceipt(receipt)).toThrow(InvalidPromotionReceiptError);
    });

    it('Attack T: rejects tampered result lexicon fingerprint and ALREADY_PRESENT divergence', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-t-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);

      // 1. Result fingerprint tampered
      const receipt = createValidSyntheticReceipt(decision, plan, {
        resultLexiconFingerprint: 'lex-tampered-fp'
      });
      expect(() => ledger.addReceipt(receipt)).toThrow(InvalidPromotionReceiptError);

      // 2. ALREADY_PRESENT requires resultLexiconFingerprint === baseLexiconFingerprint
      const alreadyPresentPlan = { ...plan, action: 'ALREADY_PRESENT' as const };
      alreadyPresentPlan.id = generatePromotionPlanId(alreadyPresentPlan);
      const invalidAlreadyPresentReceipt = createValidSyntheticReceipt(decision, alreadyPresentPlan, {
        baseLexiconFingerprint: 'lex-base-fp-1',
        resultLexiconFingerprint: 'lex-different-result-fp-2'
      });
      expect(() => ledger.addReceipt(invalidAlreadyPresentReceipt)).toThrow(InvalidPromotionReceiptError);
    });

    it('Attack U: rejects tampered canonical across plan/receipt/decision chain', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-u-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);

      const tamperedPlan = { ...plan, canonical: 'tampered-canonical' };
      const receipt = createValidSyntheticReceipt(decision, tamperedPlan);

      expect(() => ledger.addReceipt(receipt)).toThrow(
        /Plan ID.*does not match|Plan ID mismatch|does not match decision canonical|Canonical substitution|Plan identity tampering detected/
      );
    });

    it('Attack V: rejects altered promotion-plan snapshot under same receipt ID (ReceiptImmutabilityViolationError)', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-v-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);

      const receipt1 = createValidSyntheticReceipt(decision, plan);
      ledger.addReceipt(receipt1);

      // Re-inserting identical receipt is idempotent
      expect(() => ledger.addReceipt(receipt1)).not.toThrow();

      // Re-inserting with altered plan snapshot fails
      const alteredSnapshot = { ...plan, canonical: 'tampered-canonical' };
      const alteredReceipt = { ...receipt1, promotionPlanSnapshot: alteredSnapshot };
      expect(() => ledger.addReceipt(alteredReceipt)).toThrow();
    });

    it('Attack W: fails closed on deserialization of forged plan/receipt chain', () => {
      const { decision, repo, ledger } = createValidSyntheticContext('atk-w-1');
      const lex = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, lex);
      const validReceipt = createValidSyntheticReceipt(decision, plan);

      // Valid store deserializes cleanly
      const validStore: SerializedAdjudicationStore = {
        version: 1,
        decisions: [decision],
        receipts: [validReceipt]
      };
      expect(() => AdjudicationLedger.deserialize(validStore)).not.toThrow();

      // Forged plan ID in receipt snapshot
      const forgedStore1: SerializedAdjudicationStore = {
        version: 1,
        decisions: [decision],
        receipts: [
          {
            ...validReceipt,
            promotionPlanSnapshot: { ...plan, id: 'prom-plan-forged' }
          }
        ]
      };
      expect(() => AdjudicationLedger.deserialize(forgedStore1)).toThrow();

      // Tampered action in receipt
      const forgedStore2: SerializedAdjudicationStore = {
        version: 1,
        decisions: [decision],
        receipts: [{ ...validReceipt, action: 'ADD_READING' }]
      };
      expect(() => AdjudicationLedger.deserialize(forgedStore2)).toThrow();

      // Tampered result fingerprint in receipt
      const forgedStore3: SerializedAdjudicationStore = {
        version: 1,
        decisions: [decision],
        receipts: [{ ...validReceipt, resultLexiconFingerprint: 'tampered-fp' }]
      };
      expect(() => AdjudicationLedger.deserialize(forgedStore3)).toThrow();
    });
  });

  describe('9. Genuine Fixture Review Packets (LoC Regressions)', () => {
    const fixtureLccns = ['2016404617', '2002341405', '2025364468'];

    it('generates review packets for genuine Library of Congress candidate fixtures', () => {
      let totalCandidates = 0;
      let unanimousCount = 0;
      let blockedCount = 0;
      const ledger = new AdjudicationLedger();

      for (const lccn of fixtureLccns) {
        const fixturePath = path.join(
          __dirname,
          '../loc/fixtures',
          `${lccn}.marcxml.xml`
        );
        const xml = fs.readFileSync(fixturePath, 'utf8');
        const records = parseMarcXml(xml);
        const parentEvidence: LexicalEvidence[] = [];
        for (const rec of records) {
          const evis = extractEvidenceFromMarcRecord(rec, {
            now: () => '2026-01-01T00:00:00Z'
          });
          parentEvidence.push(...evis);
        }

        const batchResult = processEvidenceAlignmentBatch(parentEvidence);
        totalCandidates += batchResult.candidates.length;

        const evidenceRepo = new LexicalEvidenceRepository({
          evidence: [...parentEvidence, ...batchResult.derivedEvidence],
          candidates: batchResult.candidates
        });

        for (const cand of batchResult.candidates) {
          const packet = prepareCandidateReviewPacket(cand.id, evidenceRepo);
          expect(packet.id).toMatch(/^rev-packet-/);
          expect(packet.reviewBasisFingerprint).toMatch(/^rev-basis-/);

          if (packet.schemeAnalysisSnapshot.consensusStatus === 'UNANIMOUS_DETERMINISTIC') {
            unanimousCount++;
          } else if (packet.schemeAnalysisSnapshot.consensusStatus === 'BLOCKED') {
            blockedCount++;
          }

          expect(cand.status).toBe('UNREVIEWED');
          expect(cand.proposedCanonical).toBeNull();
        }
      }

      expect(totalCandidates).toBe(23);
      expect(unanimousCount).toBe(21);
      expect(blockedCount).toBe(2);

      expect(ledger.getAllDecisions()).toHaveLength(0);
      expect(ledger.getAllReceipts()).toHaveLength(0);
    });
  });
});
