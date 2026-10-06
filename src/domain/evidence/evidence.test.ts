import { describe, expect, it } from 'vitest';
import { transliterate } from '../engine';
import { DEFAULT_LEXICON_REPOSITORY } from '../../data/lexicon';
import {
  CandidateLifecycleError,
  EvidenceExtractionError,
  EvidenceImmutabilityViolationError,
  generateCandidateId,
  generateEvidenceId,
  LexicalCandidate,
  LexicalEvidence,
  LexicalEvidenceRepository,
  LexicalEvidenceSource,
  RawSourceRecord,
  RomanizationScheme,
  synthesizeCandidateFromEvidence,
  validateCandidateLifecycle
} from './index';

describe('Lexical Evidence & Candidate Architecture', () => {
  describe('A. Evidence preserves source observation & identity consistency', () => {
    it('preserves exact Persian script form and observed external romanization without mutation', () => {
      const rawPersian = 'مشروطه‌خواهي'; // Contains non-standard Persian ye/zwnj
      const rawRomanization = 'Mashrūṭah-khvāhī';

      const evidence: LexicalEvidence = {
        id: generateEvidenceId({
          sourceId: 'LOC',
          sourceRecordId: 'loc-12345678',
          sourceField: '650$a',
          persianForm: rawPersian,
          observedRomanization: rawRomanization,
          romanizationScheme: 'ALA_LC'
        }),
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: 'loc-12345678',
        sourceUri: 'https://lccn.loc.gov/12345678',
        sourceField: '650$a',
        persianForm: rawPersian,
        observedRomanization: rawRomanization,
        romanizationScheme: 'ALA_LC',
        entityType: 'PHRASE',
        context: 'Persian Constitutional Revolution subject heading',
        provenance: {
          sourceId: 'LOC',
          sourceTitle: 'Library of Congress Online Catalog',
          sourceOrganization: 'Library of Congress',
          retrievalMethod: 'API',
          retrievedAt: '2026-10-05T12:00:00Z',
          extractorVersion: '1.0.0-test'
        },
        status: 'OBSERVED'
      };

      expect(evidence.persianForm).toBe(rawPersian);
      expect(evidence.observedRomanization).toBe(rawRomanization);
      expect(evidence.sourceField).toBe('650$a');
      expect(evidence.provenance.sourceOrganization).toBe('Library of Congress');
    });

    it('generates distinct deterministic evidence IDs for materially different raw observations without collision', () => {
      const id1 = generateEvidenceId({
        sourceId: 'LOC',
        sourceRecordId: 'rec-1',
        sourceField: '100$a',
        persianForm: 'شاه',
        observedRomanization: 'Shāh',
        romanizationScheme: 'ALA_LC'
      });

      const id2 = generateEvidenceId({
        sourceId: 'LOC',
        sourceRecordId: 'rec-1',
        sourceField: '100$a',
        persianForm: 'شاه',
        observedRomanization: 'Shah',
        romanizationScheme: 'ALA_LC'
      });

      const id3 = generateEvidenceId({
        sourceId: 'LOC',
        sourceRecordId: 'rec-2',
        sourceField: '100$a',
        persianForm: 'شاه',
        observedRomanization: 'Shāh',
        romanizationScheme: 'ALA_LC'
      });

      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id2).not.toBe(id3);
    });
  });

  describe('B. Scheme is separate from canonical authority', () => {
    it('keeps ALA_LC romanization scheme distinct from project IJMES canonical authority', () => {
      const alaLcEvidence: LexicalEvidence = {
        id: 'evi-loc-mashrutah',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: 'lccn-998877',
        sourceUri: 'https://lccn.loc.gov/998877',
        sourceField: '245$a',
        persianForm: 'مشروطه',
        observedRomanization: 'Mashrūṭah', // ALA-LC renders tā' marbūṭa as -ah
        romanizationScheme: 'ALA_LC',
        entityType: 'WORD',
        context: 'Book title',
        provenance: {
          sourceId: 'LOC',
          retrievalMethod: 'API',
          retrievedAt: '2026-10-05T12:00:00Z'
        },
        status: 'OBSERVED'
      };

      // The observed scheme is explicitly ALA_LC
      expect(alaLcEvidence.romanizationScheme).toBe<RomanizationScheme>('ALA_LC');
      expect(alaLcEvidence.observedRomanization).toBe('Mashrūṭah');

      // The project's IJMES rule renders tā' marbūṭa as -ih in Persian (e.g. mashrūṭih)
      // The evidence object does NOT mutate or assert itself as IJMES
      expect(alaLcEvidence.romanizationScheme).not.toBe('IJMES');
    });
  });

  describe('C. Multiple observations coexist & append-only runtime immutability', () => {
    it('allows multiple external sources to provide different romanizations for the same Persian form without overwriting', () => {
      const repo = new LexicalEvidenceRepository();

      const sourceA: LexicalEvidence = {
        id: generateEvidenceId({
          sourceId: 'SOURCE_A',
          sourceRecordId: 'rec-001',
          sourceField: 'heading',
          persianForm: 'قاجار',
          observedRomanization: 'Qājār',
          romanizationScheme: 'IJMES'
        }),
        sourceType: 'ENCYCLOPEDIA',
        sourceRecordId: 'rec-001',
        sourceUri: null,
        sourceField: 'heading',
        persianForm: 'قاجار',
        observedRomanization: 'Qājār',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: 'Dynasty name',
        provenance: {
          sourceId: 'SOURCE_A',
          retrievalMethod: 'BULK_DATA',
          retrievedAt: '2026-10-05T10:00:00Z'
        },
        status: 'OBSERVED'
      };

      const sourceB: LexicalEvidence = {
        id: generateEvidenceId({
          sourceId: 'SOURCE_B',
          sourceRecordId: 'rec-002',
          sourceField: '100$a',
          persianForm: 'قاجار',
          observedRomanization: 'Qajar',
          romanizationScheme: 'LOCAL'
        }),
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: 'rec-002',
        sourceUri: null,
        sourceField: '100$a',
        persianForm: 'قاجار',
        observedRomanization: 'Qajar',
        romanizationScheme: 'LOCAL',
        entityType: 'PERSON',
        context: 'Author catalog heading',
        provenance: {
          sourceId: 'SOURCE_B',
          retrievalMethod: 'API',
          retrievedAt: '2026-10-05T11:00:00Z'
        },
        status: 'OBSERVED'
      };

      const sourceC: LexicalEvidence = {
        id: generateEvidenceId({
          sourceId: 'SOURCE_C',
          sourceRecordId: 'rec-003',
          sourceField: 'subject',
          persianForm: 'قاجار',
          observedRomanization: 'Ḳādschār',
          romanizationScheme: 'DMG'
        }),
        sourceType: 'SCHOLARLY_DICTIONARY',
        sourceRecordId: 'rec-003',
        sourceUri: null,
        sourceField: 'subject',
        persianForm: 'قاجار',
        observedRomanization: 'Ḳādschār',
        romanizationScheme: 'DMG',
        entityType: 'PERSON',
        context: 'German Orientalist dictionary entry',
        provenance: {
          sourceId: 'SOURCE_C',
          retrievalMethod: 'MANUAL',
          retrievedAt: '2026-10-05T12:00:00Z'
        },
        status: 'OBSERVED'
      };

      repo.addEvidenceBatch([sourceA, sourceB, sourceC]);

      expect(repo.getEvidenceCount()).toBe(3);

      const qajarEvidence = repo.getEvidenceByPersianForm('قاجار');
      expect(qajarEvidence.length).toBe(3);
      expect(qajarEvidence.map((e) => e.observedRomanization).sort()).toEqual(['Qajar', 'Qājār', 'Ḳādschār'].sort());
      expect(qajarEvidence.map((e) => e.romanizationScheme).sort()).toEqual(['DMG', 'IJMES', 'LOCAL'].sort());
    });

    it('treats exact re-ingestion of the same evidence record as an idempotent no-op regardless of key order', () => {
      const repo = new LexicalEvidenceRepository();
      const evidence: LexicalEvidence = {
        id: 'evi-idempotent-test',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: 'rec-100',
        sourceUri: null,
        sourceField: '100$a',
        persianForm: 'فردوسی',
        observedRomanization: 'Firdawsī',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: null,
        provenance: {
          sourceId: 'IRANICA',
          retrievalMethod: 'API',
          retrievedAt: '2026-10-05T00:00:00Z'
        },
        status: 'OBSERVED'
      };

      repo.addEvidence(evidence);
      expect(repo.getEvidenceCount()).toBe(1);

      // Re-add with reordered object keys
      const reorderedEvidence: LexicalEvidence = {
        persianForm: 'فردوسی',
        id: 'evi-idempotent-test',
        entityType: 'PERSON',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: 'rec-100',
        sourceField: '100$a',
        sourceUri: null,
        status: 'OBSERVED',
        observedRomanization: 'Firdawsī',
        romanizationScheme: 'IJMES',
        context: null,
        provenance: {
          retrievedAt: '2026-10-05T00:00:00Z',
          sourceId: 'IRANICA',
          retrievalMethod: 'API'
        }
      };

      expect(() => repo.addEvidence(reorderedEvidence)).not.toThrow();
      expect(repo.getEvidenceCount()).toBe(1);
    });

    it('fails closed when attempting to re-add an existing evidence ID with altered content', () => {
      const repo = new LexicalEvidenceRepository();
      const originalEvidence: LexicalEvidence = {
        id: 'evi-immutability-test',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: 'rec-200',
        sourceUri: null,
        sourceField: '100$a',
        persianForm: 'سعدی',
        observedRomanization: 'Saʿdī',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: null,
        provenance: {
          sourceId: 'IRANICA',
          retrievalMethod: 'API',
          retrievedAt: '2026-10-05T00:00:00Z'
        },
        status: 'OBSERVED'
      };

      repo.addEvidence(originalEvidence);

      const alteredEvidence: LexicalEvidence = {
        ...originalEvidence,
        observedRomanization: 'Saadi' // altered observation
      };

      expect(() => repo.addEvidence(alteredEvidence)).toThrow(EvidenceImmutabilityViolationError);
      // Original record in repository remains completely unchanged
      expect(repo.getEvidenceById('evi-immutability-test')?.observedRomanization).toBe('Saʿdī');
    });

    it('protects stored evidence from caller reference mutations on ingress, egress, and nested provenance', () => {
      const repo = new LexicalEvidenceRepository();
      const evidence: LexicalEvidence = {
        id: 'evi-mutation-guard',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: 'rec-300',
        sourceUri: 'https://example.com/300',
        sourceField: '100$a',
        persianForm: 'حافظ',
        observedRomanization: 'Ḥāfiẓ',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: 'Poet',
        provenance: {
          sourceId: 'LOC',
          sourceOrganization: 'Library of Congress',
          retrievalMethod: 'API',
          retrievedAt: '2026-10-05T00:00:00Z',
          notes: 'Original note'
        },
        status: 'OBSERVED'
      };

      repo.addEvidence(evidence);

      // 1. Mutate original caller-owned object after insertion
      evidence.observedRomanization = 'MUTATED_AFTER_INSERT';
      evidence.provenance.sourceOrganization = 'MUTATED_ORG';
      evidence.provenance.notes = 'MUTATED_NOTES';

      const fromRepo = repo.getEvidenceById('evi-mutation-guard');
      expect(fromRepo?.observedRomanization).toBe('Ḥāfiẓ');
      expect(fromRepo?.provenance.sourceOrganization).toBe('Library of Congress');
      expect(fromRepo?.provenance.notes).toBe('Original note');

      // 2. Mutate getter-returned object
      if (fromRepo) {
        fromRepo.observedRomanization = 'MUTATED_VIA_GETTER';
        fromRepo.provenance.notes = 'MUTATED_GETTER_NOTES';
      }

      const fromRepoAgain = repo.getEvidenceById('evi-mutation-guard');
      expect(fromRepoAgain?.observedRomanization).toBe('Ḥāfiẓ');
      expect(fromRepoAgain?.provenance.notes).toBe('Original note');
    });
  });

  describe('D. Candidate references evidence & scheme-aware conflict detection', () => {
    it('does NOT mark cross-scheme romanization differences as a review-required conflict', () => {
      // Different schemes legitimately produce different strings (e.g. IJMES vs LOCAL)
      const evi1: LexicalEvidence = {
        id: 'evi-qajar-ijmes',
        sourceType: 'ENCYCLOPEDIA',
        sourceRecordId: 'e-1',
        sourceUri: null,
        sourceField: 'entry',
        persianForm: 'قاجار',
        observedRomanization: 'Qājār',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'IRANICA', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const evi2: LexicalEvidence = {
        id: 'evi-qajar-local',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: 'c-1',
        sourceUri: null,
        sourceField: '100$a',
        persianForm: 'قاجار',
        observedRomanization: 'Qajar',
        romanizationScheme: 'LOCAL',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'LOC', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const candidate = synthesizeCandidateFromEvidence('قاجار', [evi1, evi2]);

      expect(candidate.evidenceIds).toEqual(['evi-qajar-ijmes', 'evi-qajar-local']);
      // Cross-scheme variation coexists as VARIANT_ACROSS_SCHEMES and does NOT block review as conflict
      expect(candidate.status).toBe('UNREVIEWED');
      expect(candidate.conflicts.length).toBe(2);
      expect(candidate.conflicts[0].conflictKind).toBe('VARIANT_ACROSS_SCHEMES');
      expect(candidate.conflicts[1].conflictKind).toBe('VARIANT_ACROSS_SCHEMES');
    });

    it('does NOT treat UNKNOWN or generic LOCAL as comparable standards for same-scheme conflict', () => {
      // 1. Two UNKNOWN observations with different strings
      const unk1: LexicalEvidence = {
        id: 'evi-unk-1',
        sourceType: 'OTHER',
        sourceRecordId: null,
        sourceUri: null,
        sourceField: null,
        persianForm: 'تهران',
        observedRomanization: 'Tehran',
        romanizationScheme: 'UNKNOWN',
        entityType: 'PLACE',
        context: null,
        provenance: { sourceId: 'SRC1', retrievalMethod: 'SCRAPE', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const unk2: LexicalEvidence = {
        id: 'evi-unk-2',
        sourceType: 'OTHER',
        sourceRecordId: null,
        sourceUri: null,
        sourceField: null,
        persianForm: 'تهران',
        observedRomanization: 'Teheran',
        romanizationScheme: 'UNKNOWN',
        entityType: 'PLACE',
        context: null,
        provenance: { sourceId: 'SRC2', retrievalMethod: 'SCRAPE', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const unkCandidate = synthesizeCandidateFromEvidence('تهران', [unk1, unk2]);
      expect(unkCandidate.status).toBe('UNREVIEWED');
      expect(unkCandidate.conflicts.every((c) => c.conflictKind === 'VARIANT_ACROSS_SCHEMES')).toBe(true);

      // 2. Two LOCAL observations from different sources
      const loc1: LexicalEvidence = {
        id: 'evi-loc-src1',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: '1',
        sourceUri: null,
        sourceField: null,
        persianForm: 'تهران',
        observedRomanization: 'Tehran',
        romanizationScheme: 'LOCAL',
        entityType: 'PLACE',
        context: null,
        provenance: { sourceId: 'CATALOG_A', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const loc2: LexicalEvidence = {
        id: 'evi-loc-src2',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: '2',
        sourceUri: null,
        sourceField: null,
        persianForm: 'تهران',
        observedRomanization: 'Teheran',
        romanizationScheme: 'LOCAL',
        entityType: 'PLACE',
        context: null,
        provenance: { sourceId: 'CATALOG_B', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const locCandidate = synthesizeCandidateFromEvidence('تهران', [loc1, loc2]);
      expect(locCandidate.status).toBe('UNREVIEWED');
      expect(locCandidate.conflicts.every((c) => c.conflictKind === 'VARIANT_ACROSS_SCHEMES')).toBe(true);
    });

    it('DOES mark disagreement within the same explicitly comparable scheme as a REVIEW_REQUIRED conflict', () => {
      // Two sources both claiming IJMES but giving conflicting transliterations
      const evi1: LexicalEvidence = {
        id: 'evi-ijmes-1',
        sourceType: 'ENCYCLOPEDIA',
        sourceRecordId: 'e-1',
        sourceUri: null,
        sourceField: 'headword',
        persianForm: 'حافظ',
        observedRomanization: 'Ḥāfiẓ',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'SOURCE_1', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const evi2: LexicalEvidence = {
        id: 'evi-ijmes-2',
        sourceType: 'SCHOLARLY_DICTIONARY',
        sourceRecordId: 'd-1',
        sourceUri: null,
        sourceField: 'entry',
        persianForm: 'حافظ',
        observedRomanization: 'Ḥāfiz', // Disagreement within IJMES
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'SOURCE_2', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const candidate = synthesizeCandidateFromEvidence('حافظ', [evi1, evi2]);

      expect(candidate.status).toBe('REVIEW_REQUIRED');
      expect(candidate.conflicts.length).toBe(2);
      expect(candidate.conflicts[0].conflictKind).toBe('CONFLICT_WITHIN_SCHEME');
      expect(candidate.conflicts[1].conflictKind).toBe('CONFLICT_WITHIN_SCHEME');
    });

    it('preserves both conflict dimensions independently in mixed multi-scheme evidence', () => {
      // 2 disagreeing IJMES observations + 1 ALA-LC observation
      const ijmes1: LexicalEvidence = {
        id: 'evi-ijmes-a',
        sourceType: 'ENCYCLOPEDIA',
        sourceRecordId: '1',
        sourceUri: null,
        sourceField: null,
        persianForm: 'حافظ',
        observedRomanization: 'Ḥāfiẓ',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'IRANICA', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const ijmes2: LexicalEvidence = {
        id: 'evi-ijmes-b',
        sourceType: 'ACADEMIC_GRAMMAR',
        sourceRecordId: '2',
        sourceUri: null,
        sourceField: null,
        persianForm: 'حافظ',
        observedRomanization: 'Ḥāfiz',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'GRAMMAR', retrievalMethod: 'MANUAL', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const alaLc: LexicalEvidence = {
        id: 'evi-ala-c',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: '3',
        sourceUri: null,
        sourceField: null,
        persianForm: 'حافظ',
        observedRomanization: 'Hāfiz',
        romanizationScheme: 'ALA_LC',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'LOC', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const candidate = synthesizeCandidateFromEvidence('حافظ', [ijmes1, ijmes2, alaLc]);

      expect(candidate.status).toBe('REVIEW_REQUIRED');

      const withinScheme = candidate.conflicts.filter((c) => c.conflictKind === 'CONFLICT_WITHIN_SCHEME');
      const acrossSchemes = candidate.conflicts.filter((c) => c.conflictKind === 'VARIANT_ACROSS_SCHEMES');

      expect(withinScheme.length).toBe(2);
      expect(acrossSchemes.length).toBe(3);
    });

    it('rejects candidate synthesis when evidence Persian form does not match candidate Persian form', () => {
      const unrelatedEvidence: LexicalEvidence = {
        id: 'evi-ferdowsi',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: 'f-1',
        sourceUri: null,
        sourceField: '100$a',
        persianForm: 'فردوسی',
        observedRomanization: 'Firdawsī',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'LOC', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      expect(() => synthesizeCandidateFromEvidence('حافظ', [unrelatedEvidence])).toThrowError(
        /Cannot attach evidence "evi-ferdowsi" .* to candidate "حافظ"/
      );
    });
  });

  describe('E. Candidate adjudication lifecycle & repository protection', () => {
    it('fails closed immediately when adding a candidate referencing non-existent evidence IDs', () => {
      const repo = new LexicalEvidenceRepository();
      const candidate: LexicalCandidate = {
        id: 'cand-missing-evidence',
        persianForm: 'سعدی',
        normalizedForm: 'سعدی',
        proposedCanonical: 'saʿdī',
        entityType: 'PERSON',
        evidenceIds: ['evi-does-not-exist'],
        conflicts: [],
        status: 'UNREVIEWED',
        derivationProvenance: {
          derivedAt: '2026-10-05T00:00:00Z',
          strategy: 'SINGLE_EVIDENCE'
        }
      };

      expect(() => repo.addCandidate(candidate)).toThrowError(
        /Candidate "cand-missing-evidence" references non-existent evidence ID "evi-does-not-exist"/
      );
      expect(repo.getCandidateCount()).toBe(0);
    });

    it('rejects manually constructed candidate when evidence Persian form does not match candidate Persian form', () => {
      const repo = new LexicalEvidenceRepository();
      const hafezEvidence: LexicalEvidence = {
        id: 'evi-hafez-1',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: '1',
        sourceUri: null,
        sourceField: '100$a',
        persianForm: 'حافظ',
        observedRomanization: 'Ḥāfiẓ',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'LOC', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };
      repo.addEvidence(hafezEvidence);

      // Manual candidate for Ferdowsi referencing Hafez evidence
      const ferdowsiCandidate: LexicalCandidate = {
        id: 'cand-ferdowsi-mismatch',
        persianForm: 'فردوسی',
        normalizedForm: 'فردوسی',
        proposedCanonical: 'firdawsī',
        entityType: 'PERSON',
        evidenceIds: ['evi-hafez-1'],
        conflicts: [],
        status: 'UNREVIEWED',
        derivationProvenance: {
          derivedAt: '2026-10-05T00:00:00Z',
          strategy: 'SINGLE_EVIDENCE'
        }
      };

      expect(() => repo.addCandidate(ferdowsiCandidate)).toThrowError(
        /Candidate "cand-ferdowsi-mismatch" Persian identity mismatch: evidence "evi-hafez-1" has normalized form "حافظ", but candidate has "فردوسی"/
      );
      expect(repo.getCandidateCount()).toBe(0);
    });

    it('rejects candidate when candidate normalizedForm does not match normalized persianForm', () => {
      const repo = new LexicalEvidenceRepository();
      const hafezEvidence: LexicalEvidence = {
        id: 'evi-hafez-2',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: '2',
        sourceUri: null,
        sourceField: '100$a',
        persianForm: 'حافظ',
        observedRomanization: 'Ḥāfiẓ',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'LOC', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };
      repo.addEvidence(hafezEvidence);

      const corruptedCandidate: LexicalCandidate = {
        id: 'cand-corrupted-normalized',
        persianForm: 'حافظ',
        normalizedForm: 'فردوسی', // mismatch with persianForm
        proposedCanonical: 'ḥāfiẓ',
        entityType: 'PERSON',
        evidenceIds: ['evi-hafez-2'],
        conflicts: [],
        status: 'UNREVIEWED',
        derivationProvenance: {
          derivedAt: '2026-10-05T00:00:00Z',
          strategy: 'SINGLE_EVIDENCE'
        }
      };

      expect(() => repo.addCandidate(corruptedCandidate)).toThrowError(
        /Candidate "cand-corrupted-normalized" normalizedForm "فردوسی" does not match normalized persianForm "حافظ"/
      );
      expect(repo.getCandidateCount()).toBe(0);
    });

    it('accepts candidate when candidate and evidence Persian forms differ only by legitimate normalization equivalence', () => {
      const repo = new LexicalEvidenceRepository();
      // Evidence has Arabic Yeh: 'سعدي' (\u0633\u0639\u062f\u064A)
      const evidenceArabicYeh: LexicalEvidence = {
        id: 'evi-saadi-arabic-yeh',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: '3',
        sourceUri: null,
        sourceField: '100$a',
        persianForm: 'سعدي',
        observedRomanization: 'Saʿdī',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'LOC', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };
      repo.addEvidence(evidenceArabicYeh);

      // Candidate has standard Persian Yeh: 'سعدی' (\u0633\u0639\u062f\u06CC)
      const candidatePersianYeh: LexicalCandidate = {
        id: 'cand-saadi-normalized',
        persianForm: 'سعدی',
        normalizedForm: 'سعدی',
        proposedCanonical: 'saʿdī',
        entityType: 'PERSON',
        evidenceIds: ['evi-saadi-arabic-yeh'],
        conflicts: [],
        status: 'UNREVIEWED',
        derivationProvenance: {
          derivedAt: '2026-10-05T00:00:00Z',
          strategy: 'SINGLE_EVIDENCE'
        }
      };

      expect(() => repo.addCandidate(candidatePersianYeh)).not.toThrow();
      expect(repo.getCandidateCount()).toBe(1);
      expect(repo.getCandidateById('cand-saadi-normalized')?.persianForm).toBe('سعدی');
    });

    it('protects stored candidate from caller reference mutations on status, adjudication, and derivationProvenance', () => {
      const repo = new LexicalEvidenceRepository();
      const evidence: LexicalEvidence = {
        id: 'evi-cand-guard',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: 'rec-1',
        sourceUri: null,
        sourceField: null,
        persianForm: 'نظامی',
        observedRomanization: 'Niẓāmī',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'LOC', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };
      repo.addEvidence(evidence);

      const candidate: LexicalCandidate = {
        id: 'cand-mutation-guard',
        persianForm: 'نظامی',
        normalizedForm: 'نظامی',
        proposedCanonical: 'niẓāmī',
        entityType: 'PERSON',
        evidenceIds: ['evi-cand-guard'],
        conflicts: [],
        status: 'UNREVIEWED',
        derivationProvenance: {
          derivedAt: '2026-10-05T00:00:00Z',
          strategy: 'SINGLE_EVIDENCE',
          notes: 'Original candidate note'
        }
      };

      repo.addCandidate(candidate);

      // Mutate caller-owned candidate object after insertion
      candidate.status = 'ACCEPTED';
      (candidate as any).adjudication = { decidedAt: '2026-10-05', adjudicator: 'fake', disposition: 'ACCEPTED' };
      candidate.evidenceIds.push('evi-injected');
      candidate.derivationProvenance.notes = 'MUTATED_NOTES';

      const fromRepo = repo.getCandidateById('cand-mutation-guard');
      expect(fromRepo?.status).toBe('UNREVIEWED');
      expect(fromRepo?.adjudication).toBeUndefined();
      expect(fromRepo?.evidenceIds).toEqual(['evi-cand-guard']);
      expect(fromRepo?.derivationProvenance.notes).toBe('Original candidate note');
    });

    it('enforces that ACCEPTED candidates must carry an adjudication record with disposition ACCEPTED', () => {
      const invalidCandidate: LexicalCandidate = {
        id: 'cand-invalid-accepted',
        persianForm: 'حافظ',
        normalizedForm: 'حافظ',
        proposedCanonical: 'ḥāfiẓ',
        entityType: 'PERSON',
        evidenceIds: ['evi-1'],
        conflicts: [],
        status: 'ACCEPTED', // Missing adjudication!
        derivationProvenance: {
          derivedAt: '2026-10-05T00:00:00Z',
          strategy: 'SINGLE_EVIDENCE'
        }
      };

      expect(() => validateCandidateLifecycle(invalidCandidate)).toThrow(CandidateLifecycleError);

      const conflictingDispositionCandidate: LexicalCandidate = {
        ...invalidCandidate,
        adjudication: {
          decidedAt: '2026-10-05T12:00:00Z',
          adjudicator: 'specialist-1',
          disposition: 'REJECTED' // Mismatched disposition!
        }
      };

      expect(() => validateCandidateLifecycle(conflictingDispositionCandidate)).toThrow(CandidateLifecycleError);

      const validAcceptedCandidate: LexicalCandidate = {
        ...invalidCandidate,
        adjudication: {
          decidedAt: '2026-10-05T12:00:00Z',
          adjudicator: 'specialist-1',
          disposition: 'ACCEPTED'
        }
      };

      expect(() => validateCandidateLifecycle(validAcceptedCandidate)).not.toThrow();
    });

    it('enforces that UNREVIEWED and REVIEW_REQUIRED candidates cannot carry a completed adjudication record', () => {
      const invalidUnreviewedCandidate: LexicalCandidate = {
        id: 'cand-invalid-unreviewed',
        persianForm: 'سعدی',
        normalizedForm: 'سعدی',
        proposedCanonical: 'saʿdī',
        entityType: 'PERSON',
        evidenceIds: ['evi-1'],
        conflicts: [],
        status: 'UNREVIEWED',
        adjudication: {
          decidedAt: '2026-10-05T12:00:00Z',
          adjudicator: 'specialist-1',
          disposition: 'ACCEPTED'
        },
        derivationProvenance: {
          derivedAt: '2026-10-05T00:00:00Z',
          strategy: 'SINGLE_EVIDENCE'
        }
      };

      expect(() => validateCandidateLifecycle(invalidUnreviewedCandidate)).toThrow(CandidateLifecycleError);
    });

    it('does not alter deterministic transliteration outputs or mutate the authoritative lexicon repository', () => {
      const input = 'حافظ شیرازی';

      // 1. Run transliteration before creating evidence or candidate
      const beforeResult = transliterate(input);

      // 2. Create evidence and an adjudicated candidate in evidence repository
      const repo = new LexicalEvidenceRepository();
      const evidence: LexicalEvidence = {
        id: 'evi-override-test',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: 'fake-999',
        sourceUri: null,
        sourceField: '100$a',
        persianForm: 'حافظ',
        observedRomanization: 'TOTALLY_DIFFERENT_ROMANIZATION',
        romanizationScheme: 'LOCAL',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'MOCK', retrievalMethod: 'MANUAL', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const candidate: LexicalCandidate = {
        id: generateCandidateId('حافظ', [evidence.id]),
        persianForm: 'حافظ',
        normalizedForm: 'حافظ',
        proposedCanonical: 'TOTALLY_DIFFERENT_ROMANIZATION',
        entityType: 'PERSON',
        evidenceIds: [evidence.id],
        conflicts: [],
        status: 'ACCEPTED',
        adjudication: {
          decidedAt: '2026-10-05T12:00:00Z',
          adjudicator: 'specialist-1',
          disposition: 'ACCEPTED',
          notes: 'Adjudicated for test'
        },
        derivationProvenance: {
          derivedAt: '2026-10-05T00:00:00Z',
          strategy: 'MANUAL_DRAFT'
        }
      };

      repo.addEvidence(evidence);
      repo.addCandidate(candidate);

      // 3. Run transliteration after creating evidence repository
      const afterResult = transliterate(input);

      // Outputs must remain completely unchanged
      expect(afterResult.output).toBe(beforeResult.output);
      expect(afterResult.status).toBe(beforeResult.status);
      expect(afterResult.tokens).toEqual(beforeResult.tokens);

      // The authoritative default lexicon repository is completely unmodified
      expect(DEFAULT_LEXICON_REPOSITORY.findById('evi-override-test')).toBeUndefined();
    });
  });

  describe('F. Unknown scheme is allowed', () => {
    it('supports UNKNOWN romanization scheme without guessing or throwing', () => {
      const evidence: LexicalEvidence = {
        id: 'evi-unknown-scheme',
        sourceType: 'OTHER',
        sourceRecordId: null,
        sourceUri: 'https://example.com/item/1',
        sourceField: null,
        persianForm: 'دانشگاه',
        observedRomanization: 'Danisgah',
        romanizationScheme: 'UNKNOWN',
        entityType: 'ORGANIZATION',
        context: null,
        provenance: {
          sourceId: 'WEB_PAGE',
          retrievalMethod: 'SCRAPE',
          retrievedAt: '2026-10-05T12:00:00Z'
        },
        status: 'OBSERVED'
      };

      expect(evidence.romanizationScheme).toBe('UNKNOWN');
      expect(evidence.observedRomanization).toBe('Danisgah');
    });
  });

  describe('G. Provenance survives', () => {
    it('preserves complete source and retrieval metadata through serialization and deserialization cycles', () => {
      const originalRepo = new LexicalEvidenceRepository();

      const evidence: LexicalEvidence = {
        id: 'evi-loc-001',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: 'lccn-2001012345',
        sourceUri: 'https://lccn.loc.gov/2001012345',
        sourceField: '245$a',
        persianForm: 'تاریخ بیهقی',
        observedRomanization: 'Tārīkh-i Bayhaqī',
        romanizationScheme: 'ALA_LC',
        entityType: 'WORK',
        context: 'Persian chronicle title heading',
        provenance: {
          sourceId: 'LOC',
          sourceTitle: 'Library of Congress Catalog',
          sourceOrganization: 'Library of Congress',
          retrievalMethod: 'API',
          retrievedAt: '2026-10-05T08:30:00Z',
          extractorVersion: 'marc21-v2.1',
          notes: 'Subfield $a extracted from title field'
        },
        status: 'OBSERVED'
      };

      const candidate: LexicalCandidate = {
        id: 'cand-001',
        persianForm: 'تاریخ بیهقی',
        normalizedForm: 'تاریخ بیهقی',
        proposedCanonical: 'Tārīkh-i Bayhaqī',
        proposedProfile: 'ijmes_citation_title',
        entityType: 'WORK',
        evidenceIds: ['evi-loc-001'],
        conflicts: [],
        status: 'UNREVIEWED',
        derivationProvenance: {
          derivedAt: '2026-10-05T09:00:00Z',
          strategy: 'SINGLE_EVIDENCE',
          notes: 'Derived from single authoritative LoC title heading',
          synthesizerVersion: 'synth-v1.0'
        },
        notes: 'Classic historiographical work'
      };

      originalRepo.addEvidence(evidence);
      originalRepo.addCandidate(candidate);

      const serialized = originalRepo.serialize();
      const restoredRepo = LexicalEvidenceRepository.deserialize(serialized);

      const restoredEvidence = restoredRepo.getEvidenceById('evi-loc-001');
      expect(restoredEvidence).toBeDefined();
      expect(restoredEvidence?.provenance.sourceId).toBe('LOC');
      expect(restoredEvidence?.provenance.sourceOrganization).toBe('Library of Congress');
      expect(restoredEvidence?.provenance.extractorVersion).toBe('marc21-v2.1');
      expect(restoredEvidence?.provenance.retrievedAt).toBe('2026-10-05T08:30:00Z');
      expect(restoredEvidence?.sourceField).toBe('245$a');

      const restoredCandidate = restoredRepo.getCandidateById('cand-001');
      expect(restoredCandidate).toBeDefined();
      expect(restoredCandidate?.derivationProvenance.strategy).toBe('SINGLE_EVIDENCE');
      expect(restoredCandidate?.derivationProvenance.synthesizerVersion).toBe('synth-v1.0');

      const supporting = restoredRepo.getSupportingEvidence('cand-001');
      expect(supporting.length).toBe(1);
      expect(supporting[0].id).toBe('evi-loc-001');
    });

    it('rejects deserialization if a candidate references a missing evidence ID', () => {
      const corruptedData = {
        version: 1 as const,
        evidence: [],
        candidates: [
          {
            id: 'cand-bad',
            persianForm: 'تست',
            normalizedForm: 'تست',
            proposedCanonical: 'test',
            entityType: 'WORD' as const,
            evidenceIds: ['evi-non-existent'],
            conflicts: [],
            status: 'UNREVIEWED' as const,
            derivationProvenance: {
              derivedAt: '2026-10-05T00:00:00Z',
              strategy: 'SINGLE_EVIDENCE' as const
            }
          }
        ]
      };

      expect(() => LexicalEvidenceRepository.deserialize(corruptedData)).toThrowError(
        /Candidate "cand-bad" references non-existent evidence ID "evi-non-existent"/
      );
    });
  });

  describe('Source connector contract boundary', () => {
    it('enforces connector contract for external providers without network execution', async () => {
      // Mock connector implementation
      class MockLibraryConnector implements LexicalEvidenceSource<{ title: string; lccn: string }> {
        public readonly sourceId = 'MOCK_LOC';
        public readonly sourceType = 'LIBRARY_CATALOG' as const;
        public readonly defaultScheme = 'ALA_LC' as const;

        public async fetch(query: { lccn: string }): Promise<RawSourceRecord<{ title: string; lccn: string }>[]> {
          return [
            {
              sourceId: this.sourceId,
              rawIdentifier: query.lccn,
              payload: { title: 'گلستان سعدی', lccn: query.lccn },
              fetchedAt: '2026-10-05T12:00:00Z'
            }
          ];
        }

        public extractEvidence(record: RawSourceRecord<{ title: string; lccn: string }>): LexicalEvidence[] {
          if (!record.payload.title) {
            throw new EvidenceExtractionError(this.sourceId, 'Missing title in record payload', record.rawIdentifier);
          }
          return [
            {
              id: generateEvidenceId({
                sourceId: this.sourceId,
                sourceRecordId: record.payload.lccn,
                sourceField: '245$a',
                persianForm: record.payload.title,
                observedRomanization: null,
                romanizationScheme: this.defaultScheme
              }),
              sourceType: this.sourceType,
              sourceRecordId: record.payload.lccn,
              sourceUri: `https://mock.catalog/${record.payload.lccn}`,
              sourceField: '245$a',
              persianForm: record.payload.title,
              observedRomanization: null,
              romanizationScheme: this.defaultScheme,
              entityType: 'WORK',
              context: 'Persian classic literary work',
              provenance: {
                sourceId: this.sourceId,
                retrievalMethod: 'API',
                retrievedAt: record.fetchedAt,
                extractorVersion: 'mock-1.0'
              },
              status: 'OBSERVED'
            }
          ];
        }
      }

      const connector = new MockLibraryConnector();
      const records = await connector.fetch({ lccn: '2026-0001' });
      expect(records.length).toBe(1);

      const evidenceList = connector.extractEvidence(records[0]);
      expect(evidenceList.length).toBe(1);
      expect(evidenceList[0].persianForm).toBe('گلستان سعدی');
      expect(evidenceList[0].romanizationScheme).toBe('ALA_LC');
      expect(evidenceList[0].provenance.sourceId).toBe('MOCK_LOC');
    });
  });
});
