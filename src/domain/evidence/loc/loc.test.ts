import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EvidenceImmutabilityViolationError,
  LexicalEvidenceRepository
} from '../index';
import {
  extractEvidenceFromMarcRecord,
  hasPersianLanguageEvidence,
  LocClient,
  LocEvidenceConnector,
  parseMarcXml,
  parseSubfield6,
  resolveMarc880Linkages
} from './index';

function loadFixture(filename: string): string {
  const filePath = path.join(__dirname, 'fixtures', filename);
  return fs.readFileSync(filePath, 'utf8');
}

describe('Library of Congress Pilot Evidence Connector', () => {
  const genuine2016404617Xml = loadFixture('2016404617.marcxml.xml');
  const genuine2002341405Xml = loadFixture('2002341405.marcxml.xml');
  const genuine2025364468Xml = loadFixture('2025364468.marcxml.xml');
  const syntheticXml = loadFixture('syntheticEdgeCases.marcxml.xml');

  describe('1. Pure MARCXML Parsing & Entity Decoding', () => {
    it('parses genuine LoC Saʻdī manuscript record 2016404617 correctly', () => {
      const records = parseMarcXml(genuine2016404617Xml);
      expect(records.length).toBe(1);

      const rec = records[0];
      expect(rec.lccn).toBe('2016404617');
      expect(rec.language).toBe('per');
      expect(rec.sourceUri).toBe('https://lccn.loc.gov/2016404617');

      // Check decoded entities in 100$a and 880$a
      const df100 = rec.dataFields.find((df) => df.tag === '100');
      expect(df100?.subfields.find((sf) => sf.code === 'a')?.value).toBe('Saʻdī,');

      const df880s = rec.dataFields.filter((df) => df.tag === '880');
      expect(df880s.length).toBe(3);
      expect(df880s[0].subfields.find((sf) => sf.code === 'a')?.value).toBe('سعدى.');
    });

    it('extracts all records from a multi-record collection safely', () => {
      const records = parseMarcXml(syntheticXml);
      expect(records.length).toBe(5);
      expect(records.map((r) => r.lccn)).toEqual([
        'syn0001',
        'syn0002',
        'syn0003',
        'syn0004',
        'syn0005'
      ]);
    });
  });

  describe('2. MARC $6 Linkage Parsing & Resolution', () => {
    it('parses various valid $6 values into tag, occurrence, and script metadata', () => {
      const p1 = parseSubfield6('880-01');
      expect(p1).toEqual({
        linkingTag: '880',
        occurrenceNumber: '01',
        scriptCode: undefined,
        orientationCode: undefined,
        raw: '880-01'
      });

      const p2 = parseSubfield6('100-01/(3/r');
      expect(p2).toEqual({
        linkingTag: '100',
        occurrenceNumber: '01',
        scriptCode: '3',
        orientationCode: 'r',
        raw: '100-01/(3/r'
      });

      const p3 = parseSubfield6('700-70/(3/r');
      expect(p3).toEqual({
        linkingTag: '700',
        occurrenceNumber: '70',
        scriptCode: '3',
        orientationCode: 'r',
        raw: '700-70/(3/r'
      });
    });

    it('returns null for invalid $6 syntax', () => {
      expect(parseSubfield6('')).toBeNull();
      expect(parseSubfield6('invalid')).toBeNull();
      expect(parseSubfield6('88-01')).toBeNull(); // tag must be 3 digits
    });

    it('pairs fields strictly by tag and occurrence number, not array order', () => {
      const records = parseMarcXml(genuine2016404617Xml);
      const linkedPairs = resolveMarc880Linkages(records[0]);

      expect(linkedPairs.length).toBe(3);

      // Pair 1: 100 ↔ 880(100-01)
      expect(linkedPairs[0].tag).toBe('100');
      expect(linkedPairs[0].occurrenceNumber).toBe('01');
      expect(linkedPairs[0].regularField?.tag).toBe('100');
      expect(linkedPairs[0].alternateField.tag).toBe('880');

      // Pair 2: 240 ↔ 880(240-02)
      expect(linkedPairs[1].tag).toBe('240');
      expect(linkedPairs[1].occurrenceNumber).toBe('02');
      expect(linkedPairs[1].regularField?.tag).toBe('240');

      // Pair 3: 245 ↔ 880(245-03)
      expect(linkedPairs[2].tag).toBe('245');
      expect(linkedPairs[2].occurrenceNumber).toBe('03');
      expect(linkedPairs[2].regularField?.tag).toBe('245');
    });
  });

  describe('3. Required Extraction Scenarios (A through J)', () => {
    const syntheticRecords = parseMarcXml(syntheticXml);

    // Scenario A: Valid 245 ↔ 880 pair
    it('A. extracts valid 245 ↔ 880 title pair with exact source strings preserved', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0005')!;
      const evidence = extractEvidenceFromMarcRecord(rec);

      const titleEvidence = evidence.find((e) => e.sourceField?.includes('245$a'));
      expect(titleEvidence).toBeDefined();
      expect(titleEvidence?.persianForm).toBe('غزلیات خواجه حافظ شیرازی /');
      expect(titleEvidence?.observedRomanization).toBe('Ghazalīyāt-i Khvājah Ḥāfiẓ-i Shīrāzī /');
      expect(titleEvidence?.romanizationScheme).toBe('ALA_LC');
      expect(titleEvidence?.entityType).toBe('TITLE');
      expect(titleEvidence?.sourceType).toBe('LIBRARY_CATALOG');

      const subtitleEvidence = evidence.find((e) => e.sourceField?.includes('245$b'));
      expect(subtitleEvidence).toBeDefined();
      expect(subtitleEvidence?.persianForm).toBe('با مقدمهٔ دکتر محمد معین.');
      expect(subtitleEvidence?.observedRomanization).toBe('bā muqaddamah-ʼi Duktur Muḥammad Muʻīn.');
      expect(subtitleEvidence?.entityType).toBe('TITLE');
    });

    // Scenario B: Valid name pair
    it('B. maps 100$a ↔ 880(100-xx)$a to PERSON entity type', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0005')!;
      const evidence = extractEvidenceFromMarcRecord(rec);

      const nameEvidence = evidence.find((e) => e.sourceField?.includes('100$a'));
      expect(nameEvidence).toBeDefined();
      expect(nameEvidence?.persianForm).toBe('حافظ،');
      expect(nameEvidence?.observedRomanization).toBe('Ḥāfiẓ,');
      expect(nameEvidence?.entityType).toBe('PERSON');
    });

    // Scenario C: Occurrence mismatch
    it('C. does NOT pair fields when occurrence numbers mismatch (880-02 vs 245-03)', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0001')!;
      const evidence = extractEvidenceFromMarcRecord(rec);

      // Because occurrence mismatched (880-02 vs 245-03), it becomes an unlinked alternate field
      expect(evidence.length).toBe(1);
      expect(evidence[0].persianForm).toBe('دیوان حافظ.');
      expect(evidence[0].observedRomanization).toBeNull(); // No romanization paired
    });

    // Scenario D: Orphan 880 with occurrence 00
    it('D. handles orphan 880 with occurrence 00 by preserving Persian-only evidence with observedRomanization: null', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0002')!;
      const evidence = extractEvidenceFromMarcRecord(rec);

      expect(evidence.length).toBe(1);
      expect(evidence[0].persianForm).toBe('رباعیات خیام.');
      expect(evidence[0].observedRomanization).toBeNull();
      expect(evidence[0].sourceField).toBe('880[245-00/(3/r]$a');
    });

    // Scenario E: Non-Persian alternate script
    it('E. skips Cyrillic/non-Persian alternate script data without extracting evidence', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0003')!;
      const evidence = extractEvidenceFromMarcRecord(rec);

      expect(evidence.length).toBe(0);
    });

    // Scenario F: No Persian language evidence
    it('F. conservatively skips Arabic-script records lacking positive Persian language evidence', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0004')!;
      expect(hasPersianLanguageEvidence(rec)).toBe(false);

      const evidence = extractEvidenceFromMarcRecord(rec);
      expect(evidence.length).toBe(0);
    });

    // Scenario G: Exact raw preservation
    it('G. preserves whitespace, Unicode characters, diacritics, and punctuation exactly as observed', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0005')!;
      const evidence = extractEvidenceFromMarcRecord(rec);

      const e245b = evidence.find((e) => e.sourceField?.includes('245$b'))!;
      // Diacritics: ʼ (U+02BC modifier letter apostrophe) and ḥ (U+1E25) and ī (U+12B)
      expect(e245b.observedRomanization).toBe('bā muqaddamah-ʼi Duktur Muḥammad Muʻīn.');
      // Persian punctuation and hamzah/yeh above
      expect(e245b.persianForm).toBe('با مقدمهٔ دکتر محمد معین.');
    });

    // Scenario H: Provenance metadata
    it('H. populates complete and auditable LoC provenance metadata', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0005')!;
      const evidence = extractEvidenceFromMarcRecord(rec, {
        extractorVersion: '1.0.0-test-pilot',
        now: () => '2026-10-06T10:00:00Z'
      });

      expect(evidence.length).toBeGreaterThan(0);
      const item = evidence[0];
      expect(item.provenance.sourceId).toBe('LOC');
      expect(item.provenance.sourceTitle).toBe('Library of Congress Catalog');
      expect(item.provenance.sourceOrganization).toBe('Library of Congress');
      expect(item.provenance.retrievalMethod).toBe('API');
      expect(item.provenance.retrievedAt).toBe('2026-10-06T10:00:00Z');
      expect(item.provenance.extractorVersion).toBe('1.0.0-test-pilot');
      expect(item.sourceRecordId).toBe('syn0005');
      expect(item.sourceUri).toBe('https://lccn.loc.gov/syn0005');
      expect(item.status).toBe('OBSERVED');
    });

    // Scenario I: Duplicate ingestion idempotency
    it('I. produces identical deterministic evidence IDs for repeated extraction of unchanged MARC observation', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0005')!;
      const ev1 = extractEvidenceFromMarcRecord(rec, { now: () => '2026-10-06T10:00:00Z' });
      const ev2 = extractEvidenceFromMarcRecord(rec, { now: () => '2026-10-06T11:00:00Z' });

      expect(ev1.map((e) => e.id)).toEqual(ev2.map((e) => e.id));

      const repo = new LexicalEvidenceRepository();
      repo.addEvidenceBatch(ev1);
      expect(repo.getEvidenceCount()).toBe(ev1.length);

      // Re-adding identical evidence succeeds idempotently
      expect(() => repo.addEvidenceBatch(ev1)).not.toThrow();
      expect(repo.getEvidenceCount()).toBe(ev1.length);
    });

    // Scenario J: Altered observation fails closed on ID conflict
    it('J. fails closed when an altered observation with same ID is re-ingested into repository', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0005')!;
      const [ev] = extractEvidenceFromMarcRecord(rec);

      const repo = new LexicalEvidenceRepository();
      repo.addEvidence(ev);

      const alteredEv = {
        ...ev,
        observedRomanization: 'AlteredRomanization'
      };

      expect(() => repo.addEvidence(alteredEv)).toThrow(EvidenceImmutabilityViolationError);
    });
  });

  describe('4. Genuine Library of Congress Fixture Validations', () => {
    it('extracts expected linked pairs from Saʻdī Gulistān manuscript (LCCN 2016404617)', () => {
      const records = parseMarcXml(genuine2016404617Xml);
      const evidence = extractEvidenceFromMarcRecord(records[0]);

      expect(evidence.length).toBe(3);

      // 100$a: Saʻdī, ↔ سعدى.
      const saadi = evidence.find((e) => e.entityType === 'PERSON')!;
      expect(saadi.observedRomanization).toBe('Saʻdī,');
      expect(saadi.persianForm).toBe('سعدى.');
      expect(saadi.sourceField).toBe('100$a ↔ 880[100-01/(3/r]$a');

      // 240$a: Gulistān ↔ گلستان
      const gulistanUniform = evidence.find((e) => e.sourceField?.includes('240$a'))!;
      expect(gulistanUniform.observedRomanization).toBe('Gulistān');
      expect(gulistanUniform.persianForm).toBe('گلستان');
      expect(gulistanUniform.entityType).toBe('WORK');

      // 245$a: Kitāb-i Gulistān. ↔ كتاب گلستان.
      const gulistanTitle = evidence.find((e) => e.sourceField?.includes('245$a'))!;
      expect(gulistanTitle.observedRomanization).toBe('Kitāb-i Gulistān.');
      expect(gulistanTitle.persianForm).toBe('كتاب گلستان.');
      expect(gulistanTitle.entityType).toBe('TITLE');
    });

    it('extracts expected personal names, corporate bodies, and titles from Modern Catalog (LCCN 2002341405)', () => {
      const records = parseMarcXml(genuine2002341405Xml);
      const evidence = extractEvidenceFromMarcRecord(records[0]);

      expect(evidence.length).toBeGreaterThan(0);

      // Verify presence of title 245$a (Mīzān al-ṭibb)
      const title = evidence.find((e) => e.sourceField?.includes('245$a'))!;
      expect(title).toBeDefined();
      expect(title.persianForm).toContain('ميزان الطب');
      expect(title.observedRomanization).toContain('Mīzān al-ṭibb');

      // Verify all extracted records have ALA_LC scheme and LIBRARY_CATALOG sourceType
      for (const ev of evidence) {
        expect(ev.romanizationScheme).toBe('ALA_LC');
        expect(ev.sourceType).toBe('LIBRARY_CATALOG');
        expect(ev.provenance.sourceId).toBe('LOC');
      }
    });

    it('extracts multiple personal name added entries from Lithograph Periodicals (LCCN 2025364468)', () => {
      const records = parseMarcXml(genuine2025364468Xml);
      const evidence = extractEvidenceFromMarcRecord(records[0]);

      expect(evidence.length).toBeGreaterThan(3);

      const persons = evidence.filter((e) => e.entityType === 'PERSON');
      expect(persons.length).toBeGreaterThanOrEqual(3);

      // Verify specific editor 700$a
      const editor = persons.find((p) => p.persianForm.includes('محمد حسن خان'));
      expect(editor).toBeDefined();
      expect(editor?.observedRomanization).toContain('Muḥammad Ḥasan Khān');
    });
  });

  describe('5. LocEvidenceConnector Contract & Safety', () => {
    it('implements LexicalEvidenceSource interface and extracts from raw record offline', () => {
      const connector = new LocEvidenceConnector();
      expect(connector.sourceId).toBe('LOC');
      expect(connector.sourceType).toBe('LIBRARY_CATALOG');
      expect(connector.defaultScheme).toBe('ALA_LC');

      const evidence = connector.extractEvidence({
        sourceId: 'LOC',
        rawIdentifier: '2016404617',
        payload: genuine2016404617Xml,
        fetchedAt: '2026-10-06T12:00:00Z'
      });

      expect(evidence.length).toBe(3);
    });

    it('handles simulated HTTP 429 rate limit with LocRateLimitError', async () => {
      const mockFetch = async () =>
        new Response('Rate limited', {
          status: 429,
          headers: { 'Retry-After': '30' }
        });

      const client = new LocClient({ fetchFn: mockFetch as any });
      await expect(client.fetchLccn('2016404617')).rejects.toThrow(/Rate limit exceeded/);
    });
  });
});
