import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateEvidenceId } from '../candidate';
import { extractEvidenceFromMarcRecord } from '../loc/extractor';
import { parseMarcXml } from '../loc/xmlParser';
import { LexicalEvidenceRepository } from '../repository';
import {
  LexicalEvidence,
  LexicalEvidenceDerivation
} from '../types';
import { processEvidenceAlignmentBatch } from './batchOrchestrator';
import { extractCandidatesFromAlignedEvidence } from './candidateExtractor';
import { CONTEXT_BOUND_HYPHEN_REASON } from './eligibilityClassifier';
import { tokenizePersianLexicalTokens } from './persianLexicalTokenizer';
import { alignLexicalEvidence } from './positionalAligner';
import { tokenizeRomanLexemes } from './romanLexemeTokenizer';

describe('Phase 5C: Lexical Alignment & Candidate Extraction', () => {
  const createParentEvidence = (overrides?: Partial<LexicalEvidence>): LexicalEvidence => {
    const persianForm = overrides?.persianForm ?? 'كتاب گلستان.';
    const observedRomanization = overrides?.observedRomanization !== undefined ? overrides.observedRomanization : 'Kitāb-i Gulistān.';
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
      romanizationScheme
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
      entityType: overrides?.entityType ?? 'WORK',
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
        candidateEligibility: 'CONTEXT_BOUND',
        exclusionReason: CONTEXT_BOUND_HYPHEN_REASON
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
          sourceTitle: 'Library of Congress Online Catalog',
          sourceOrganization: 'Library of Congress',
          retrievalMethod: 'API',
          retrievedAt: '2026-10-06T12:00:00Z',
          extractorVersion: '1.0.0-test'
        },
        status: 'OBSERVED',
        derivation
      };

      expect(() => repo.addEvidence(child)).toThrow(/references non-existent parent evidence/);
    });

    it('fails closed when parent has no observed romanization', () => {
      const repo = new LexicalEvidenceRepository();
      const parent = createParentEvidence({
        persianForm: 'متن بدون نویسه‌گردانی',
        observedRomanization: null
      });
      repo.addEvidence(parent);

      const derivation: LexicalEvidenceDerivation = {
        kind: 'ALIGNED_SEGMENT',
        parentEvidenceId: parent.id,
        segmentIndex: 0,
        persianSpan: { start: 0, end: 3 },
        romanizationSpan: { start: 0, end: 3 },
        alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
        candidateEligibility: 'ELIGIBLE'
      };

      const child: LexicalEvidence = {
        id: 'evi-align-no-rom-child',
        sourceType: parent.sourceType,
        sourceRecordId: parent.sourceRecordId,
        sourceUri: parent.sourceUri,
        sourceField: parent.sourceField,
        persianForm: 'متن',
        observedRomanization: 'matn',
        romanizationScheme: parent.romanizationScheme,
        entityType: 'WORD',
        context: 'Test context',
        provenance: parent.provenance,
        status: 'OBSERVED',
        derivation
      };

      expect(() => repo.addEvidence(child)).toThrow(/cannot derive aligned segment evidence from parent.*because parent has no observed romanization/);
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
        candidateEligibility: 'CONTEXT_BOUND',
        exclusionReason: CONTEXT_BOUND_HYPHEN_REASON
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

    it('fails closed when derived evidence falsely claims ELIGIBLE for context-bound form', () => {
      const repo = new LexicalEvidenceRepository();
      const parent = createParentEvidence();
      repo.addEvidence(parent);

      // Child observedRomanization is 'Kitāb-i' (contains hyphen), but falsely claims candidateEligibility: 'ELIGIBLE'
      const forgedDerivation: LexicalEvidenceDerivation = {
        kind: 'ALIGNED_SEGMENT',
        parentEvidenceId: parent.id,
        segmentIndex: 0,
        persianSpan: { start: 0, end: 4 },
        romanizationSpan: { start: 0, end: 7 },
        alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
        candidateEligibility: 'ELIGIBLE' // Forged!
      };

      const forgedChild: LexicalEvidence = {
        id: 'evi-align-forged-eligible',
        sourceType: parent.sourceType,
        sourceRecordId: parent.sourceRecordId,
        sourceUri: parent.sourceUri,
        sourceField: parent.sourceField,
        persianForm: 'كتاب',
        observedRomanization: 'Kitāb-i',
        romanizationScheme: parent.romanizationScheme,
        entityType: 'WORD',
        context: 'Test context',
        provenance: parent.provenance,
        status: 'OBSERVED',
        derivation: forgedDerivation
      };

      expect(() => repo.addEvidence(forgedChild)).toThrow(/declared candidateEligibility "ELIGIBLE" does not match deterministic classification "CONTEXT_BOUND"/);
    });

    it('fails closed when derived evidence falsely claims CONTEXT_BOUND for simple eligible form', () => {
      const repo = new LexicalEvidenceRepository();
      const parent = createParentEvidence();
      repo.addEvidence(parent);

      // Child observedRomanization is 'Gulistān' (simple), but falsely claims candidateEligibility: 'CONTEXT_BOUND'
      const forgedDerivation: LexicalEvidenceDerivation = {
        kind: 'ALIGNED_SEGMENT',
        parentEvidenceId: parent.id,
        segmentIndex: 1,
        persianSpan: { start: 5, end: 11 },
        romanizationSpan: { start: 8, end: 16 },
        alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
        candidateEligibility: 'CONTEXT_BOUND', // Forged!
        exclusionReason: CONTEXT_BOUND_HYPHEN_REASON
      };

      const forgedChild: LexicalEvidence = {
        id: 'evi-align-forged-bound',
        sourceType: parent.sourceType,
        sourceRecordId: parent.sourceRecordId,
        sourceUri: parent.sourceUri,
        sourceField: parent.sourceField,
        persianForm: 'گلستان',
        observedRomanization: 'Gulistān',
        romanizationScheme: parent.romanizationScheme,
        entityType: 'WORD',
        context: 'Test context',
        provenance: parent.provenance,
        status: 'OBSERVED',
        derivation: forgedDerivation
      };

      expect(() => repo.addEvidence(forgedChild)).toThrow(/declared candidateEligibility "CONTEXT_BOUND" does not match deterministic classification "ELIGIBLE"/);
    });

    it('fails closed when child alters sourceType, sourceField, sourceRecordId, romanizationScheme, or provenance', () => {
      const repo = new LexicalEvidenceRepository();
      const parent = createParentEvidence();
      repo.addEvidence(parent);

      const baseDerivation: LexicalEvidenceDerivation = {
        kind: 'ALIGNED_SEGMENT',
        parentEvidenceId: parent.id,
        segmentIndex: 1,
        persianSpan: { start: 5, end: 11 },
        romanizationSpan: { start: 8, end: 16 },
        alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
        candidateEligibility: 'ELIGIBLE'
      };

      // 1. Mismatched sourceType
      const mismatchType: LexicalEvidence = {
        id: 'evi-align-mismatch-type',
        sourceType: 'ENCYCLOPEDIA', // Parent is LIBRARY_CATALOG
        sourceRecordId: parent.sourceRecordId,
        sourceUri: parent.sourceUri,
        sourceField: parent.sourceField,
        persianForm: 'گلستان',
        observedRomanization: 'Gulistān',
        romanizationScheme: parent.romanizationScheme,
        entityType: 'WORD',
        context: 'Test context',
        provenance: parent.provenance,
        status: 'OBSERVED',
        derivation: baseDerivation
      };
      expect(() => repo.addEvidence(mismatchType)).toThrow(/sourceType.*does not match parent/);

      // 2. Mismatched sourceField
      const mismatchField: LexicalEvidence = {
        ...mismatchType,
        id: 'evi-align-mismatch-field',
        sourceType: parent.sourceType,
        sourceField: '650$a' // Parent is 245$a
      };
      expect(() => repo.addEvidence(mismatchField)).toThrow(/sourceField.*does not match parent/);

      // 3. Mismatched romanizationScheme
      const mismatchScheme: LexicalEvidence = {
        ...mismatchType,
        id: 'evi-align-mismatch-scheme',
        sourceType: parent.sourceType,
        sourceField: parent.sourceField,
        romanizationScheme: 'IJMES' // Parent is ALA_LC
      };
      expect(() => repo.addEvidence(mismatchScheme)).toThrow(/romanizationScheme.*does not match parent/);

      // 4. Mismatched extractorVersion
      const mismatchExtractor: LexicalEvidence = {
        ...mismatchType,
        id: 'evi-align-mismatch-extractor',
        sourceType: parent.sourceType,
        sourceField: parent.sourceField,
        provenance: {
          ...parent.provenance,
          extractorVersion: 'overwritten-version-2.0'
        }
      };
      expect(() => repo.addEvidence(mismatchExtractor)).toThrow(/extractorVersion.*does not match parent/);
    });

    it('strictly prohibits recursive derivation (child deriving from another derived segment)', () => {
      const repo = new LexicalEvidenceRepository();
      const parent = createParentEvidence();
      repo.addEvidence(parent);

      const alignResult = alignLexicalEvidence(parent);
      expect(alignResult.success).toBe(true);
      const child1 = alignResult.derivedEvidence[1]; // Gulistān
      repo.addEvidence(child1);

      // Attempt to derive from child1
      const recursiveDerivation: LexicalEvidenceDerivation = {
        kind: 'ALIGNED_SEGMENT',
        parentEvidenceId: child1.id,
        segmentIndex: 0,
        persianSpan: { start: 0, end: 6 },
        romanizationSpan: { start: 0, end: 8 },
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

    it('preserves external extraction provenance in child.provenance while derivation records aligner metadata', () => {
      const parent = createParentEvidence({
        provenance: {
          sourceId: 'LOC',
          sourceTitle: 'Library of Congress Catalog',
          retrievalMethod: 'API',
          retrievedAt: '2026-10-06T10:00:00Z',
          extractorVersion: 'loc-connector-1.0.0'
        }
      });

      const res = alignLexicalEvidence(parent, {
        alignerVersion: 'positional-aligner-1.0.0',
        derivedAt: '2026-10-06T11:00:00Z'
      });

      expect(res.success).toBe(true);
      const child = res.derivedEvidence[0];

      // External provenance is strictly preserved
      expect(child.provenance.extractorVersion).toBe('loc-connector-1.0.0');
      expect(child.provenance.retrievedAt).toBe('2026-10-06T10:00:00Z');

      // Derivation provenance records alignment details
      expect(child.derivation?.alignerVersion).toBe('positional-aligner-1.0.0');
      expect(child.derivation?.derivedAt).toBe('2026-10-06T11:00:00Z');
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
    it('guarantees input-order invariance and stable normalized candidate identity', () => {
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

      const eviA = align1.derivedEvidence[0];
      const eviB = align2.derivedEvidence[0];

      // Forward order
      const extForward = extractCandidatesFromAlignedEvidence([eviA, eviB], [parent1, parent2], {
        derivedAt: '2026-10-06T12:00:00Z'
      });

      // Reversed order
      const extReversed = extractCandidatesFromAlignedEvidence([eviB, eviA], [parent1, parent2], {
        derivedAt: '2026-10-06T12:00:00Z'
      });

      expect(extForward.candidates).toHaveLength(1);
      expect(extReversed.candidates).toHaveLength(1);

      const candF = extForward.candidates[0];
      const candR = extReversed.candidates[0];

      // Strict identity and ordering invariance
      expect(candF.id).toBe(candR.id);
      expect(candF.persianForm).toBe('سعدی');
      expect(candR.persianForm).toBe('سعدی');
      expect(candF.normalizedForm).toBe('سعدی');
      expect(candR.normalizedForm).toBe('سعدی');
      expect(candF.evidenceIds).toEqual(candR.evidenceIds);
      expect(candF.status).toBe(candR.status);
      expect(candF.proposedCanonical).toBeNull();
      expect(candR.proposedCanonical).toBeNull();
    });

    it('guarantees idempotency with respect to duplicate evidence in input', () => {
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

      const eviA = align1.derivedEvidence[0];
      const eviB = align2.derivedEvidence[0];

      const extUnique = extractCandidatesFromAlignedEvidence([eviA, eviB], [parent1, parent2], {
        derivedAt: '2026-10-06T12:00:00Z'
      });
      const extDuplicates = extractCandidatesFromAlignedEvidence([eviA, eviB, eviA, eviB, eviA], [parent1, parent2], {
        derivedAt: '2026-10-06T12:00:00Z'
      });

      expect(extUnique.candidates).toHaveLength(1);
      expect(extDuplicates.candidates).toHaveLength(1);

      expect(extDuplicates.candidates[0].id).toBe(extUnique.candidates[0].id);
      expect(extDuplicates.candidates[0].evidenceIds).toEqual(extUnique.candidates[0].evidenceIds);
      expect(extDuplicates.candidates[0].evidenceIds).toHaveLength(2);
    });

    it('fails closed when candidate extractor receives fabricated parentless derived evidence', () => {
      const derivation: LexicalEvidenceDerivation = {
        kind: 'ALIGNED_SEGMENT',
        parentEvidenceId: 'evi-nonexistent-99999',
        segmentIndex: 0,
        persianSpan: { start: 0, end: 4 },
        romanizationSpan: { start: 0, end: 5 },
        alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
        candidateEligibility: 'ELIGIBLE'
      };

      const fabricatedChild: LexicalEvidence = {
        id: generateEvidenceId({
          sourceId: 'LOC',
          sourceRecordId: '2016404617',
          sourceField: '245$a',
          persianForm: 'سعدی',
          observedRomanization: 'Saʻdī',
          romanizationScheme: 'ALA_LC',
          derivation
        }),
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: '2016404617',
        sourceUri: 'https://lccn.loc.gov/2016404617',
        sourceField: '245$a',
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī',
        romanizationScheme: 'ALA_LC',
        entityType: 'PERSON',
        context: 'Test context',
        provenance: {
          sourceId: 'LOC',
          sourceTitle: 'Library of Congress Online Catalog',
          sourceOrganization: 'Library of Congress',
          retrievalMethod: 'API',
          retrievedAt: '2026-10-06T12:00:00Z',
          extractorVersion: '1.0.0-test'
        },
        status: 'OBSERVED',
        derivation
      };

      // Empty parent lookup / no parent
      expect(() => extractCandidatesFromAlignedEvidence([fabricatedChild], [])).toThrow(
        /references non-existent parent evidence "evi-nonexistent-99999"/
      );
    });

    it('fails closed when candidate extractor receives Persian span mismatch against parent', () => {
      const parent = createParentEvidence();
      const align = alignLexicalEvidence(parent);
      const child = align.derivedEvidence[1]; // Gulistān

      const forgedChild: LexicalEvidence = {
        ...child,
        persianForm: 'بوستان' // Mismatch against parent slice!
      };

      expect(() => extractCandidatesFromAlignedEvidence([forgedChild], [parent])).toThrow(
        /persianForm "بوستان" does not match parent substring slice/
      );
    });

    it('fails closed when candidate extractor receives Roman span mismatch against parent', () => {
      const parent = createParentEvidence();
      const align = alignLexicalEvidence(parent);
      const child = align.derivedEvidence[1]; // Gulistān

      const forgedChild: LexicalEvidence = {
        ...child,
        observedRomanization: 'Būstān' // Mismatch against parent slice!
      };

      expect(() => extractCandidatesFromAlignedEvidence([forgedChild], [parent])).toThrow(
        /observedRomanization "Būstān" does not match parent substring slice/
      );
    });

    it('fails closed when candidate extractor receives sourceType or sourceField mismatch against parent', () => {
      const parent = createParentEvidence();
      const align = alignLexicalEvidence(parent);
      const child = align.derivedEvidence[1];

      const forgedTypeChild: LexicalEvidence = {
        ...child,
        sourceType: 'SCHOLARLY_DICTIONARY'
      };
      expect(() => extractCandidatesFromAlignedEvidence([forgedTypeChild], [parent])).toThrow(
        /sourceType "SCHOLARLY_DICTIONARY" does not match parent sourceType "LIBRARY_CATALOG"/
      );

      const forgedFieldChild: LexicalEvidence = {
        ...child,
        sourceField: '650$a'
      };
      expect(() => extractCandidatesFromAlignedEvidence([forgedFieldChild], [parent])).toThrow(
        /sourceField "650\$a" does not match parent sourceField "245\$a"/
      );
    });

    it('fails closed when candidate extractor receives recursive derived parent', () => {
      const parent = createParentEvidence();
      const align = alignLexicalEvidence(parent);
      const child1 = align.derivedEvidence[1]; // derived child

      // Attempt to extract candidates from a secondary child deriving from child1
      const recursiveChild: LexicalEvidence = {
        id: 'evi-recursive-child-cand',
        sourceType: child1.sourceType,
        sourceRecordId: child1.sourceRecordId,
        sourceUri: child1.sourceUri,
        sourceField: child1.sourceField,
        persianForm: child1.persianForm,
        observedRomanization: child1.observedRomanization,
        romanizationScheme: child1.romanizationScheme,
        entityType: 'WORD',
        context: child1.context,
        provenance: child1.provenance,
        status: 'OBSERVED',
        derivation: {
          kind: 'ALIGNED_SEGMENT',
          parentEvidenceId: child1.id,
          segmentIndex: 0,
          persianSpan: { start: 0, end: 6 },
          romanizationSpan: { start: 0, end: 8 },
          alignmentStrategy: 'POSITIONAL_EQUAL_COUNT',
          candidateEligibility: 'ELIGIBLE'
        }
      };

      // Providing child1 as parent lookup should fail because child1 is itself derived
      expect(() => extractCandidatesFromAlignedEvidence([recursiveChild], [child1])).toThrow(
        /cannot derive from another derived evidence record/
      );
    });

    it('fails closed when candidate extractor receives forged or malformed derived evidence eligibility', () => {
      const parent = createParentEvidence();
      const align = alignLexicalEvidence(parent);
      const child = align.derivedEvidence[0]; // Kitāb-i (CONTEXT_BOUND)

      // Forge child with declared ELIGIBLE
      const forgedChild: LexicalEvidence = {
        ...child,
        derivation: {
          ...child.derivation!,
          candidateEligibility: 'ELIGIBLE'
        }
      };

      expect(() => extractCandidatesFromAlignedEvidence([forgedChild], [parent])).toThrow(
        /declared candidateEligibility "ELIGIBLE" does not match deterministic classification "CONTEXT_BOUND"/
      );
    });

    it('includes alignerVersion in deterministic derived evidence ID but excludes derivedAt', () => {
      const parent = createParentEvidence();
      
      const alignV1 = alignLexicalEvidence(parent, {
        alignerVersion: 'aligner-v1.0.0',
        derivedAt: '2026-10-06T10:00:00Z'
      });
      const alignV1DifferentTime = alignLexicalEvidence(parent, {
        alignerVersion: 'aligner-v1.0.0',
        derivedAt: '2026-10-06T15:30:00Z'
      });
      const alignV2 = alignLexicalEvidence(parent, {
        alignerVersion: 'aligner-v2.0.0',
        derivedAt: '2026-10-06T10:00:00Z'
      });

      const childV1_a = alignV1.derivedEvidence[1];
      const childV1_b = alignV1DifferentTime.derivedEvidence[1];
      const childV2 = alignV2.derivedEvidence[1];

      // Same alignment + same alignerVersion + different derivedAt -> SAME evidence ID
      expect(childV1_a.id).toBe(childV1_b.id);

      // Same alignment + different alignerVersion -> DIFFERENT evidence ID
      expect(childV1_a.id).not.toBe(childV2.id);
    });

    it('treats same alignment with different derivedAt as idempotent repository ingestion', () => {
      const repo = new LexicalEvidenceRepository();
      const parent = createParentEvidence();
      repo.addEvidence(parent);

      const alignRun1 = alignLexicalEvidence(parent, {
        alignerVersion: 'aligner-v1.0.0',
        derivedAt: '2026-10-06T10:00:00Z'
      });
      const alignRun2 = alignLexicalEvidence(parent, {
        alignerVersion: 'aligner-v1.0.0',
        derivedAt: '2026-10-06T18:00:00Z'
      });

      const child1 = alignRun1.derivedEvidence[1];
      const child2 = alignRun2.derivedEvidence[1];

      expect(child1.id).toBe(child2.id);
      expect(child1.derivation?.derivedAt).toBe('2026-10-06T10:00:00Z');
      expect(child2.derivation?.derivedAt).toBe('2026-10-06T18:00:00Z');

      // First ingestion
      repo.addEvidence(child1);
      expect(repo.getEvidenceCount()).toBe(2); // parent + 1 child

      // Re-ingestion of run 2 with different timestamp succeeds idempotently
      expect(() => repo.addEvidence(child2)).not.toThrow();
      expect(repo.getEvidenceCount()).toBe(2);

      // Stored record preserves original derivedAt without alteration
      const stored = repo.getEvidenceById(child1.id);
      expect(stored?.derivation?.derivedAt).toBe('2026-10-06T10:00:00Z');
    });

    it('strictly preserves and validates full external extraction provenance', () => {
      const parent = createParentEvidence({
        provenance: {
          sourceId: 'LOC',
          sourceTitle: 'Library of Congress Catalog',
          sourceOrganization: 'Library of Congress',
          retrievalMethod: 'API',
          retrievedAt: '2026-10-06T09:00:00Z',
          extractorVersion: 'loc-connector-1.5.0',
          notes: 'Standard catalog extraction'
        }
      });

      const alignRes = alignLexicalEvidence(parent, {
        alignerVersion: 'aligner-v1.0.0',
        derivedAt: '2026-10-06T12:00:00Z'
      });

      const child = alignRes.derivedEvidence[1];

      // External provenance exactly matches parent
      expect(child.provenance.sourceId).toBe('LOC');
      expect(child.provenance.sourceTitle).toBe('Library of Congress Catalog');
      expect(child.provenance.sourceOrganization).toBe('Library of Congress');
      expect(child.provenance.retrievalMethod).toBe('API');
      expect(child.provenance.retrievedAt).toBe('2026-10-06T09:00:00Z');
      expect(child.provenance.extractorVersion).toBe('loc-connector-1.5.0');
      expect(child.provenance.notes).toBe('Standard catalog extraction');

      // Derivation provenance holds alignment-specific metadata
      expect(child.derivation?.alignerVersion).toBe('aligner-v1.0.0');
      expect(child.derivation?.derivedAt).toBe('2026-10-06T12:00:00Z');

      // Candidate extraction validates these provenance fields
      const extRes = extractCandidatesFromAlignedEvidence([child], [parent]);
      expect(extRes.candidates).toHaveLength(1);
    });

    it('reconciles entity types: unanimous type is preserved, conflicting types fall back to WORD', () => {
      // Unanimous PERSON
      const parent1 = createParentEvidence({
        persianForm: 'سعدی',
        observedRomanization: 'Saʻdī',
        entityType: 'PERSON'
      });
      const align1 = alignLexicalEvidence(parent1);
      const ext1 = extractCandidatesFromAlignedEvidence(align1.derivedEvidence, [parent1]);
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
      const ext2 = extractCandidatesFromAlignedEvidence([childA, childB], [parent1]);
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

      const ext = extractCandidatesFromAlignedEvidence(
        [...align1.derivedEvidence, ...align2.derivedEvidence],
        [parent1, parent2]
      );

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
      const ext = extractCandidatesFromAlignedEvidence(align.derivedEvidence, [parent]);

      expect(ext.candidates.length).toBeGreaterThan(0);
      for (const c of ext.candidates) {
        expect(c.proposedCanonical).toBeNull();
      }
    });

    it('batch orchestrator processEvidenceAlignmentBatch returns truthful batch-level metrics', () => {
      const parent1 = createParentEvidence({
        persianForm: 'سعدى.',
        observedRomanization: 'Saʻdī,'
      });
      const parent2 = createParentEvidence({
        persianForm: 'دو واژه',
        observedRomanization: 'three separate words' // Token count mismatch
      });

      const batchResult = processEvidenceAlignmentBatch([parent1, parent2]);

      expect(batchResult.parentObservationsCount).toBe(2);
      expect(batchResult.unalignedObservationsCount).toBe(1);
      expect(batchResult.derivedSegmentsCount).toBe(1);
      expect(batchResult.eligibleSegmentsCount).toBe(1);
      expect(batchResult.contextBoundSegmentsCount).toBe(0);
      expect(batchResult.candidateGroupsCount).toBe(1);
      expect(batchResult.candidates).toHaveLength(1);
      expect(batchResult.candidates[0].persianForm).toBe('سعدی');
      expect(batchResult.candidates[0].proposedCanonical).toBeNull();
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

      const batchResult = processEvidenceAlignmentBatch(parentEvidence);

      expect(batchResult.parentObservationsCount).toBe(3);
      expect(batchResult.derivedSegmentsCount).toBe(4);
      expect(batchResult.eligibleSegmentsCount).toBe(3);
      expect(batchResult.contextBoundSegmentsCount).toBe(1);
      expect(batchResult.unalignedObservationsCount).toBe(0);
      expect(batchResult.candidateGroupsCount).toBe(2);
      expect(batchResult.candidates).toHaveLength(2);

      // Verify specific candidates
      const sadiCand = batchResult.candidates.find((c) => c.normalizedForm === 'سعدی');
      expect(sadiCand).toBeDefined();
      expect(sadiCand?.persianForm).toBe('سعدی');
      expect(sadiCand?.proposedCanonical).toBeNull();
      expect(sadiCand?.entityType).toBe('PERSON');
      expect(sadiCand?.evidenceIds).toHaveLength(1);

      const gulistanCand = batchResult.candidates.find((c) => c.normalizedForm === 'گلستان');
      expect(gulistanCand).toBeDefined();
      expect(gulistanCand?.persianForm).toBe('گلستان');
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

      const batchResult = processEvidenceAlignmentBatch(parentEvidence);

      expect(batchResult.parentObservationsCount).toBe(3);
      expect(batchResult.derivedSegmentsCount).toBe(14);
      expect(batchResult.eligibleSegmentsCount).toBe(11);
      expect(batchResult.contextBoundSegmentsCount).toBe(3); // al-ṭibb, al-Dīn, al-Dīn
      expect(batchResult.unalignedObservationsCount).toBe(0);
      expect(batchResult.candidateGroupsCount).toBe(8);
      expect(batchResult.candidates).toHaveLength(8);

      for (const c of batchResult.candidates) {
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

      const batchResult = processEvidenceAlignmentBatch(parentEvidence);

      expect(batchResult.parentObservationsCount).toBe(7);
      expect(batchResult.derivedSegmentsCount).toBe(20);
      expect(batchResult.eligibleSegmentsCount).toBe(17);
      expect(batchResult.contextBoundSegmentsCount).toBe(3);
      expect(batchResult.unalignedObservationsCount).toBe(0);
      expect(batchResult.candidateGroupsCount).toBe(13);
      expect(batchResult.candidates).toHaveLength(13);

      for (const c of batchResult.candidates) {
        expect(c.proposedCanonical).toBeNull();
      }
    });
  });
});
