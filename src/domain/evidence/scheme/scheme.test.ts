import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateEvidenceId, synthesizeCandidateFromEvidence } from '../candidate';
import { extractEvidenceFromMarcRecord } from '../loc/extractor';
import { parseMarcXml } from '../loc/xmlParser';
import { processEvidenceAlignmentBatch } from '../alignment/batchOrchestrator';
import { LexicalEvidence } from '../types';
import {
  analyzeCandidateSchemeEvidence,
  auditIjmesRuntimePolicy,
  generateCandidateAnalysisId,
  generateInterpretationId,
  getAllSchemeRules,
  getSchemeRule,
  interpretEvidenceScheme,
  SCHEME_INTERPRETER_VERSION,
  SCHEME_RULESET_VERSION
} from './index';

describe('Phase 5D: Scheme-Aware Evidence Aggregation', () => {
  const createTestEvidence = (overrides?: Partial<LexicalEvidence>): LexicalEvidence => {
    const persianForm = overrides?.persianForm ?? 'گلستان';
    const observedRomanization =
      overrides?.observedRomanization !== undefined ? overrides.observedRomanization : 'Gulistān';
    const sourceId = overrides?.provenance?.sourceId ?? 'LOC';
    const sourceRecordId = overrides?.sourceRecordId !== undefined ? overrides.sourceRecordId : '2016404617';
    const sourceField = overrides?.sourceField !== undefined ? overrides.sourceField : '245$a';
    const romanizationScheme = overrides?.romanizationScheme ?? 'ALA_LC';

    const id = generateEvidenceId({
      sourceId,
      sourceRecordId,
      sourceField,
      persianForm,
      observedRomanization,
      romanizationScheme,
      derivation: overrides?.derivation
    });

    return {
      id,
      sourceType: overrides?.sourceType ?? 'LIBRARY_CATALOG',
      sourceRecordId,
      sourceUri: sourceRecordId ? `https://lccn.loc.gov/${sourceRecordId}` : null,
      sourceField,
      persianForm,
      observedRomanization,
      romanizationScheme,
      entityType: overrides?.entityType ?? 'WORD',
      context: overrides?.context !== undefined ? overrides.context : 'Test context',
      provenance: {
        sourceId,
        sourceTitle: 'Library of Congress Online Catalog',
        sourceOrganization: 'Library of Congress',
        retrievalMethod: 'API',
        retrievedAt: '2026-10-06T12:00:00Z',
        extractorVersion: '1.0.0-test',
        ...overrides?.provenance
      },
      status: 'OBSERVED',
      ...overrides
    };
  };

  describe('1. Raw Evidence Immutability & Target-Scheme Separation', () => {
    it('preserves raw source evidence bytes and objects completely unmutated', () => {
      const rawEvidence = createTestEvidence({
        persianForm: 'سعدى',
        observedRomanization: 'Saʻdī'
      });

      const interpretation = interpretEvidenceScheme(rawEvidence);

      // Raw observation remains strictly Saʻdī
      expect(rawEvidence.observedRomanization).toBe('Saʻdī');
      expect(rawEvidence.persianForm).toBe('سعدى');

      // Interpretation produces separate target-scheme hypothesis
      expect(interpretation.rawObservedRomanization).toBe('Saʻdī');
      expect(interpretation.comparisonSourceForm).toBe('saʻdī');
      expect(interpretation.targetHypothesis).toBe('saʿdī');
    });

    it('distinguishes presentation normalization from scholarly scheme transformation', () => {
      // Case 1: Gulistān -> gulistān (case normalization only, no material scheme rule)
      const directEvi = createTestEvidence({
        persianForm: 'گلستان',
        observedRomanization: 'Gulistān'
      });
      const directInterp = interpretEvidenceScheme(directEvi);
      expect(directInterp.status).toBe('DIRECT_EQUIVALENT');
      expect(directInterp.targetHypothesis).toBe('gulistān');
      expect(directInterp.appliedRuleIds).toEqual([]);

      // Case 2: Saʻdī -> saʿdī (scholarly ʿayn rule applied)
      const aynEvi = createTestEvidence({
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī'
      });
      const aynInterp = interpretEvidenceScheme(aynEvi);
      expect(aynInterp.status).toBe('DETERMINISTIC_EQUIVALENT');
      expect(aynInterp.targetHypothesis).toBe('saʿdī');
      expect(aynInterp.appliedRuleIds).toEqual(['ALA_LC_TO_IJMES_AYN']);
    });
  });

  describe('2. Initial Conservative ALA-LC → IJMES Rules', () => {
    it('applies ALA_LC_TO_IJMES_AYN for modifier turned comma (ʻ / U+02BB)', () => {
      const evidence = createTestEvidence({
        persianForm: 'معلم',
        observedRomanization: 'Muʻallim'
      });
      const interp = interpretEvidenceScheme(evidence);
      expect(interp.status).toBe('DETERMINISTIC_EQUIVALENT');
      expect(interp.targetHypothesis).toBe('muʿallim');
      expect(interp.targetHypothesis?.charCodeAt(2)).toBe(0x02bf); // U+02BF (ʿ)
      expect(interp.appliedRuleIds).toContain('ALA_LC_TO_IJMES_AYN');
    });

    it('applies ALA_LC_TO_IJMES_LEXICAL_HAMZA for internal lexical hamza (ʼ / U+02BC)', () => {
      const evi1 = createTestEvidence({
        persianForm: 'موثر',
        observedRomanization: 'muʼassir'
      });
      const interp1 = interpretEvidenceScheme(evi1);
      expect(interp1.status).toBe('DETERMINISTIC_EQUIVALENT');
      expect(interp1.targetHypothesis).toBe('muʾassir');
      expect(interp1.targetHypothesis?.charCodeAt(2)).toBe(0x02be); // U+02BE (ʾ)
      expect(interp1.appliedRuleIds).toContain('ALA_LC_TO_IJMES_LEXICAL_HAMZA');

      const evi2 = createTestEvidence({
        persianForm: 'پایین',
        observedRomanization: 'pāʼīn'
      });
      const interp2 = interpretEvidenceScheme(evi2);
      expect(interp2.status).toBe('DETERMINISTIC_EQUIVALENT');
      expect(interp2.targetHypothesis).toBe('pāʾīn');
      expect(interp2.targetHypothesis?.charCodeAt(2)).toBe(0x02be);
      expect(interp2.appliedRuleIds).toContain('ALA_LC_TO_IJMES_LEXICAL_HAMZA');
    });

    it('applies ALA_LC_TO_IJMES_DAD for verified ALA-LC Persian ض (z + combining diaeresis below U+0324)', () => {
      // Riz̤ā: 'R' + 'i' + 'z' + '\u0324' + 'ā'
      const rizaRaw = 'Riz\u0324\u0101';
      const evidence = createTestEvidence({
        persianForm: 'رضا',
        observedRomanization: rizaRaw
      });
      const interp = interpretEvidenceScheme(evidence);
      expect(interp.status).toBe('DETERMINISTIC_EQUIVALENT');
      expect(interp.targetHypothesis).toBe('riżā'); // 'r' + 'i' + 'ż' (\u017C) + 'ā'
      expect(interp.targetHypothesis?.charCodeAt(2)).toBe(0x017c); // U+017C (ż)
      expect(interp.appliedRuleIds).toContain('ALA_LC_TO_IJMES_DAD');
    });

    it('identifies direct equivalent forms without unnecessary rule invocation', () => {
      const words = [
        { persian: 'خان', roman: 'Khān', expected: 'khān' },
        { persian: 'محمد', roman: 'Muḥammad', expected: 'muḥammad' },
        { persian: 'میزان', roman: 'Mīzān', expected: 'mīzān' }
      ];

      for (const item of words) {
        const evi = createTestEvidence({
          persianForm: item.persian,
          observedRomanization: item.roman
        });
        const interp = interpretEvidenceScheme(evi);
        expect(interp.status).toBe('DIRECT_EQUIVALENT');
        expect(interp.targetHypothesis).toBe(item.expected);
        expect(interp.appliedRuleIds).toHaveLength(0);
      }
    });
  });

  describe('3. Structural & Contextual Blockers (Fail-Closed)', () => {
    it('blocks structural izāfat with hyphen as CONTEXT_REQUIRED', () => {
      const boundEvi = createTestEvidence({
        persianForm: 'كتاب',
        observedRomanization: 'Kitāb-i',
        derivation: {
          kind: 'ALIGNED_SEGMENT',
          parentEvidenceId: 'evi-parent',
          segmentIndex: 0,
          persianSpan: { start: 0, end: 4 },
          romanizationSpan: { start: 0, end: 7 },
          alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
          candidateEligibility: 'CONTEXT_BOUND',
          exclusionReason: 'bound contextual marker'
        }
      });

      const interp = interpretEvidenceScheme(boundEvi);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.targetHypothesis).toBeNull();
      expect(interp.blockers.some((b) => b.kind === 'HYPHEN_CONTEXT_BOUND')).toBe(true);
    });

    it('blocks structural prime convention (ʹ / U+02B9) as CONTEXT_REQUIRED', () => {
      const primeEvi = createTestEvidence({
        persianForm: 'صفی‌نژاد',
        observedRomanization: 'Ṣafīʹnizhād' // Contains prime ʹ
      });

      const interp = interpretEvidenceScheme(primeEvi);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.targetHypothesis).toBeNull();
      expect(interp.blockers.some((b) => b.kind === 'STRUCTURAL_PRIME')).toBe(true);
    });

    it('blocks structural indefinite marker ending in -ʼi as CONTEXT_REQUIRED', () => {
      const indefEvi = createTestEvidence({
        persianForm: 'خانه‌ای',
        observedRomanization: 'khānahʼi'
      });

      const interp = interpretEvidenceScheme(indefEvi);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.targetHypothesis).toBeNull();
      expect(interp.blockers.some((b) => b.kind === 'STRUCTURAL_INDEFINITE')).toBe(true);
    });

    it('blocks ambiguous final -ah representation as CONTEXT_REQUIRED', () => {
      const hehEvi = createTestEvidence({
        persianForm: 'خانه',
        observedRomanization: 'khānah'
      });

      const interp = interpretEvidenceScheme(hehEvi);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.targetHypothesis).toBeNull();
      expect(interp.blockers.some((b) => b.kind === 'AMBIGUOUS_FINAL_HEH')).toBe(true);
    });

    it('fails closed on unsupported or unknown source scheme', () => {
      const unkEvi = createTestEvidence({
        persianForm: 'سعدی',
        observedRomanization: 'Saadi',
        romanizationScheme: 'UNKNOWN'
      });

      const interp = interpretEvidenceScheme(unkEvi);
      expect(interp.status).toBe('UNSUPPORTED');
      expect(interp.targetHypothesis).toBeNull();
      expect(interp.blockers.some((b) => b.kind === 'UNSUPPORTED_SCHEME')).toBe(true);
    });
  });

  describe('4. Deterministic Identity & Non-Identity Audit Metadata', () => {
    it('produces identical interpretation ID regardless of wall-clock analyzedAt', () => {
      const evidence = createTestEvidence({
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī'
      });

      const id1 = generateInterpretationId({
        evidenceId: evidence.id,
        sourceScheme: evidence.romanizationScheme,
        targetScheme: 'IJMES',
        interpreterVersion: SCHEME_INTERPRETER_VERSION,
        ruleSetVersion: SCHEME_RULESET_VERSION
      });

      const interpA = interpretEvidenceScheme(evidence, { analyzedAt: '2026-10-06T10:00:00Z' });
      const interpB = interpretEvidenceScheme(evidence, { analyzedAt: '2026-10-06T19:45:00Z' });

      expect(interpA.id).toBe(id1);
      expect(interpB.id).toBe(id1);
      expect(interpA.id).toBe(interpB.id);
    });

    it('produces distinct interpretation IDs when interpreter or ruleset version changes', () => {
      const evidence = createTestEvidence();

      const idV1 = generateInterpretationId({
        evidenceId: evidence.id,
        sourceScheme: evidence.romanizationScheme,
        targetScheme: 'IJMES',
        interpreterVersion: '1.0.0',
        ruleSetVersion: '1.0.0'
      });

      const idV2 = generateInterpretationId({
        evidenceId: evidence.id,
        sourceScheme: evidence.romanizationScheme,
        targetScheme: 'IJMES',
        interpreterVersion: '2.0.0',
        ruleSetVersion: '1.0.0'
      });

      expect(idV1).not.toBe(idV2);
    });
  });

  describe('5. Candidate-Level Scheme Consensus Aggregation', () => {
    it('computes UNANIMOUS_DETERMINISTIC consensus when all evidence agrees on IJMES hypothesis', () => {
      const evi1 = createTestEvidence({
        sourceRecordId: 'rec-01',
        persianForm: 'گلستان',
        observedRomanization: 'Gulistān'
      });
      const evi2 = createTestEvidence({
        sourceRecordId: 'rec-02',
        persianForm: 'گلستان',
        observedRomanization: 'gulistān'
      });

      const candidate = synthesizeCandidateFromEvidence('گلستان', [evi1, evi2]);
      const analysis = analyzeCandidateSchemeEvidence(candidate, [evi1, evi2]);

      expect(analysis.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
      expect(analysis.consensusTargetHypothesis).toBe('gulistān');
      expect(analysis.deterministicTargetHypotheses).toEqual(['gulistān']);
      expect(analysis.interpretations).toHaveLength(2);

      // Invariant: candidate.proposedCanonical remains strictly null
      expect(candidate.proposedCanonical).toBeNull();
    });

    it('computes CONFLICTING_DETERMINISTIC when multiple distinct target hypotheses exist', () => {
      const evi1 = createTestEvidence({
        sourceRecordId: 'rec-01',
        persianForm: 'گلستان',
        observedRomanization: 'Gulistān'
      });
      const evi2 = createTestEvidence({
        sourceRecordId: 'rec-02',
        persianForm: 'گلستان',
        observedRomanization: 'Golistān' // Disagreement in vowel
      });

      const candidate = synthesizeCandidateFromEvidence('گلستان', [evi1, evi2]);
      const analysis = analyzeCandidateSchemeEvidence(candidate, [evi1, evi2]);

      expect(analysis.consensusStatus).toBe('CONFLICTING_DETERMINISTIC');
      expect(analysis.consensusTargetHypothesis).toBeNull();
      expect(analysis.deterministicTargetHypotheses).toEqual(['golistān', 'gulistān']);
      expect(candidate.proposedCanonical).toBeNull();
    });

    it('computes PARTIAL when one evidence resolves but another is context-required', () => {
      const evi1 = createTestEvidence({
        sourceRecordId: 'rec-01',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī'
      });
      const evi2 = createTestEvidence({
        sourceRecordId: 'rec-02',
        persianForm: 'سعدی',
        observedRomanization: 'Ṣafīʹnizhād' // structural prime
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [evi1, evi2]);
      const analysis = analyzeCandidateSchemeEvidence(candidate, [evi1, evi2]);

      expect(analysis.consensusStatus).toBe('PARTIAL');
      expect(analysis.consensusTargetHypothesis).toBeNull();
      expect(analysis.deterministicTargetHypotheses).toEqual(['saʿdī']);
      expect(analysis.blockers.some((b) => b.kind === 'STRUCTURAL_PRIME')).toBe(true);
    });

    it('computes BLOCKED when all supporting evidence requires context', () => {
      const evi1 = createTestEvidence({
        sourceRecordId: 'rec-01',
        persianForm: 'خانه',
        observedRomanization: 'khānah'
      });

      const candidate = synthesizeCandidateFromEvidence('خانه', [evi1]);
      const analysis = analyzeCandidateSchemeEvidence(candidate, [evi1]);

      expect(analysis.consensusStatus).toBe('BLOCKED');
      expect(analysis.consensusTargetHypothesis).toBeNull();
      expect(analysis.deterministicTargetHypotheses).toHaveLength(0);
    });

    it('preserves input-order invariance in candidate scheme analysis', () => {
      const eviA = createTestEvidence({
        sourceRecordId: 'rec-01',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī'
      });
      const eviB = createTestEvidence({
        sourceRecordId: 'rec-02',
        persianForm: 'سعدی',
        observedRomanization: 'saʻdī'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [eviA, eviB]);

      const analysisForward = analyzeCandidateSchemeEvidence(candidate, [eviA, eviB]);
      const analysisReversed = analyzeCandidateSchemeEvidence(candidate, [eviB, eviA]);

      expect(analysisForward.id).toBe(analysisReversed.id);
      expect(analysisForward.consensusStatus).toBe(analysisReversed.consensusStatus);
      expect(analysisForward.consensusTargetHypothesis).toBe(analysisReversed.consensusTargetHypothesis);
      expect(analysisForward.deterministicTargetHypotheses).toEqual(
        analysisReversed.deterministicTargetHypotheses
      );
    });

    it('preserves idempotency with respect to duplicate supporting evidence', () => {
      const eviA = createTestEvidence({
        sourceRecordId: 'rec-01',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī'
      });

      const candidate = synthesizeCandidateFromEvidence('سعدی', [eviA]);

      const analysisUnique = analyzeCandidateSchemeEvidence(candidate, [eviA]);
      const analysisDups = analyzeCandidateSchemeEvidence(candidate, [eviA, eviA, eviA]);

      expect(analysisUnique.id).toBe(analysisDups.id);
      expect(analysisUnique.consensusStatus).toBe(analysisDups.consensusStatus);
      expect(analysisUnique.consensusTargetHypothesis).toBe(analysisDups.consensusTargetHypothesis);
      expect(analysisUnique.interpretations).toHaveLength(1);
    });
  });

  describe('6. Read-Only IJMES Runtime Policy Audit', () => {
    it('successfully audits and reports exact matches against project IJMES tables', () => {
      const report = auditIjmesRuntimePolicy();

      expect(report.summary).toBe('PASS');
      expect(report.totalChecked).toBeGreaterThanOrEqual(10);
      expect(report.mismatches).toBe(0);
      expect(report.matches).toBe(report.totalChecked);

      // Explicit character verifications
      const ayn = report.entries.find((e) => e.character === 'ع');
      expect(ayn?.status).toBe('MATCH');
      expect(ayn?.schemeTargetSymbol).toBe('ʿ');
      expect(ayn?.runtimeMappingSymbol).toBe('ʿ');

      const dad = report.entries.find((e) => e.character === 'ض');
      expect(dad?.status).toBe('MATCH');
      expect(dad?.schemeTargetSymbol).toBe('ż');
      expect(dad?.runtimeMappingSymbol).toBe('ż');

      const hamza = report.entries.find((e) => e.character === 'ء');
      expect(hamza?.status).toBe('MATCH');
      expect(hamza?.schemeTargetSymbol).toBe('ʾ');
      expect(hamza?.runtimeMappingSymbol).toBe('ʾ');
    });

    it('rule registry returns full source citations for all registered rules', () => {
      const rules = getAllSchemeRules();
      expect(rules.length).toBeGreaterThanOrEqual(3);

      for (const rule of rules) {
        expect(rule.sourceReferences.length).toBeGreaterThan(0);
        for (const ref of rule.sourceReferences) {
          expect(ref.authority).toBeDefined();
          expect(ref.documentTitle).toBeDefined();
          expect(ref.versionOrDate).toBeDefined();
        }
      }

      const aynRule = getSchemeRule('ALA_LC_TO_IJMES_AYN');
      expect(aynRule).toBeDefined();
      expect(aynRule?.targetScheme).toBe('IJMES');
    });
  });

  describe('7. Genuine LoC Catalog Fixture Assertions', () => {
    it('processes fixture 2016404617 (Saʻdī / Gulistān) with exact regression statistics', () => {
      const fixtureXml = fs.readFileSync(
        path.resolve(__dirname, '../loc/fixtures/2016404617.marcxml.xml'),
        'utf8'
      );
      const records = parseMarcXml(fixtureXml);
      const parentEvidence = extractEvidenceFromMarcRecord(records[0]);
      const batchResult = processEvidenceAlignmentBatch(parentEvidence);

      expect(batchResult.candidates).toHaveLength(2);

      // Candidate 1: سعدی
      const sadiCand = batchResult.candidates.find((c) => c.normalizedForm === 'سعدی');
      expect(sadiCand).toBeDefined();
      const sadiEvidence = batchResult.derivedEvidence.filter((e) =>
        sadiCand?.evidenceIds.includes(e.id)
      );
      const sadiAnalysis = analyzeCandidateSchemeEvidence(sadiCand!, sadiEvidence);

      expect(sadiAnalysis.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
      expect(sadiAnalysis.consensusTargetHypothesis).toBe('saʿdī');
      expect(sadiAnalysis.appliedRuleIds).toContain('ALA_LC_TO_IJMES_AYN');
      expect(sadiCand?.proposedCanonical).toBeNull(); // Untouched

      // Candidate 2: گلستان
      const gulistanCand = batchResult.candidates.find((c) => c.normalizedForm === 'گلستان');
      expect(gulistanCand).toBeDefined();
      const gulistanEvidence = batchResult.derivedEvidence.filter((e) =>
        gulistanCand?.evidenceIds.includes(e.id)
      );
      const gulistanAnalysis = analyzeCandidateSchemeEvidence(gulistanCand!, gulistanEvidence);

      expect(gulistanAnalysis.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
      expect(gulistanAnalysis.consensusTargetHypothesis).toBe('gulistān');
      expect(gulistanCand?.proposedCanonical).toBeNull();
    });

    it('processes fixture 2002341405 (Mīzān al-ṭibb) with exact regression statistics', () => {
      const fixtureXml = fs.readFileSync(
        path.resolve(__dirname, '../loc/fixtures/2002341405.marcxml.xml'),
        'utf8'
      );
      const records = parseMarcXml(fixtureXml);
      const parentEvidence = extractEvidenceFromMarcRecord(records[0]);
      const batchResult = processEvidenceAlignmentBatch(parentEvidence);

      expect(batchResult.candidates).toHaveLength(8);

      for (const cand of batchResult.candidates) {
        const supporting = batchResult.derivedEvidence.filter((e) =>
          cand.evidenceIds.includes(e.id)
        );
        const analysis = analyzeCandidateSchemeEvidence(cand, supporting);
        expect(cand.proposedCanonical).toBeNull();
        expect(analysis.consensusStatus).toBeDefined();
      }

      // Mīzān candidate -> mīzān
      const mizanCand = batchResult.candidates.find((c) => c.normalizedForm === 'میزان');
      expect(mizanCand).toBeDefined();
      const mizanSupporting = batchResult.derivedEvidence.filter((e) =>
        mizanCand?.evidenceIds.includes(e.id)
      );
      const mizanAnalysis = analyzeCandidateSchemeEvidence(mizanCand!, mizanSupporting);
      expect(mizanAnalysis.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
      expect(mizanAnalysis.consensusTargetHypothesis).toBe('mīzān');
    });

    it('processes fixture 2025364468 (Rūznāmah-ʼi Sharaf va Sharāfat) with exact regression statistics', () => {
      const fixtureXml = fs.readFileSync(
        path.resolve(__dirname, '../loc/fixtures/2025364468.marcxml.xml'),
        'utf8'
      );
      const records = parseMarcXml(fixtureXml);
      const parentEvidence = extractEvidenceFromMarcRecord(records[0]);
      const batchResult = processEvidenceAlignmentBatch(parentEvidence);

      expect(batchResult.candidates).toHaveLength(13);

      // Verify Riz̤ā candidate correctly interprets ALA-LC ض (z̤ -> ż)
      const rizaCand = batchResult.candidates.find((c) => c.normalizedForm === 'رضا');
      expect(rizaCand).toBeDefined();
      const rizaSupporting = batchResult.derivedEvidence.filter((e) =>
        rizaCand?.evidenceIds.includes(e.id)
      );
      const rizaAnalysis = analyzeCandidateSchemeEvidence(rizaCand!, rizaSupporting);
      expect(rizaAnalysis.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
      expect(rizaAnalysis.consensusTargetHypothesis).toBe('riżā');
      expect(rizaAnalysis.appliedRuleIds).toContain('ALA_LC_TO_IJMES_DAD');
      expect(rizaCand?.proposedCanonical).toBeNull();
    });
  });
});
