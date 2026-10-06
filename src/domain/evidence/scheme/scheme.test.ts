import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateEvidenceId, synthesizeCandidateFromEvidence } from '../candidate';
import { extractEvidenceFromMarcRecord } from '../loc/extractor';
import { parseMarcXml } from '../loc/xmlParser';
import { processEvidenceAlignmentBatch } from '../alignment/batchOrchestrator';
import { LexicalCandidate, LexicalEvidence } from '../types';
import {
  analyzeCandidateSchemeEvidence,
  auditIjmesRuntimePolicy,
  generateInterpretationId,
  getAllSchemeRules,
  getAllTargetPolicies,
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

  const createAlignedPair = (
    parentOverrides?: Partial<LexicalEvidence>,
    childOverrides?: Partial<LexicalEvidence>
  ): { parent: LexicalEvidence; child: LexicalEvidence } => {
    const parent = createTestEvidence({
      persianForm: 'گلستان سعدی',
      observedRomanization: 'Gulistān-i Saʻdī',
      ...parentOverrides
    });

    const childPersian = childOverrides?.persianForm ?? 'گلستان';
    const childRoman =
      childOverrides?.observedRomanization !== undefined
        ? childOverrides.observedRomanization
        : 'Gulistān';

    const pStart = parent.persianForm.indexOf(childPersian);
    const pEnd = pStart >= 0 ? pStart + childPersian.length : childPersian.length;
    const rStart = parent.observedRomanization && childRoman ? parent.observedRomanization.indexOf(childRoman) : 0;
    const rEnd = rStart >= 0 && childRoman ? rStart + childRoman.length : (childRoman?.length ?? 0);

    const child = createTestEvidence({
      sourceType: parent.sourceType,
      sourceRecordId: parent.sourceRecordId,
      sourceUri: parent.sourceUri,
      sourceField: parent.sourceField,
      persianForm: childPersian,
      observedRomanization: childRoman,
      romanizationScheme: parent.romanizationScheme,
      provenance: parent.provenance,
      derivation: {
        kind: 'ALIGNED_SEGMENT',
        parentEvidenceId: parent.id,
        segmentIndex: 0,
        persianSpan: { start: Math.max(0, pStart), end: Math.max(0, pEnd) },
        romanizationSpan: { start: Math.max(0, rStart), end: Math.max(0, rEnd) },
        alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
        candidateEligibility: 'ELIGIBLE',
        ...childOverrides?.derivation
      },
      ...childOverrides
    });

    return { parent, child };
  };

  const createAlignedCandidate = (
    persian: string,
    supportingEvidence: LexicalEvidence[],
    overrides?: Partial<LexicalCandidate>
  ): LexicalCandidate => {
    const cand = synthesizeCandidateFromEvidence(persian, supportingEvidence, {
      proposedCanonical: null,
      ...overrides
    });
    cand.derivationProvenance = {
      derivedAt: '2026-10-06T12:00:00Z',
      strategy: 'ALIGNED_SEGMENT_SYNTHESIS',
      ...overrides?.derivationProvenance
    };
    return cand;
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
    it('applies ALA_LC_TO_IJMES_AYN for exact modifier turned comma (ʻ / U+02BB)', () => {
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

    it('applies ALA_LC_TO_IJMES_LEXICAL_HAMZA for internal and final lexical hamza (ʼ / U+02BC)', () => {
      // Internal
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

      // Final
      const evi3 = createTestEvidence({
        persianForm: 'خلفاء',
        observedRomanization: 'khulafāʼ'
      });
      const interp3 = interpretEvidenceScheme(evi3);
      expect(interp3.status).toBe('DETERMINISTIC_EQUIVALENT');
      expect(interp3.targetHypothesis).toBe('khulafāʾ');
      expect(interp3.targetHypothesis?.charCodeAt(7)).toBe(0x02be);
      expect(interp3.appliedRuleIds).toContain('ALA_LC_TO_IJMES_LEXICAL_HAMZA');
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

  describe('3. Unicode-Exact Markers, Blockers & Typographic Disambiguation', () => {
    it('rejects U+2018 (left single quotation mark) without silently applying the scholarly ʿayn rule', () => {
      const typoAyn = createTestEvidence({
        persianForm: 'سعدی',
        observedRomanization: 'Sa\u2018d\u012B' // Sa‘dī with U+2018
      });

      const interp = interpretEvidenceScheme(typoAyn);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.targetHypothesis).toBeNull();
      expect(interp.blockers.some((b) => b.kind === 'UNVERIFIED_TYPOGRAPHIC_VARIANT')).toBe(true);
      expect(interp.appliedRuleIds).toHaveLength(0);
    });

    it('rejects ASCII U+0027 apostrophe and U+2019 right single quote as UNVERIFIED_TYPOGRAPHIC_VARIANT', () => {
      const asciiHamza = createTestEvidence({
        persianForm: 'موثر',
        observedRomanization: "mu'assir" // ASCII single quote U+0027
      });
      const interpAscii = interpretEvidenceScheme(asciiHamza);
      expect(interpAscii.status).toBe('CONTEXT_REQUIRED');
      expect(interpAscii.targetHypothesis).toBeNull();
      expect(interpAscii.blockers.some((b) => b.kind === 'UNVERIFIED_TYPOGRAPHIC_VARIANT')).toBe(true);

      const curlyHamza = createTestEvidence({
        persianForm: 'موثر',
        observedRomanization: 'mu\u2019assir' // U+2019
      });
      const interpCurly = interpretEvidenceScheme(curlyHamza);
      expect(interpCurly.status).toBe('CONTEXT_REQUIRED');
      expect(interpCurly.targetHypothesis).toBeNull();
      expect(interpCurly.blockers.some((b) => b.kind === 'UNVERIFIED_TYPOGRAPHIC_VARIANT')).toBe(true);
    });

    it('fails closed on initial hamza marker (e.g. ʼamr)', () => {
      const initHamza = createTestEvidence({
        persianForm: 'امر',
        observedRomanization: 'ʼamr' // U+02BC at word start
      });

      const interp = interpretEvidenceScheme(initHamza);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.targetHypothesis).toBeNull();
      expect(interp.blockers.some((b) => b.kind === 'INITIAL_HAMZA_DISALLOWED')).toBe(true);
      expect(interp.appliedRuleIds).toHaveLength(0);
    });

    it('distinguishes izāfat (-i, -ʼi, -yi) from generic hyphen context', () => {
      // 1. -i izāfat
      const izafat1 = createTestEvidence({
        persianForm: 'کتاب',
        observedRomanization: 'Kitāb-i'
      });
      const interp1 = interpretEvidenceScheme(izafat1);
      expect(interp1.status).toBe('CONTEXT_REQUIRED');
      expect(interp1.targetHypothesis).toBeNull();
      expect(interp1.blockers.some((b) => b.kind === 'STRUCTURAL_IZAFAT')).toBe(true);

      // 2. -ʼi izāfat
      const izafat2 = createTestEvidence({
        persianForm: 'خانه',
        observedRomanization: 'khānah-ʼi'
      });
      const interp2 = interpretEvidenceScheme(izafat2);
      expect(interp2.status).toBe('CONTEXT_REQUIRED');
      expect(interp2.targetHypothesis).toBeNull();
      expect(interp2.blockers.some((b) => b.kind === 'STRUCTURAL_IZAFAT')).toBe(true);

      // 3. -yi izāfat
      const izafat3 = createTestEvidence({
        persianForm: 'دریا',
        observedRomanization: 'Daryā-yi'
      });
      const interp3 = interpretEvidenceScheme(izafat3);
      expect(interp3.status).toBe('CONTEXT_REQUIRED');
      expect(interp3.targetHypothesis).toBeNull();
      expect(interp3.blockers.some((b) => b.kind === 'STRUCTURAL_IZAFAT')).toBe(true);

      // 4. Generic non-izāfat hyphen (e.g. Arabic article al-ṭibb)
      const genericHyphen = createTestEvidence({
        persianForm: 'الطب',
        observedRomanization: 'al-ṭibb'
      });
      const interpGeneric = interpretEvidenceScheme(genericHyphen);
      expect(interpGeneric.status).toBe('CONTEXT_REQUIRED');
      expect(interpGeneric.targetHypothesis).toBeNull();
      expect(interpGeneric.blockers.some((b) => b.kind === 'HYPHEN_CONTEXT_BOUND')).toBe(true);
      expect(interpGeneric.blockers.some((b) => b.kind === 'STRUCTURAL_IZAFAT')).toBe(false);
    });

    it('blocks unhyphenated ʼi indefinite marker as STRUCTURAL_INDEFINITE', () => {
      const indefEvi = createTestEvidence({
        persianForm: 'خانه‌ای',
        observedRomanization: 'khānahʼi' // unhyphenated ʼi
      });

      const interp = interpretEvidenceScheme(indefEvi);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.targetHypothesis).toBeNull();
      expect(interp.blockers.some((b) => b.kind === 'STRUCTURAL_INDEFINITE')).toBe(true);
      expect(interp.blockers.some((b) => b.kind === 'STRUCTURAL_IZAFAT')).toBe(false);
    });

    it('blocks structural prime convention (ʹ / U+02B9) as STRUCTURAL_PRIME', () => {
      const primeEvi = createTestEvidence({
        persianForm: 'صفی‌نژاد',
        observedRomanization: 'Ṣafīʹnizhād' // Contains prime ʹ
      });

      const interp = interpretEvidenceScheme(primeEvi);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.targetHypothesis).toBeNull();
      expect(interp.blockers.some((b) => b.kind === 'STRUCTURAL_PRIME')).toBe(true);
    });

    it('blocks ambiguous final -ah representation without any lexical allowlists', () => {
      const cases = ['khānah', 'rūznāmah', 'allāh', 'shāh'];
      for (const word of cases) {
        if (word.endsWith('ah')) {
          const hehEvi = createTestEvidence({
            persianForm: 'تست',
            observedRomanization: word
          });
          const interp = interpretEvidenceScheme(hehEvi);
          expect(interp.status).toBe('CONTEXT_REQUIRED');
          expect(interp.targetHypothesis).toBeNull();
          expect(interp.blockers.some((b) => b.kind === 'AMBIGUOUS_FINAL_HEH')).toBe(true);
        }
      }
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

  describe('5. Candidate-Level Scheme Consensus & Exact Evidence Set Closure', () => {
    it('computes UNANIMOUS_DETERMINISTIC consensus when all aligned evidence agrees on IJMES hypothesis', () => {
      const { parent: p1, child: c1 } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'گلستان', observedRomanization: 'Gulistān' },
        { persianForm: 'گلستان', observedRomanization: 'Gulistān' }
      );
      const { parent: p2, child: c2 } = createAlignedPair(
        { sourceRecordId: 'rec-02', persianForm: 'گلستان', observedRomanization: 'gulistān' },
        { persianForm: 'گلستان', observedRomanization: 'gulistān' }
      );

      const candidate = createAlignedCandidate('گلستان', [c1, c2]);
      const parentMap = new Map([
        [p1.id, p1],
        [p2.id, p2]
      ]);

      const analysis = analyzeCandidateSchemeEvidence(candidate, [c1, c2], {
        parentLookup: (id) => parentMap.get(id)
      });

      expect(analysis.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
      expect(analysis.consensusTargetHypothesis).toBe('gulistān');
      expect(analysis.deterministicTargetHypotheses).toEqual(['gulistān']);
      expect(analysis.interpretations).toHaveLength(2);

      // Invariant: candidate.proposedCanonical remains strictly null
      expect(candidate.proposedCanonical).toBeNull();
    });

    it('fails closed when an evidence subset is supplied (missing candidate evidence ID)', () => {
      const { parent: p1, child: c1 } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'گلستان', observedRomanization: 'Gulistān' },
        { persianForm: 'گلستان', observedRomanization: 'Gulistān' }
      );
      const { parent: p2, child: c2 } = createAlignedPair(
        { sourceRecordId: 'rec-02', persianForm: 'گلستان', observedRomanization: 'Golistān' },
        { persianForm: 'گلستان', observedRomanization: 'Golistān' }
      );

      const candidate = createAlignedCandidate('گلستان', [c1, c2]);
      const parentMap = new Map([
        [p1.id, p1],
        [p2.id, p2]
      ]);

      // Attempting to analyze only [c1] to hide the conflict in c2 must fail closed
      expect(() => {
        analyzeCandidateSchemeEvidence(candidate, [c1], {
          parentLookup: (id) => parentMap.get(id)
        });
      }).toThrow(/missing supporting evidence/i);
    });

    it('fails closed when extra/injected evidence is supplied in array input', () => {
      const { parent: p1, child: c1 } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'گلستان', observedRomanization: 'Gulistān' },
        { persianForm: 'گلستان', observedRomanization: 'Gulistān' }
      );
      const { parent: pForeign, child: cForeign } = createAlignedPair(
        { sourceRecordId: 'rec-99', persianForm: 'گلستان', observedRomanization: 'Gulistān' },
        { persianForm: 'گلستان', observedRomanization: 'Gulistān' }
      );

      const candidate = createAlignedCandidate('گلستان', [c1]);
      const parentMap = new Map([
        [p1.id, p1],
        [pForeign.id, pForeign]
      ]);

      expect(() => {
        analyzeCandidateSchemeEvidence(candidate, [c1, cForeign], {
          parentLookup: (id) => parentMap.get(id)
        });
      }).toThrow(/contains extra unreferenced evidence/i);
    });

    it('fails closed when duplicate evidence IDs are present in the supplied evidence array', () => {
      const { parent: p1, child: c1 } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'گلستان', observedRomanization: 'Gulistān' },
        { persianForm: 'گلستان', observedRomanization: 'Gulistān' }
      );

      const candidate = createAlignedCandidate('گلستان', [c1]);
      const parentMap = new Map([[p1.id, p1]]);

      // Passing duplicate elements with the same ID in the array must throw immediately
      expect(() => {
        analyzeCandidateSchemeEvidence(candidate, [c1, c1], {
          parentLookup: (id) => parentMap.get(id)
        });
      }).toThrow(/duplicate evidence ID/i);
    });

    it('fails closed when candidate references non-existent evidence ID in lookup source', () => {
      const candidate: LexicalCandidate = {
        id: 'cand-test',
        normalizedForm: 'گلستان',
        persianForm: 'گلستان',
        entityType: 'WORD',
        evidenceIds: ['non-existent-evi-id'],
        status: 'UNREVIEWED',
        conflicts: [],
        proposedCanonical: null,
        derivationProvenance: {
          derivedAt: '2026-10-06T12:00:00Z',
          strategy: 'ALIGNED_SEGMENT_SYNTHESIS'
        }
      };

      const lookupMap = new Map<string, LexicalEvidence>();
      expect(() => {
        analyzeCandidateSchemeEvidence(candidate, (id) => lookupMap.get(id));
      }).toThrow(/references non-existent supporting evidence ID/i);
    });

    it('fails closed when candidate contains duplicate evidence IDs', () => {
      const { parent: p1, child: c1 } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'گلستان', observedRomanization: 'Gulistān' },
        { persianForm: 'گلستان', observedRomanization: 'Gulistān' }
      );

      const candidate: LexicalCandidate = {
        id: 'cand-dup-test',
        normalizedForm: 'گلستان',
        persianForm: 'گلستان',
        entityType: 'WORD',
        evidenceIds: [c1.id, c1.id], // duplicate in candidate.evidenceIds
        status: 'UNREVIEWED',
        conflicts: [],
        proposedCanonical: null,
        derivationProvenance: {
          derivedAt: '2026-10-06T12:00:00Z',
          strategy: 'ALIGNED_SEGMENT_SYNTHESIS'
        }
      };

      const parentMap = new Map([[p1.id, p1]]);

      expect(() => {
        analyzeCandidateSchemeEvidence(candidate, (id) => (id === c1.id ? c1 : undefined), {
          parentLookup: (id) => parentMap.get(id)
        });
      }).toThrow(/contains duplicate evidence reference/i);
    });

    it('fails closed on same-ID derivation stripping attack', () => {
      const { parent: p1, child: authenticChild } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'گلستان', observedRomanization: 'Gulistān' },
        { persianForm: 'گلستان', observedRomanization: 'Gulistān' }
      );

      const candidate = createAlignedCandidate('گلستان', [authenticChild]);

      // Stripping derivation from the object with the same ID must be caught and rejected
      const forgedChild: LexicalEvidence = {
        ...authenticChild,
        derivation: undefined
      };

      expect(() => {
        analyzeCandidateSchemeEvidence(candidate, [forgedChild], {
          parentLookup: (id) => (id === p1.id ? p1 : undefined)
        });
      }).toThrow(/missing required "ALIGNED_SEGMENT" derivation/i);
    });

    it('fails closed on same-ID romanization substitution attack', () => {
      const { parent: p1, child: authenticChild } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'گلستان', observedRomanization: 'Gulistān' },
        { persianForm: 'گلستان', observedRomanization: 'Gulistān' }
      );

      const candidate = createAlignedCandidate('گلستان', [authenticChild]);

      // Altering observedRomanization on the child while keeping parent as Gulistān
      const forgedChild: LexicalEvidence = {
        ...authenticChild,
        observedRomanization: 'Golistān'
      };

      expect(() => {
        analyzeCandidateSchemeEvidence(candidate, [forgedChild], {
          parentLookup: (id) => (id === p1.id ? p1 : undefined)
        });
      }).toThrow(/does not match parent substring slice/i);
    });

    it('fails closed when candidate did not originate from ALIGNED_SEGMENT_SYNTHESIS', () => {
      const { parent: p1, child: c1 } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'گلستان', observedRomanization: 'Gulistān' },
        { persianForm: 'گلستان', observedRomanization: 'Gulistān' }
      );

      const nonPhase5CStrategies = [
        'SINGLE_EVIDENCE',
        'MULTI_EVIDENCE_SYNTHESIS',
        'MANUAL_DRAFT',
        'SCHOLARLY_HEURISTIC'
      ] as const;

      for (const strategy of nonPhase5CStrategies) {
        const candidate = createAlignedCandidate('گلستان', [c1], {
          derivationProvenance: {
            derivedAt: '2026-10-06T12:00:00Z',
            strategy: strategy as any
          }
        });

        expect(() => {
          analyzeCandidateSchemeEvidence(candidate, [c1], {
            parentLookup: (id) => (id === p1.id ? p1 : undefined)
          });
        }).toThrow(/unsupported derivation strategy/i);
      }
    });

    it('fails closed when candidate has non-null proposedCanonical at Phase 5D boundary', () => {
      const { parent: p1, child: c1 } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'گلستان', observedRomanization: 'Gulistān' },
        { persianForm: 'گلستان', observedRomanization: 'Gulistān' }
      );

      const candidate = createAlignedCandidate('گلستان', [c1]);
      candidate.proposedCanonical = 'gulistān'; // Non-null violation

      expect(() => {
        analyzeCandidateSchemeEvidence(candidate, [c1], {
          parentLookup: (id) => (id === p1.id ? p1 : undefined)
        });
      }).toThrow(/non-null proposedCanonical/i);
    });

    it('fails closed when forged child lineage is analyzed', () => {
      const parentEvi = createTestEvidence({
        persianForm: 'کتاب گلستان',
        observedRomanization: 'Kitāb-i Gulistān'
      });

      // Child has invalid forged span
      const forgedChild = createTestEvidence({
        persianForm: 'گلستان',
        observedRomanization: 'Gulistān',
        derivation: {
          kind: 'ALIGNED_SEGMENT',
          parentEvidenceId: parentEvi.id,
          segmentIndex: 1,
          persianSpan: { start: 0, end: 4 }, // INVALID SPAN for 'گلستان' in 'کتاب گلستان'
          romanizationSpan: { start: 8, end: 16 },
          alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
          candidateEligibility: 'ELIGIBLE'
        }
      });

      const candidate = createAlignedCandidate('گلستان', [forgedChild]);

      const allMap = new Map<string, LexicalEvidence>([
        [parentEvi.id, parentEvi],
        [forgedChild.id, forgedChild]
      ]);

      expect(() => {
        analyzeCandidateSchemeEvidence(candidate, [forgedChild], {
          parentLookup: (id) => allMap.get(id)
        });
      }).toThrow(/persianForm .* does not match parent substring slice/i);
    });

    it('preserves defensive isolation between rawSourceConflicts snapshot and candidate conflicts', () => {
      const { parent: p1, child: c1 } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'سعدی', observedRomanization: 'Saʻdī' },
        { persianForm: 'سعدی', observedRomanization: 'Saʻdī' }
      );
      const { parent: p2, child: c2 } = createAlignedPair(
        { sourceRecordId: 'rec-02', persianForm: 'سعدی', observedRomanization: 'saʻdī' },
        { persianForm: 'سعدی', observedRomanization: 'saʻdī' }
      );

      const candidate = createAlignedCandidate('سعدی', [c1, c2]);
      expect(candidate.status).toBe('REVIEW_REQUIRED');
      expect(candidate.conflicts).toHaveLength(2);

      const parentMap = new Map([
        [p1.id, p1],
        [p2.id, p2]
      ]);

      const analysis = analyzeCandidateSchemeEvidence(candidate, [c1, c2], {
        parentLookup: (id) => parentMap.get(id)
      });

      expect(analysis.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
      expect(analysis.consensusTargetHypothesis).toBe('saʿdī');
      expect(analysis.rawCandidateStatus).toBe('REVIEW_REQUIRED');
      expect(analysis.rawSourceConflicts).toHaveLength(2);

      // Mutating analysis.rawSourceConflicts does NOT mutate candidate.conflicts
      analysis.rawSourceConflicts[0].conflictReason = 'MUTATED_ANALYSIS_REASON';
      expect(candidate.conflicts[0].conflictReason).not.toBe('MUTATED_ANALYSIS_REASON');

      // Mutating candidate.conflicts does NOT mutate analysis.rawSourceConflicts
      candidate.conflicts[1].conflictReason = 'MUTATED_CANDIDATE_REASON';
      expect(analysis.rawSourceConflicts[1].conflictReason).not.toBe('MUTATED_CANDIDATE_REASON');
    });

    it('computes CONFLICTING_DETERMINISTIC when multiple distinct target hypotheses exist', () => {
      const { parent: p1, child: c1 } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'گلستان', observedRomanization: 'Gulistān' },
        { persianForm: 'گلستان', observedRomanization: 'Gulistān' }
      );
      const { parent: p2, child: c2 } = createAlignedPair(
        { sourceRecordId: 'rec-02', persianForm: 'گلستان', observedRomanization: 'Golistān' },
        { persianForm: 'گلستان', observedRomanization: 'Golistān' }
      );

      const candidate = createAlignedCandidate('گلستان', [c1, c2]);
      const parentMap = new Map([
        [p1.id, p1],
        [p2.id, p2]
      ]);

      const analysis = analyzeCandidateSchemeEvidence(candidate, [c1, c2], {
        parentLookup: (id) => parentMap.get(id)
      });

      expect(analysis.consensusStatus).toBe('CONFLICTING_DETERMINISTIC');
      expect(analysis.consensusTargetHypothesis).toBeNull();
      expect(analysis.deterministicTargetHypotheses).toEqual(['golistān', 'gulistān']);
      expect(candidate.proposedCanonical).toBeNull();
    });

    it('computes PARTIAL when one evidence resolves but another is context-required', () => {
      const { parent: p1, child: c1 } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'سعدی', observedRomanization: 'Saʻdī' },
        { persianForm: 'سعدی', observedRomanization: 'Saʻdī' }
      );
      const { parent: p2, child: c2 } = createAlignedPair(
        { sourceRecordId: 'rec-02', persianForm: 'سعدی', observedRomanization: 'Ṣafīʹnizhād' },
        { persianForm: 'سعدی', observedRomanization: 'Ṣafīʹnizhād' }
      );

      const candidate = createAlignedCandidate('سعدی', [c1, c2]);
      const parentMap = new Map([
        [p1.id, p1],
        [p2.id, p2]
      ]);

      const analysis = analyzeCandidateSchemeEvidence(candidate, [c1, c2], {
        parentLookup: (id) => parentMap.get(id)
      });

      expect(analysis.consensusStatus).toBe('PARTIAL');
      expect(analysis.consensusTargetHypothesis).toBeNull();
      expect(analysis.deterministicTargetHypotheses).toEqual(['saʿdī']);
      expect(analysis.blockers.some((b) => b.kind === 'STRUCTURAL_PRIME')).toBe(true);
    });

    it('computes BLOCKED when all supporting evidence requires context', () => {
      const { parent: p1, child: c1 } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'خانه', observedRomanization: 'khānah' },
        { persianForm: 'خانه', observedRomanization: 'khānah' }
      );

      const candidate = createAlignedCandidate('خانه', [c1]);
      const parentMap = new Map([[p1.id, p1]]);

      const analysis = analyzeCandidateSchemeEvidence(candidate, [c1], {
        parentLookup: (id) => parentMap.get(id)
      });

      expect(analysis.consensusStatus).toBe('BLOCKED');
      expect(analysis.consensusTargetHypothesis).toBeNull();
      expect(analysis.deterministicTargetHypotheses).toHaveLength(0);
    });

    it('preserves input-order invariance in candidate scheme analysis', () => {
      const { parent: p1, child: c1 } = createAlignedPair(
        { sourceRecordId: 'rec-01', persianForm: 'سعدی', observedRomanization: 'Saʻdī' },
        { persianForm: 'سعدی', observedRomanization: 'Saʻdī' }
      );
      const { parent: p2, child: c2 } = createAlignedPair(
        { sourceRecordId: 'rec-02', persianForm: 'سعدی', observedRomanization: 'saʻdī' },
        { persianForm: 'سعدی', observedRomanization: 'saʻdī' }
      );

      const candidate = createAlignedCandidate('سعدی', [c1, c2]);
      const parentMap = new Map([
        [p1.id, p1],
        [p2.id, p2]
      ]);

      const analysisForward = analyzeCandidateSchemeEvidence(candidate, [c1, c2], {
        parentLookup: (id) => parentMap.get(id)
      });
      const analysisReversed = analyzeCandidateSchemeEvidence(candidate, [c2, c1], {
        parentLookup: (id) => parentMap.get(id)
      });

      expect(analysisForward.id).toBe(analysisReversed.id);
      expect(analysisForward.consensusStatus).toBe(analysisReversed.consensusStatus);
      expect(analysisForward.consensusTargetHypothesis).toBe(analysisReversed.consensusTargetHypothesis);
      expect(analysisForward.deterministicTargetHypotheses).toEqual(
        analysisReversed.deterministicTargetHypotheses
      );
    });
  });

  describe('6. Read-Only IJMES Runtime Policy Audit & Zero Ghost IDs', () => {
    it('successfully audits and reports exact matches against project IJMES tables with zero ghost IDs', () => {
      const report = auditIjmesRuntimePolicy();

      expect(report.summary).toBe('PASS');
      expect(report.totalChecked).toBeGreaterThanOrEqual(10);
      expect(report.mismatches).toBe(0);
      expect(report.matches).toBe(report.totalChecked);

      // Verify every policy entry has official source provenance and real policy ID
      const targetPolicies = getAllTargetPolicies();
      expect(targetPolicies.length).toBeGreaterThanOrEqual(10);
      for (const entry of report.entries) {
        expect(entry.policyId).toMatch(/^IJMES_POLICY_/);
        expect(entry.sourceReferences.length).toBeGreaterThan(0);
        for (const ref of entry.sourceReferences) {
          expect(ref.authority).toBe('IJMES');
          expect(ref.documentTitle).toBeDefined();
          expect(ref.sectionOrTable).toBeDefined();
        }
      }

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

    it('scheme rule registry returns full source citations for all registered rules', () => {
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

      const parentMap = new Map(parentEvidence.map((p) => [p.id, p]));
      const parentLookup = (id: string) => parentMap.get(id);

      // Candidate 1: سعدی
      const sadiCand = batchResult.candidates.find((c) => c.normalizedForm === 'سعدی');
      expect(sadiCand).toBeDefined();
      const sadiEvidence = batchResult.derivedEvidence.filter((e) =>
        sadiCand?.evidenceIds.includes(e.id)
      );
      const sadiAnalysis = analyzeCandidateSchemeEvidence(sadiCand!, sadiEvidence, {
        parentLookup
      });

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
      const gulistanAnalysis = analyzeCandidateSchemeEvidence(gulistanCand!, gulistanEvidence, {
        parentLookup
      });

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

      const parentMap = new Map(parentEvidence.map((p) => [p.id, p]));
      const parentLookup = (id: string) => parentMap.get(id);

      for (const cand of batchResult.candidates) {
        const supporting = batchResult.derivedEvidence.filter((e) =>
          cand.evidenceIds.includes(e.id)
        );
        const analysis = analyzeCandidateSchemeEvidence(cand, supporting, {
          parentLookup
        });
        expect(cand.proposedCanonical).toBeNull();
        expect(analysis.consensusStatus).toBeDefined();
      }

      // Mīzān candidate -> mīzān
      const mizanCand = batchResult.candidates.find((c) => c.normalizedForm === 'میزان');
      expect(mizanCand).toBeDefined();
      const mizanSupporting = batchResult.derivedEvidence.filter((e) =>
        mizanCand?.evidenceIds.includes(e.id)
      );
      const mizanAnalysis = analyzeCandidateSchemeEvidence(mizanCand!, mizanSupporting, {
        parentLookup
      });
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

      const parentMap = new Map(parentEvidence.map((p) => [p.id, p]));
      const parentLookup = (id: string) => parentMap.get(id);

      // Verify Riz̤ā candidate correctly interprets ALA-LC ض (z̤ -> ż)
      const rizaCand = batchResult.candidates.find((c) => c.normalizedForm === 'رضا');
      expect(rizaCand).toBeDefined();
      const rizaSupporting = batchResult.derivedEvidence.filter((e) =>
        rizaCand?.evidenceIds.includes(e.id)
      );
      const rizaAnalysis = analyzeCandidateSchemeEvidence(rizaCand!, rizaSupporting, {
        parentLookup
      });
      expect(rizaAnalysis.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
      expect(rizaAnalysis.consensusTargetHypothesis).toBe('riżā');
      expect(rizaAnalysis.appliedRuleIds).toContain('ALA_LC_TO_IJMES_DAD');
      expect(rizaCand?.proposedCanonical).toBeNull();
    });
  });
});
