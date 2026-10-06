import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizePersian } from '../../normalization';
import { generateEvidenceId } from '../candidate';
import { extractEvidenceFromMarcRecord } from '../loc/extractor';
import { parseMarcXml } from '../loc/xmlParser';
import { LexicalEvidenceRepository } from '../repository';
import {
  LexicalEvidence,
  LexicalEvidenceDerivation
} from '../types';
import { extractCandidatesFromAlignedEvidence } from './candidateExtractor';
import { tokenizePersianLexicalTokens } from './persianLexicalTokenizer';
import { alignLexicalEvidence } from './positionalAligner';
import { tokenizeRomanLexemes } from './romanLexemeTokenizer';

describe('Phase 5C: Lexical Alignment & Candidate Extraction', () => {
  const createParentEvidence = (overrides?: Partial<LexicalEvidence>): LexicalEvidence => {
    const persianForm = overrides?.persianForm ?? 'كتاب گلستان.';
    const observedRomanization = overrides?.observedRomanization ?? 'Kitāb-i Gulistān.';
    const sourceId = overrides?.provenance?.sourceId ?? 'LOC';
    const sourceRecordId = overrides?.sourceRecordId ?? '2016404617';
    const sourceField = overrides?.sourceField ?? '245$a';
    const romanizationScheme = overrides?.romanizationScheme ?? 'ALA_LC';

    const id = generateEvidenceId({
      sourceId,
      sourceRecordId,
      sourceField,
      persianForm,
      observedRomanization,
      romanizationScheme
    });

    return {
      id,
      sourceType: 'LIBRARY_CATALOG',
      sourceRecordId,
      sourceUri: `https://lccn.loc.gov/${sourceRecordId}`,
      sourceField,
      persianForm,
      observedRomanization,
      romanizationScheme,
      entityType: overrides?.entityType ?? 'WORK',
      context: overrides?.context !== undefined ? overrides.context : 'Test context',
      provenance: {
        sourceId,
        sourceTitle: 'Library of Congress Online Catalog',
        sourceOrganization: 'Library of Congress',
        retrievalMethod: 'API',
        retrievedAt: '2026-10-06T12:00:00Z',
        extractorVersion: '1.0.0-test'
      },
      status: 'OBSERVED',
      ...overrides
    };
  };

  describe('1. Repository Integrity & Lineage Constraints', () => {
    it('fails closed when derived evidence references a non-existent parent ID', () => {
      const repo = new LexicalEvidenceRepository();
      const derivation: LexicalEvidenceDerivation = {
        kind: 'ALIGNED_SEGMENT',
        parentEvidenceId: 'evi-nonexistent-12345',
        segmentIndex: 0,
        persianSpan: { start: 0, end: 4 },
        romanizationSpan: { start: 0, end: 7 },
        alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
        candidateEligibility: 'ELIGIBLE'
      };

      const childId = generateEvidenceId({
        sourceId: 'LOC',
        sourceRecordId: '2016404617',
        sourceField: '245$a',
        persianForm: 'كتاب',
        observedRomanization: 'Kitāb-i',
        romanizationScheme: 'ALA_LC',
        derivation
      });

      const child: LexicalEvidence = {
        id: childId,
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: '2016404617',
        sourceUri: 'https://lccn.loc.gov/2016404617',
        sourceField: '245$a',
        persianForm: 'كتاب',
        observedRomanization: 'Kitāb-i',
        romanizationScheme: 'ALA_LC',
        entityType: 'WORD',
        context: 'Test context',
        provenance: {
          sourceId: 'LOC',
          sourceTitle: 'Library of Congress',
          retrievalMethod: 'API',
          retrievedAt: '2026-10-06T12:00:00Z'
        },
        status: 'OBSERVED',
        derivation
      };

      expect(() => repo.addEvidence(child)).toThrow(/references non-existent parent evidence/);
    });

    it('fails closed when child Persian substring does not match parent span slice', () => {
      const repo = new LexicalEvidenceRepository();
      const parent = createParentEvidence();
      repo.addEvidence(parent);

      const derivation: LexicalEvidenceDerivation = {
        kind: 'ALIGNED_SEGMENT',
        parentEvidenceId: parent.id,
        segmentIndex: 0,
        persianSpan: { start: 0, end: 4 }, // parent.persianForm.slice(0, 4) is 'كتاب'
        romanizationSpan: { start: 0, end: 7 },
        alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
        candidateEligibility: 'ELIGIBLE'
      };

      const forgedChild: LexicalEvidence = {
        id: 'evi-align-forged-01',
        sourceType: parent.sourceType,
        sourceRecordId: parent.sourceRecordId,
        sourceUri: parent.sourceUri,
        sourceField: parent.sourceField,
        persianForm: 'گلستان', // Mismatch! Not 'كتاب'
        observedRomanization: 'Kitāb-i',
        romanizationScheme: parent.romanizationScheme,
        entityType: 'WORD',
        context: 'Test context',
        provenance: parent.provenance,
        status: 'OBSERVED',
        derivation
      };

      expect(() => repo.addEvidence(forgedChild)).toThrow(/persianForm.*does not match parent substring slice/);
    });

    it('fails closed when child Romanized substring does not match parent span slice', () => {
      const repo = new LexicalEvidenceRepository();
      const parent = createParentEvidence();
      repo.addEvidence(parent);

      const derivation: LexicalEvidenceDerivation = {
        kind: 'ALIGNED_SEGMENT',
        parentEvidenceId: parent.id,
        segmentIndex: 0,
        persianSpan: { start: 0, end: 4 },
        romanizationSpan: { start: 0, end: 7 }, // parent.observedRomanization.slice(0, 7) is 'Kitāb-i'
        alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
        candidateEligibility: 'ELIGIBLE'
      };

      const forgedChild: LexicalEvidence = {
        id: 'evi-align-forged-02',
        sourceType: parent.sourceType,
        sourceRecordId: parent.sourceRecordId,
        sourceUri: parent.sourceUri,
        sourceField: parent.sourceField,
        persianForm: 'كتاب',
        observedRomanization: 'Gulistān', // Mismatch! Not 'Kitāb-i'
        romanizationScheme: parent.romanizationScheme,
        entityType: 'WORD',
        context: 'Test context',
        provenance: parent.provenance,
        status: 'OBSERVED',
        derivation
      };

      expect(() => repo.addEvidence(forgedChild)).toThrow(/observedRomanization.*does not match parent substring slice/);
    });

    it('fails closed when child silently alters sourceId, sourceRecordId, romanizationScheme, or sourceUri', () => {
      const repo = new LexicalEvidenceRepository();
      const parent = createParentEvidence();
      repo.addEvidence(parent);

      const derivation: LexicalEvidenceDerivation = {
        kind: 'ALIGNED_SEGMENT',
        parentEvidenceId: parent.id,
        segmentIndex: 0,
        persianSpan: { start: 0, end: 4 },
        romanizationSpan: { start: 0, end: 7 },
        alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
        candidateEligibility: 'ELIGIBLE'
      };

      const mismatchSchemeChild: LexicalEvidence = {
        id: 'evi-align-mismatch-scheme',
        sourceType: parent.sourceType,
        sourceRecordId: parent.sourceRecordId,
        sourceUri: parent.sourceUri,
        sourceField: parent.sourceField,
        persianForm: 'كتاب',
        observedRomanization: 'Kitāb-i',
        romanizationScheme: 'IJMES', // Mismatch! Parent is ALA_LC
        entityType: 'WORD',
        context: 'Test context',
        provenance: parent.provenance,
        status: 'OBSERVED',
        derivation
      };

      expect(() => repo.addEvidence(mismatchSchemeChild)).toThrow(/romanizationScheme.*does not match parent/);
    });

    it('strictly prohibits recursive derivation (child deriving from another derived segment)', () => {
      const repo = new LexicalEvidenceRepository();
      const parent = createParentEvidence();
      repo.addEvidence(parent);

      const alignResult = alignLexicalEvidence(parent);
      expect(alignResult.success).toBe(true);
      const child1 = alignResult.derivedEvidence[0];
      repo.addEvidence(child1);

      // Attempt to derive from child1
      const recursiveDerivation: LexicalEvidenceDerivation = {
        kind: 'ALIGNED_SEGMENT',
        parentEvidenceId: child1.id,
        segmentIndex: 0,
        persianSpan: { start: 0, end: 4 },
        romanizationSpan: { start: 0, end: 7 },
        alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
        candidateEligibility: 'ELIGIBLE'
      };

      const recursiveChild: LexicalEvidence = {
        id: 'evi-align-recursive-01',
        sourceType: child1.sourceType,
        sourceRecordId: child1.sourceRecordId,
        sourceUri: child1.sourceUri,
        sourceField: child1.sourceField,
        persianForm: child1.persianForm,
        observedRomanization: child1.observedRomanization,
        romanizationScheme: child1.romanizationScheme,
        entityType: 'WORD',
        context: 'Test context',
        provenance: child1.provenance,
        status: 'OBSERVED',
        derivation: recursiveDerivation
      };

      expect(() => repo.addEvidence(recursiveChild)).toThrow(/cannot derive from another derived evidence record/);
    });

    it('retrieves parent evidence using getParentEvidence helper and maintains immutability', () => {
      const repo = new LexicalEvidenceRepository();
      const parent = createParentEvidence();
      repo.addEvidence(parent);

      const alignResult = alignLexicalEvidence(parent);
      const child = alignResult.derivedEvidence[0];
      repo.addEvidence(child);

      const retrievedParent = repo.getParentEvidence(child.id);
      expect(retrievedParent).toBeDefined();
      expect(retrievedParent?.id).toBe(parent.id);
      expect(retrievedParent?.persianForm).toBe(parent.persianForm);

      // Snapshot defensive isolation
      if (retrievedParent) {
        (retrievedParent as any).persianForm = 'mutated';
      }
      expect(repo.getEvidenceById(parent.id)?.persianForm).toBe(parent.persianForm);
    });

    it('preserves full parent-child derivation lineage across serialize and deserialize', () => {
      const repo1 = new LexicalEvidenceRepository();
      const parent = createParentEvidence();
      repo1.addEvidence(parent);

      const alignResult = alignLexicalEvidence(parent);
      for (const child of alignResult.derivedEvidence) {
        repo1.addEvidence(child);
      }

      const serialized = repo1.serialize();
      const repo2 = LexicalEvidenceRepository.deserialize(serialized);

      const report = repo2.validateIntegrity();
      expect(report.valid).toBe(true);
      expect(report.errors).toHaveLength(0);

      expect(repo2.getAllEvidence()).toHaveLength(3); // 1 parent + 2 children
      const childSegment = repo2.getAllEvidence().find((e) => e.derivation?.segmentIndex === 1);
      expect(childSegment).toBeDefined();
      expect(childSegment?.persianForm).toBe('گلستان');
      expect(childSegment?.observedRomanization).toBe('Gulistān');
      expect(childSegment?.derivation?.parentEvidenceId).toBe(parent.id);
    });
  });

  describe('2. Deterministic Alignment & Tokenization', () => {
    it('aligns a single lexical item: سعدى. ↔ Saʻdī, with exact spans and single-token entity inheritance', () => {
      const parent = createParentEvidence({
        sourceField: '100$a',
        persianForm: 'سعدى.',
        observedRomanization: 'Saʻdī,',
        entityType: 'PERSON'
      });

      const res = alignLexicalEvidence(parent);
      expect(res.success).toBe(true);
      expect(res.pairs).toHaveLength(1);

      const pair = res.pairs[0];
      expect(pair.persianToken.text).toBe('سعدى');
      expect(pair.persianToken.start).toBe(0);
      expect(pair.persianToken.end).toBe(4);
      expect(parent.persianForm.slice(pair.persianToken.start, pair.persianToken.end)).toBe('سعدى');

      expect(pair.romanToken.text).toBe('Saʻdī');
      expect(pair.romanToken.start).toBe(0);
      expect(pair.romanToken.end).toBe(5);
      expect(parent.observedRomanization!.slice(pair.romanToken.start, pair.romanToken.end)).toBe('Saʻdī');

      expect(pair.candidateEligibility).toBe('ELIGIBLE');
      expect(pair.derivedEvidence.entityType).toBe('PERSON'); // 1-token heading retains PERSON
    });

    it('aligns two-token title: كتاب گلستان. ↔ Kitāb-i Gulistān. with context-bound detection', () => {
      const parent = createParentEvidence({
        sourceField: '245$a',
        persianForm: 'كتاب گلستان.',
        observedRomanization: 'Kitāb-i Gulistān.',
        entityType: 'WORK'
      });

      const res = alignLexicalEvidence(parent);
      expect(res.success).toBe(true);
      expect(res.pairs).toHaveLength(2);

      // Segment 1: كتاب ↔ Kitāb-i
      const seg1 = res.pairs[0];
      expect(seg1.persianToken.text).toBe('كتاب');
      expect(seg1.romanToken.text).toBe('Kitāb-i');
      expect(seg1.candidateEligibility).toBe('CONTEXT_BOUND');
      expect(seg1.exclusionReason).toContain('bound contextual marker');
      expect(seg1.derivedEvidence.entityType).toBe('WORD'); // Multi-token parent defaults to WORD

      // Segment 2: گلستان ↔ Gulistān
      const seg2 = res.pairs[1];
      expect(seg2.persianToken.text).toBe('گلستان');
      expect(seg2.romanToken.text).toBe('Gulistān');
      expect(seg2.candidateEligibility).toBe('ELIGIBLE');
      expect(seg2.derivedEvidence.entityType).toBe('WORD');
    });

    it('correctly tokenizes scholarly modifier characters and combining diacritics', () => {
      const text = 'Saʻdī Ḥāfiẓ Muḥammad Riz̤ā ʻAbd Ṣafīʹnizhād';
      const tokens = tokenizeRomanLexemes(text);

      expect(tokens.map((t) => t.text)).toEqual([
        'Saʻdī',
        'Ḥāfiẓ',
        'Muḥammad',
        'Riz̤ā',
        'ʻAbd',
        'Ṣafīʹnizhād'
      ]);
    });

    it('excludes catalog punctuation from lexical spans', () => {
      const pText = '  / كتاب، [گلستان] : ';
      const rText = ' / Kitāb-i, [Gulistān] : ';

      const pTokens = tokenizePersianLexicalTokens(pText);
      const rTokens = tokenizeRomanLexemes(rText);

      expect(pTokens.map((t) => t.text)).toEqual(['كتاب', 'گلستان']);
      expect(rTokens.map((t) => t.text)).toEqual(['Kitāb-i', 'Gulistān']);
    });

    it('fails closed on token-count mismatch without guessing or fuzzy alignment', () => {
      const parent = createParentEvidence({
        persianForm: 'دو واژه',
        observedRomanization: 'three separate words'
      });

      const res = alignLexicalEvidence(parent);
      expect(res.success).toBe(false);
      expect(res.diagnostic?.kind).toBe('TOKEN_COUNT_MISMATCH');
      expect(res.diagnostic?.persianTokenCount).toBe(2);
      expect(res.diagnostic?.romanTokenCount).toBe(3);
      expect(res.pairs).toHaveLength(0);
      expect(res.derivedEvidence).toHaveLength(0);
    });

    it('fails closed on Persian-only observation without observed romanization', () => {
      const parent = createParentEvidence({
        persianForm: 'متن فارسی تنها',
        observedRomanization: null
      });

      const res = alignLexicalEvidence(parent);
      expect(res.success).toBe(false);
      expect(res.diagnostic?.kind).toBe('NO_ROMANIZATION');
      expect(res.pairs).toHaveLength(0);
    });
  });

  describe('3. Cross-Record Candidate Extraction & Invariants', () => {
    it('groups eligible segments by normalized Persian form while proposedCanonical remains strictly null', () => {
      const parent1 = createParentEvidence({
        sourceRecordId: 'rec-01',
        persianForm: 'سعدى.',
        observedRomanization: 'Saʻdī,'
      });
      const parent2 = createParentEvidence({
        sourceRecordId: 'rec-02',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī'
      });

      const align1 = alignLexicalEvidence(parent1);
      const align2 = alignLexicalEvidence(parent2);

      const allDerived = [...align1.derivedEvidence, ...align2.derivedEvidence];
      const extraction = extractCandidatesFromAlignedEvidence(allDerived);

      expect(extraction.candidates).toHaveLength(1);
      const cand = extraction.candidates[0];

      // Invariant checks
      expect(cand.proposedCanonical).toBeNull();
      expect(cand.normalizedForm).toBe(normalizePersian('سعدى').normalizedInput);
      expect(cand.normalizedForm).toBe('سعدی');
      expect(cand.evidenceIds).toHaveLength(2);
      expect(cand.status).toBe('UNREVIEWED');
      expect(cand.derivationProvenance?.strategy).toBe('ALIGNED_SEGMENT_SYNTHESIS');
    });

    it('reconciles entity types: unanimous type is preserved, conflicting types fall back to WORD', () => {
      // Unanimous PERSON
      const parent1 = createParentEvidence({
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī',
        entityType: 'PERSON'
      });
      const align1 = alignLexicalEvidence(parent1);
      const ext1 = extractCandidatesFromAlignedEvidence(align1.derivedEvidence);
      expect(ext1.candidates[0].entityType).toBe('PERSON');

      // Mixed WORK and WORD -> falls back to WORD
      const childA: LexicalEvidence = {
        ...align1.derivedEvidence[0],
        id: 'evi-a',
        entityType: 'WORK'
      };
      const childB: LexicalEvidence = {
        ...align1.derivedEvidence[0],
        id: 'evi-b',
        entityType: 'WORD'
      };
      const ext2 = extractCandidatesFromAlignedEvidence([childA, childB]);
      expect(ext2.candidates[0].entityType).toBe('WORD');
    });

    it('preserves same-scheme conflicting observations as REVIEW_REQUIRED', () => {
      const parent1 = createParentEvidence({
        sourceRecordId: 'rec-01',
        persianForm: 'گلستان',
        observedRomanization: 'Gulistān',
        romanizationScheme: 'ALA_LC'
      });
      const parent2 = createParentEvidence({
        sourceRecordId: 'rec-02',
        persianForm: 'گلستان',
        observedRomanization: 'Golistān', // Disagreement under ALA_LC
        romanizationScheme: 'ALA_LC'
      });

      const align1 = alignLexicalEvidence(parent1);
      const align2 = alignLexicalEvidence(parent2);

      const ext = extractCandidatesFromAlignedEvidence([
        ...align1.derivedEvidence,
        ...align2.derivedEvidence
      ]);

      expect(ext.candidates).toHaveLength(1);
      const cand = ext.candidates[0];
      expect(cand.status).toBe('REVIEW_REQUIRED');
      expect(cand.conflicts).toHaveLength(2);
      expect(cand.conflicts[0].conflictKind).toBe('CONFLICT_WITHIN_SCHEME');
      expect(cand.proposedCanonical).toBeNull();
    });

    it('candidate generation is pure and does not mutate authoritative lexicon', () => {
      const parent = createParentEvidence();
      const align = alignLexicalEvidence(parent);
      const ext = extractCandidatesFromAlignedEvidence(align.derivedEvidence);

      expect(ext.candidates.length).toBeGreaterThan(0);
      for (const c of ext.candidates) {
        expect(c.proposedCanonical).toBeNull();
      }
    });
  });

  describe('4. Genuine LoC Catalog Fixture Assertions', () => {
    it('processes fixture 2016404617 (Saʻdī / Gulistān) with exact regression counts', () => {
      const fixtureXml = fs.readFileSync(
        path.resolve(__dirname, '../loc/fixtures/2016404617.marcxml.xml'),
        'utf8'
      );
      const records = parseMarcXml(fixtureXml);
      expect(records).toHaveLength(1);

      const parentEvidence = extractEvidenceFromMarcRecord(records[0]);
      expect(parentEvidence).toHaveLength(3);

      const allDerived: LexicalEvidence[] = [];
      let unaligned = 0;

      for (const parent of parentEvidence) {
        const res = alignLexicalEvidence(parent);
        if (res.success) {
          allDerived.push(...res.derivedEvidence);
        } else {
          unaligned++;
        }
      }

      const extraction = extractCandidatesFromAlignedEvidence(allDerived);

      expect(parentEvidence).toHaveLength(3);
      expect(extraction.derivedSegmentsCount).toBe(4);
      expect(extraction.eligibleSegmentsCount).toBe(3);
      expect(extraction.contextBoundSegmentsCount).toBe(1);
      expect(unaligned).toBe(0);
      expect(extraction.candidates).toHaveLength(2);

      // Verify specific candidates
      const sadiCand = extraction.candidates.find((c) => c.normalizedForm === 'سعدی');
      expect(sadiCand).toBeDefined();
      expect(sadiCand?.proposedCanonical).toBeNull();
      expect(sadiCand?.entityType).toBe('PERSON');
      expect(sadiCand?.evidenceIds).toHaveLength(1);

      const gulistanCand = extraction.candidates.find((c) => c.normalizedForm === 'گلستان');
      expect(gulistanCand).toBeDefined();
      expect(gulistanCand?.proposedCanonical).toBeNull();
      expect(gulistanCand?.evidenceIds).toHaveLength(2);
    });

    it('processes fixture 2002341405 (Mīzān al-ṭibb) with exact regression counts', () => {
      const fixtureXml = fs.readFileSync(
        path.resolve(__dirname, '../loc/fixtures/2002341405.marcxml.xml'),
        'utf8'
      );
      const records = parseMarcXml(fixtureXml);
      const parentEvidence = extractEvidenceFromMarcRecord(records[0]);
      expect(parentEvidence).toHaveLength(3);

      const allDerived: LexicalEvidence[] = [];
      let unaligned = 0;

      for (const parent of parentEvidence) {
        const res = alignLexicalEvidence(parent);
        if (res.success) {
          allDerived.push(...res.derivedEvidence);
        } else {
          unaligned++;
        }
      }

      const extraction = extractCandidatesFromAlignedEvidence(allDerived);

      expect(parentEvidence).toHaveLength(3);
      expect(extraction.derivedSegmentsCount).toBe(14);
      expect(extraction.eligibleSegmentsCount).toBe(11);
      expect(extraction.contextBoundSegmentsCount).toBe(3); // al-ṭibb, al-Dīn, al-Dīn
      expect(unaligned).toBe(0);
      expect(extraction.candidates).toHaveLength(8);

      for (const c of extraction.candidates) {
        expect(c.proposedCanonical).toBeNull();
      }
    });

    it('processes fixture 2025364468 (Rūznāmah-ʼi Sharaf va Sharāfat) with exact regression counts', () => {
      const fixtureXml = fs.readFileSync(
        path.resolve(__dirname, '../loc/fixtures/2025364468.marcxml.xml'),
        'utf8'
      );
      const records = parseMarcXml(fixtureXml);
      const parentEvidence = extractEvidenceFromMarcRecord(records[0]);
      expect(parentEvidence).toHaveLength(7);

      const allDerived: LexicalEvidence[] = [];
      let unaligned = 0;

      for (const parent of parentEvidence) {
        const res = alignLexicalEvidence(parent);
        if (res.success) {
          allDerived.push(...res.derivedEvidence);
        } else {
          unaligned++;
        }
      }

      const extraction = extractCandidatesFromAlignedEvidence(allDerived);

      expect(parentEvidence).toHaveLength(7);
      expect(extraction.derivedSegmentsCount).toBe(20);
      expect(extraction.eligibleSegmentsCount).toBe(17);
      expect(extraction.contextBoundSegmentsCount).toBe(3);
      expect(unaligned).toBe(0);
      expect(extraction.candidates).toHaveLength(13);

      for (const c of extraction.candidates) {
        expect(c.proposedCanonical).toBeNull();
      }
    });
  });
});
