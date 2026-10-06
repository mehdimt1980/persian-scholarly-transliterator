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
  computeLexiconFingerprint,
  recordAdjudicationDecision,
  preparePromotionPlan,
  executePromotion,
  AdjudicationLedger,
  InvalidAdjudicationDecisionError,
  StaleReviewBasisError,
  ConflictingHumanDecisionsError,
  StaleLexiconBaseError,
  DecisionAlreadyPromotedError,
  DecisionImmutabilityViolationError,
  ReceiptImmutabilityViolationError,
  CandidateAdjudicationDecision,
  PromotionReceipt
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
      // Set ALIGNED_SEGMENT_SYNTHESIS strategy required by Phase 5D
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

      // Modified observation (variant)
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

      // Invariants:
      expect(candidate.proposedCanonical).toBeNull();
      expect(candidate.status).toBe('UNREVIEWED');
      expect(ledger.getAllDecisions()).toHaveLength(0);
      expect(ledger.getAllReceipts()).toHaveLength(0);
      expect(DEFAULT_LEXICON_REPOSITORY.findByNormalized('سعدی')).toBeUndefined();
    });
  });

  describe('3. Human Decision Recording & Validation', () => {
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

      // Candidate remains unmutated
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
            canonical: ' rūznāmah ' // test safe trimming
          },
          reviewerRef: 'specialist-bob@example.edu',
          rationale: 'Scholarly manual resolution of silent heh for 19th-century periodical entry.'
        },
        repo,
        ledger
      );

      expect(decision.canonicalSelection?.canonical).toBe('rūznāmah');
    });

    it('rejects MANUAL_CANONICAL containing Arabic script or control characters', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'manual-val-1',
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
      const ledger = new AdjudicationLedger();

      expect(() =>
        recordAdjudicationDecision(
          {
            reviewPacketId: packet.id,
            reviewBasisFingerprint: packet.reviewBasisFingerprint,
            candidateId: candidate.id,
            disposition: 'ACCEPT',
            canonicalSelection: {
              kind: 'MANUAL_CANONICAL',
              canonical: 'روزنامه' // invalid: Arabic script
            },
            reviewerRef: 'reviewer@example.edu',
            rationale: 'Invalid test'
          },
          repo,
          ledger
        )
      ).toThrow(InvalidAdjudicationDecisionError);
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

      // Valid REJECT
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

      // Invalid REJECT with canonical
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

      // Valid DEFER
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

      // Caller attempts to pass an altered fingerprint
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

  describe('4. Adjudication Ledger Immutability & Defensive Copies', () => {
    it('is idempotent on identical re-insert and fails closed on altered decision', () => {
      const ledger = new AdjudicationLedger();
      const decision: CandidateAdjudicationDecision = {
        id: 'adj-dec-test1',
        reviewPacketId: 'rev-packet-1',
        reviewBasisFingerprint: 'rev-basis-1',
        candidateId: 'cand-1',
        schemeAnalysisId: 'analysis-1',
        disposition: 'ACCEPT',
        canonicalSelection: { kind: 'SELECT_SCHEME_HYPOTHESIS', canonical: 'test' },
        reviewerRef: 'reviewer@example.edu',
        rationale: 'Rationale',
        decidedAt: '2026-01-01T00:00:00Z',
        candidateSnapshot: {} as any,
        schemeAnalysisSnapshot: {} as any,
        decisionVersion: '1.0.0'
      };

      ledger.addDecision(decision);
      // Re-insert identical
      expect(() => ledger.addDecision(decision)).not.toThrow();

      // Altered insert
      const altered = { ...decision, rationale: 'Altered rationale' };
      expect(() => ledger.addDecision(altered)).toThrow(DecisionImmutabilityViolationError);

      // Receipts
      const receipt: PromotionReceipt = {
        id: 'prom-rcpt-test1',
        decisionId: decision.id,
        reviewPacketId: decision.reviewPacketId,
        reviewBasisFingerprint: decision.reviewBasisFingerprint,
        candidateId: decision.candidateId,
        schemeAnalysisId: decision.schemeAnalysisId,
        canonical: 'test',
        action: 'CREATE_ENTRY',
        lexiconEntryId: 'lex:promoted:1',
        lexicalReadingId: 'read:promoted:1',
        baseLexiconFingerprint: 'lex-fp-1',
        resultLexiconFingerprint: 'lex-fp-2',
        promoterRef: 'promoter@example.edu',
        promotedAt: '2026-01-01T00:00:00Z',
        promotionVersion: '1.0.0'
      };
      ledger.addReceipt(receipt);
      expect(() => ledger.addReceipt(receipt)).not.toThrow();

      const alteredReceipt = { ...receipt, canonical: 'altered-canonical' };
      expect(() => ledger.addReceipt(alteredReceipt)).toThrow(ReceiptImmutabilityViolationError);
    });

    it('protects stored decisions from caller mutation via defensive cloning', () => {
      const ledger = new AdjudicationLedger();
      const decision: CandidateAdjudicationDecision = {
        id: 'adj-dec-test2',
        reviewPacketId: 'rev-packet-2',
        reviewBasisFingerprint: 'rev-basis-2',
        candidateId: 'cand-2',
        schemeAnalysisId: 'analysis-2',
        disposition: 'ACCEPT',
        canonicalSelection: { kind: 'SELECT_SCHEME_HYPOTHESIS', canonical: 'test' },
        reviewerRef: 'reviewer@example.edu',
        rationale: 'Rationale',
        decidedAt: '2026-01-01T00:00:00Z',
        candidateSnapshot: { id: 'cand-2', persianForm: 'تست' } as any,
        schemeAnalysisSnapshot: {} as any,
        decisionVersion: '1.0.0'
      };

      ledger.addDecision(decision);

      // Caller mutates retrieved decision
      const retrieved = ledger.getDecisionById('adj-dec-test2')!;
      retrieved.rationale = 'Mutated';
      (retrieved.candidateSnapshot as any).persianForm = 'MutatedPersian';

      const fresh = ledger.getDecisionById('adj-dec-test2')!;
      expect(fresh.rationale).toBe('Rationale');
      expect(fresh.candidateSnapshot.persianForm).toBe('تست');
    });

    it('round-trips serialization and deserialization with integrity validation', () => {
      const ledger = new AdjudicationLedger();
      const decision: CandidateAdjudicationDecision = {
        id: 'adj-dec-test3',
        reviewPacketId: 'rev-packet-3',
        reviewBasisFingerprint: 'rev-basis-3',
        candidateId: 'cand-3',
        schemeAnalysisId: 'analysis-3',
        disposition: 'ACCEPT',
        canonicalSelection: { kind: 'SELECT_SCHEME_HYPOTHESIS', canonical: 'test' },
        reviewerRef: 'reviewer@example.edu',
        rationale: 'Rationale',
        decidedAt: '2026-01-01T00:00:00Z',
        candidateSnapshot: {} as any,
        schemeAnalysisSnapshot: {} as any,
        decisionVersion: '1.0.0'
      };
      ledger.addDecision(decision);

      const serialized = ledger.serialize();
      const restored = AdjudicationLedger.deserialize(serialized);

      expect(restored.getDecisionById('adj-dec-test3')).toBeDefined();
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

      // Reviewer A accepts gulistān
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

      // Reviewer B accepts golestān
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

      // Promotion preparation fails closed
      expect(() =>
        preparePromotionPlan(decA.id, repo, ledger, isolatedLexicon)
      ).toThrow(ConflictingHumanDecisionsError);

      expect(() =>
        preparePromotionPlan(decB.id, repo, ledger, isolatedLexicon)
      ).toThrow(ConflictingHumanDecisionsError);
    });
  });

  describe('6. Promotion Planning & Stale-State Protection', () => {
    it('prepares a promotion plan with CREATE_ENTRY action for a new lexical entry', () => {
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

      // Mutate lexicon state by creating a different base repository
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
  });

  describe('7. Promotion Execution, Snapshot Isolation & Provenance', () => {
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

      // 1. Initial repository is completely unchanged
      expect(initialLexicon.getAllEntries()).toHaveLength(0);
      expect(computeLexiconFingerprint(initialLexicon)).toBe(baseFpBefore);
      expect(DEFAULT_LEXICON_REPOSITORY.findByNormalized('سعدی')).toBeUndefined();

      // 2. New repository contains promoted entry and reading
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

      // 3. Receipt recorded in ledger
      const receipt = result.receipt;
      expect(receipt.id).toMatch(/^prom-rcpt-/);
      expect(receipt.decisionId).toBe(decision.id);
      expect(receipt.canonical).toBe('saʿdī');
      expect(receipt.action).toBe('CREATE_ENTRY');
      expect(receipt.promoterRef).toBe('promoter-carol@example.edu');
      expect(ledger.getReceiptById(receipt.id)).toBeDefined();
    });

    it('handles ADD_READING when entry exists and preserves existing readings', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'add-read-1',
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

      // Existing lexicon with a different reading
      const existingLexicon = new LexiconRepository([
        {
          id: 'lex:sadi:existing',
          surface: 'سعدی',
          normalized: 'سعدی',
          category: 'proper-noun',
          properName: { type: 'PERSON' },
          readings: [
            {
              id: 'read:existing:1',
              canonical: 'saʻdī-archaic',
              confidence: 1.0,
              source: 'Historical Lexicon'
            }
          ]
        }
      ]);

      const plan = preparePromotionPlan(decision.id, repo, ledger, existingLexicon);
      expect(plan.action).toBe('ADD_READING');

      const result = executePromotion(plan, repo, ledger, existingLexicon, {
        promoterRef: 'promoter@example.edu'
      });

      const promotedEntry = result.repository.findByNormalized('سعدی')!;
      expect(promotedEntry.readings).toHaveLength(2);
      expect(promotedEntry.readings.map((r) => r.canonical)).toEqual([
        'saʻdī-archaic',
        'saʿdī'
      ]);
    });

    it('handles ALREADY_PRESENT when exact reading already exists without duplicating', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'already-1',
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

      // Existing lexicon already having saʿdī
      const existingLexicon = new LexiconRepository([
        {
          id: 'lex:sadi:existing',
          surface: 'سعدی',
          normalized: 'سعدی',
          category: 'proper-noun',
          properName: { type: 'PERSON' },
          readings: [
            {
              id: 'read:existing:sadi',
              canonical: 'saʿdī',
              confidence: 1.0,
              source: 'Existing Authority'
            }
          ]
        }
      ]);

      const plan = preparePromotionPlan(decision.id, repo, ledger, existingLexicon);
      expect(plan.action).toBe('ALREADY_PRESENT');

      const result = executePromotion(plan, repo, ledger, existingLexicon, {
        promoterRef: 'promoter@example.edu'
      });

      expect(result.receipt.action).toBe('ALREADY_PRESENT');
      const promotedEntry = result.repository.findByNormalized('سعدی')!;
      expect(promotedEntry.readings).toHaveLength(1);
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

      // Second promotion attempt must fail closed
      expect(() =>
        preparePromotionPlan(decision.id, repo, ledger, isolatedLexicon)
      ).toThrow(DecisionAlreadyPromotedError);

      expect(() =>
        executePromotion(plan, repo, ledger, isolatedLexicon, {
          promoterRef: 'promoter@example.edu'
        })
      ).toThrow(DecisionAlreadyPromotedError);
    });

    it('conservatively maps entity types and leaves general words category undefined', () => {
      const { parent, child } = createSyntheticAlignedEvidence({
        id: 'word-cat-1',
        persianForm: 'کتاب',
        observedRomanization: 'Kitāb',
        entityType: 'WORD'
      });

      const candidate = synthesizeCandidateFromEvidence('کتاب', [child], {
        entityType: 'WORD'
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
            canonical: 'kitāb'
          },
          reviewerRef: 'reviewer@example.edu',
          rationale: 'Standard noun.'
        },
        repo,
        ledger
      );

      const isolatedLexicon = new LexiconRepository([]);
      const plan = preparePromotionPlan(decision.id, repo, ledger, isolatedLexicon);
      const result = executePromotion(plan, repo, ledger, isolatedLexicon, {
        promoterRef: 'promoter@example.edu'
      });

      const entry = result.repository.findByNormalized('کتاب')!;
      expect(entry.category).toBeUndefined();
      expect(entry.properName).toBeUndefined();
    });
  });

  describe('8. Genuine Fixture Review Packets (LoC Regressions)', () => {
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

          // Verify candidate remains untouched
          expect(cand.status).toBe('UNREVIEWED');
          expect(cand.proposedCanonical).toBeNull();
        }
      }

      expect(totalCandidates).toBe(23);
      expect(unanimousCount).toBe(21);
      expect(blockedCount).toBe(2);

      // Pre-adjudication invariants:
      expect(ledger.getAllDecisions()).toHaveLength(0);
      expect(ledger.getAllReceipts()).toHaveLength(0);
    });
  });
});
