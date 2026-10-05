import { describe, expect, it } from 'vitest';
import { transliterate } from '../engine';
import { DEFAULT_LEXICON_REPOSITORY } from '../../data/lexicon';
import {
  EvidenceExtractionError,
  generateCandidateId,
  generateEvidenceId,
  LexicalCandidate,
  LexicalEvidence,
  LexicalEvidenceRepository,
  LexicalEvidenceSource,
  RawSourceRecord,
  RomanizationScheme,
  synthesizeCandidateFromEvidence
} from './index';

describe('Lexical Evidence & Candidate Architecture', () => {
  describe('A. Evidence preserves source observation', () => {
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

  describe('C. Multiple observations coexist', () => {
    it('allows multiple external sources to provide conflicting romanizations for the same Persian form without overwriting', () => {
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
  });

  describe('D. Candidate references evidence', () => {
    it('synthesizes candidate with references to supporting evidence and flags conflicting observations', () => {
      const evi1: LexicalEvidence = {
        id: 'evi-1',
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: 'r-1',
        sourceUri: null,
        sourceField: '100$a',
        persianForm: 'حافظ',
        observedRomanization: 'Ḥāfiẓ',
        romanizationScheme: 'ALA_LC',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'LOC', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const evi2: LexicalEvidence = {
        id: 'evi-2',
        sourceType: 'SCHOLARLY_DICTIONARY',
        sourceRecordId: 'r-2',
        sourceUri: null,
        sourceField: 'entry',
        persianForm: 'حافظ',
        observedRomanization: 'Ḥāfez',
        romanizationScheme: 'LOCAL',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'STEINGASS', retrievalMethod: 'MANUAL', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const candidate = synthesizeCandidateFromEvidence('حافظ', [evi1, evi2], {
        entityType: 'PERSON',
        proposedCanonical: null,
        notes: 'Disagreement between classical / library Ḥāfiẓ and contemporary scholarly Ḥāfez'
      });

      expect(candidate.persianForm).toBe('حافظ');
      expect(candidate.normalizedForm).toBe('حافظ');
      expect(candidate.evidenceIds).toEqual(['evi-1', 'evi-2']);
      expect(candidate.status).toBe('REVIEW_REQUIRED');
      expect(candidate.conflicts.length).toBe(2);
      expect(candidate.derivationProvenance.strategy).toBe('MULTI_EVIDENCE_SYNTHESIS');
    });

    it('synthesizes candidate as UNREVIEWED when all observations agree', () => {
      const evi1: LexicalEvidence = {
        id: 'evi-a',
        sourceType: 'ENCYCLOPEDIA',
        sourceRecordId: 'e-1',
        sourceUri: null,
        sourceField: 'headword',
        persianForm: 'فردوسی',
        observedRomanization: 'Firdawsī',
        romanizationScheme: 'IJMES',
        entityType: 'PERSON',
        context: null,
        provenance: { sourceId: 'IRANICA', retrievalMethod: 'API', retrievedAt: '2026-10-05T00:00:00Z' },
        status: 'OBSERVED'
      };

      const candidate = synthesizeCandidateFromEvidence('فردوسی', [evi1]);
      expect(candidate.evidenceIds).toEqual(['evi-a']);
      expect(candidate.status).toBe('UNREVIEWED');
      expect(candidate.conflicts.length).toBe(0);
      expect(candidate.derivationProvenance.strategy).toBe('SINGLE_EVIDENCE');
    });
  });

  describe('E. Candidate is non-authoritative', () => {
    it('does not alter deterministic transliteration outputs or pollute the authoritative lexicon repository', () => {
      const input = 'حافظ شیرازی';

      // 1. Run transliteration before creating evidence or candidate
      const beforeResult = transliterate(input);

      // 2. Create evidence and candidate in evidence repository
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
        status: 'ACCEPTED', // Even if candidate status is marked ACCEPTED in review, it is still not in the authoritative lexicon
        derivationProvenance: {
          derivedAt: '2026-10-05T00:00:00Z',
          strategy: 'MANUAL_DRAFT'
        }
      };

      repo.addEvidence(evidence);
      repo.addCandidate(candidate);

      // Verify the evidence repository asserts its non-authoritative invariant
      expect(repo.assertNonAuthoritative()).toBe(true);

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
        proposedProfile: 'ijmes_title',
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
