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
  LocClientError,
  LocEvidenceConnector,
  LocRateLimitError,
  LocSruDiagnosticError,
  MarcRecord,
  MarcXmlParseError,
  OFFICIAL_LOC_HTTPS_SRU_URL,
  parseMarcXml,
  parseSruResponse,
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

  describe('1. Endpoint Configuration & HTTPS Transport Invariants', () => {
    it('uses the official HTTPS SRU endpoint as default', () => {
      const client = new LocClient({ allowInsecureHttp: true });
      expect(client.baseUrl).toBe(OFFICIAL_LOC_HTTPS_SRU_URL);
      expect(client.baseUrl).toBe('https://lx2.loc.gov/sru/lcdb');
    });

    it('rejects insecure HTTP base URLs for production client requests by default', () => {
      expect(
        () => new LocClient({ baseUrl: 'http://lx2.loc.gov:210/LCDB' })
      ).toThrow(LocClientError);
    });

    it('permits HTTP endpoints when allowInsecureHttp is set for local test mocks', () => {
      expect(
        () => new LocClient({ baseUrl: 'http://lx2.loc.gov:210/LCDB', allowInsecureHttp: true })
      ).not.toThrow();
    });
  });

  describe('2. SRU Response Parsing, Structural Validation, & Security Invariants', () => {
    it('parses valid SRU response and extracts individual raw record XML payloads', () => {
      const sru = parseSruResponse(genuine2016404617Xml);
      expect(sru.numberOfRecords).toBe(1);
      expect(sru.diagnostics.length).toBe(0);
      expect(sru.records.length).toBe(1);
      expect(sru.rawRecords.length).toBe(1);
      expect(sru.records[0].lccn).toBe('2016404617');
    });

    it('A. throws MarcXmlParseError on truncated SRU envelope missing closing tag', () => {
      const truncatedXml = `<zs:searchRetrieveResponse xmlns:zs="http://www.loc.gov/zing/srw/">
  <zs:version>1.1</zs:version>
  <zs:numberOfRecords>1</zs:numberOfRecords>`;
      expect(() => parseSruResponse(truncatedXml)).toThrow(MarcXmlParseError);
    });

    it('B. throws MarcXmlParseError when numberOfRecords > 0 but record body is missing or truncated', () => {
      const missingRecordXml = `<?xml version="1.0"?>
<zs:searchRetrieveResponse xmlns:zs="http://www.loc.gov/zing/srw/">
  <zs:version>1.1</zs:version>
  <zs:numberOfRecords>1</zs:numberOfRecords>
  <zs:records>
  </zs:records>
</zs:searchRetrieveResponse>`;
      expect(() => parseSruResponse(missingRecordXml)).toThrow(
        /SRU response declared numberOfRecords=1 but contained 0 valid <record> elements/
      );
    });

    it('C. correctly preserves legitimate zero-result response (numberOfRecords = 0)', () => {
      const emptySruXml = `<?xml version="1.0"?>
<zs:searchRetrieveResponse xmlns:zs="http://www.loc.gov/zing/srw/">
  <zs:version>1.1</zs:version>
  <zs:numberOfRecords>0</zs:numberOfRecords>
</zs:searchRetrieveResponse>`;

      const sru = parseSruResponse(emptySruXml);
      expect(sru.numberOfRecords).toBe(0);
      expect(sru.records.length).toBe(0);
      expect(sru.diagnostics.length).toBe(0);
    });

    it('D. surfaces LocSruDiagnosticError on valid SRU diagnostic response', async () => {
      const diagnosticXml = `<?xml version="1.0"?>
<zs:searchRetrieveResponse xmlns:zs="http://www.loc.gov/zing/srw/">
  <zs:diagnostics xmlns:diag="http://www.loc.gov/zing/srw/diagnostic/">
    <diag:diagnostic>
      <diag:uri>info:srw/diagnostic/1/16</diag:uri>
      <diag:details>invalid_cql</diag:details>
      <diag:message>Unsupported index</diag:message>
    </diag:diagnostic>
  </zs:diagnostics>
</zs:searchRetrieveResponse>`;

      const mockFetch = async () => new Response(diagnosticXml, { status: 200 });
      const client = new LocClient({ fetchFn: mockFetch as any });

      await expect(client.searchSru('invalid_cql=foo')).rejects.toThrow(LocSruDiagnosticError);
    });

    it('E. throws MarcXmlParseError on malformed/unclosed MARC <record> or <datafield> tags', () => {
      const malformedRecordTagXml = `<record><controlfield tag="001">123</controlfield>`;
      expect(() => parseMarcXml(malformedRecordTagXml)).toThrow(MarcXmlParseError);

      const malformedDatafieldXml = `<record><datafield tag="245" ind1="1" ind2="0"><subfield code="a">Unclosed</subfield></record>`;
      expect(() => parseMarcXml(malformedDatafieldXml)).toThrow(/mismatched <datafield> tags/);
    });

    it('rejects DTD and entity declarations (XXE protection) with MarcXmlParseError', () => {
      const dtdPayload = `<?xml version="1.0"?>
<!DOCTYPE test [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<zs:searchRetrieveResponse xmlns:zs="http://www.loc.gov/zing/srw/">
  <zs:numberOfRecords>0</zs:numberOfRecords>
</zs:searchRetrieveResponse>`;

      expect(() => parseSruResponse(dtdPayload)).toThrow(
        /Document Type Definitions \(DTD\) and external entity declarations are strictly prohibited/
      );
      expect(() => parseMarcXml(dtdPayload)).toThrow(
        /Document Type Definitions \(DTD\) and external entity declarations are strictly prohibited/
      );
    });

    it('throws 404 when fetchLccn encounters a valid zero-result response', async () => {
      const emptySruXml = `<?xml version="1.0"?>
<zs:searchRetrieveResponse xmlns:zs="http://www.loc.gov/zing/srw/">
  <zs:version>1.1</zs:version>
  <zs:numberOfRecords>0</zs:numberOfRecords>
</zs:searchRetrieveResponse>`;

      const mockFetch = async () => new Response(emptySruXml, { status: 200 });
      const client = new LocClient({ fetchFn: mockFetch as any });

      await expect(client.fetchLccn('0000000000')).rejects.toThrow(/No record found for LCCN "0000000000"/);
    });

    it('throws on LCCN mismatch between requested LCCN and returned MARC record', async () => {
      const mockFetch = async () => new Response(genuine2016404617Xml, { status: 200 });
      const client = new LocClient({ fetchFn: mockFetch as any });

      // Requesting 9999999999 but mock returns 2016404617
      await expect(client.fetchLccn('9999999999')).rejects.toThrow(/LCCN mismatch in LoC response/);
    });

    it('throws MarcXmlParseError on empty or non-XML response payloads', () => {
      expect(() => parseSruResponse('')).toThrow(MarcXmlParseError);
      expect(() => parseSruResponse('plain text error')).toThrow(MarcXmlParseError);
    });
  });

  describe('3. MARC $6 Linkage Parsing & Hardened Semantics', () => {
    it('parses valid 2-digit $6 formats correctly', () => {
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

      const p3 = parseSubfield6('245-00/(3/r');
      expect(p3).toEqual({
        linkingTag: '245',
        occurrenceNumber: '00',
        scriptCode: '3',
        orientationCode: 'r',
        raw: '245-00/(3/r'
      });

      const p4 = parseSubfield6('700-70');
      expect(p4).toEqual({
        linkingTag: '700',
        occurrenceNumber: '70',
        scriptCode: undefined,
        orientationCode: undefined,
        raw: '700-70'
      });
    });

    it('rejects 1-digit and 3-digit occurrence numbers as invalid $6 syntax', () => {
      // 1-digit occurrences must fail
      expect(parseSubfield6('880-1')).toBeNull();
      expect(parseSubfield6('245-3/(3/r')).toBeNull();

      // 3-digit occurrences must fail
      expect(parseSubfield6('880-001')).toBeNull();
      expect(parseSubfield6('245-123/(3/r')).toBeNull();
      expect(parseSubfield6('700-999')).toBeNull();
    });

    it('does not extract lexical evidence when occurrence number is 1-digit or 3-digit', () => {
      const rec1Digit: MarcRecord = {
        controlFields: [{ tag: '008', value: '260101s2026    xx            000 u per d' }],
        dataFields: [
          {
            tag: '245',
            ind1: '1',
            ind2: '0',
            subfields: [
              { code: '6', value: '880-1' },
              { code: 'a', value: 'Kitāb' }
            ]
          },
          {
            tag: '880',
            ind1: '1',
            ind2: '0',
            subfields: [
              { code: '6', value: '245-1/(3/r' },
              { code: 'a', value: 'کتاب' }
            ]
          }
        ]
      };
      expect(extractEvidenceFromMarcRecord(rec1Digit).length).toBe(0);

      const rec3Digit: MarcRecord = {
        controlFields: [{ tag: '008', value: '260101s2026    xx            000 u per d' }],
        dataFields: [
          {
            tag: '245',
            ind1: '1',
            ind2: '0',
            subfields: [
              { code: '6', value: '880-001' },
              { code: 'a', value: 'Kitāb' }
            ]
          },
          {
            tag: '880',
            ind1: '1',
            ind2: '0',
            subfields: [
              { code: '6', value: '245-001/(3/r' },
              { code: 'a', value: 'کتاب' }
            ]
          }
        ]
      };
      expect(extractEvidenceFromMarcRecord(rec3Digit).length).toBe(0);
    });

    it('correctly classifies MATCHED pairs on genuine Saʻdī record (2016404617)', () => {
      const records = parseMarcXml(genuine2016404617Xml);
      const linkedPairs = resolveMarc880Linkages(records[0]);

      expect(linkedPairs.length).toBe(3);
      for (const pair of linkedPairs) {
        expect(pair.status).toBe('MATCHED');
        expect(pair.regularField).toBeDefined();
        expect(pair.alternateField).toBeDefined();
      }
    });

    it('classifies occurrence 00 as OCCURRENCE_00 without regular counterpart', () => {
      const syntheticRecords = parseMarcXml(syntheticXml);
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0002')!;
      const linkedPairs = resolveMarc880Linkages(rec);

      expect(linkedPairs.length).toBe(1);
      expect(linkedPairs[0].status).toBe('OCCURRENCE_00');
      expect(linkedPairs[0].occurrenceNumber).toBe('00');
      expect(linkedPairs[0].regularField).toBeUndefined();
    });

    it('classifies occurrence mismatch as UNMATCHED_NONZERO and suppresses evidence extraction', () => {
      const syntheticRecords = parseMarcXml(syntheticXml);
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0001')!;
      const linkedPairs = resolveMarc880Linkages(rec);

      expect(linkedPairs.length).toBe(1);
      expect(linkedPairs[0].status).toBe('UNMATCHED_NONZERO');
      expect(linkedPairs[0].occurrenceNumber).toBe('03');

      // CRITICAL FIX: Unmatched nonzero occurrence must NOT extract lexical evidence
      const evidence = extractEvidenceFromMarcRecord(rec);
      expect(evidence.length).toBe(0);
    });

    it('classifies ambiguous duplicate regular linkages as AMBIGUOUS_DUPLICATE and suppresses extraction', () => {
      const syntheticRecords = parseMarcXml(syntheticXml);
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0006')!;
      const linkedPairs = resolveMarc880Linkages(rec);

      expect(linkedPairs.length).toBe(1);
      expect(linkedPairs[0].status).toBe('AMBIGUOUS_DUPLICATE');

      const evidence = extractEvidenceFromMarcRecord(rec);
      expect(evidence.length).toBe(0);
    });

    it('classifies malformed $6 as MALFORMED_LINKAGE and suppresses extraction', () => {
      const syntheticRecords = parseMarcXml(syntheticXml);
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0007')!;
      const linkedPairs = resolveMarc880Linkages(rec);

      expect(linkedPairs.length).toBe(1);
      expect(linkedPairs[0].status).toBe('MALFORMED_LINKAGE');

      const evidence = extractEvidenceFromMarcRecord(rec);
      expect(evidence.length).toBe(0);
    });
  });

  describe('4. Tightened Persian Language Identification & MARC 041 Semantics', () => {
    const syntheticRecords = parseMarcXml(syntheticXml);

    it('accepts records with 008/35-37 set to per', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0005')!;
      expect(hasPersianLanguageEvidence(rec)).toBe(true);
    });

    it('accepts records with 041$a set to per (strong content language)', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0010')!;
      expect(hasPersianLanguageEvidence(rec)).toBe(true);

      const evidence = extractEvidenceFromMarcRecord(rec);
      expect(evidence.length).toBe(1);
      expect(evidence[0].persianForm).toBe('فرهنگ فارسی و انگلیسی.');
    });

    it('accepts records with 041$d set to per (strong spoken/sung soundtrack language)', () => {
      const rec: MarcRecord = {
        controlFields: [{ tag: '008', value: '260101s2026    xx            000 u eng d' }],
        dataFields: [
          {
            tag: '041',
            ind1: '0',
            ind2: ' ',
            subfields: [{ code: 'd', value: 'per' }]
          }
        ]
      };
      expect(hasPersianLanguageEvidence(rec)).toBe(true);
    });

    it('rejects records where only subsidiary subtitles (041$j=per) are Persian (008=eng)', () => {
      const rec: MarcRecord = {
        controlFields: [{ tag: '008', value: '260101s2026    xx            000 u eng d' }],
        dataFields: [
          {
            tag: '041',
            ind1: '1',
            ind2: ' ',
            subfields: [{ code: 'j', value: 'per' }]
          }
        ]
      };
      expect(hasPersianLanguageEvidence(rec)).toBe(false);
    });

    it('rejects records where only subsidiary libretto (041$e=per) is Persian (008=eng)', () => {
      const rec: MarcRecord = {
        controlFields: [{ tag: '008', value: '260101s2026    xx            000 u eng d' }],
        dataFields: [
          {
            tag: '041',
            ind1: '1',
            ind2: ' ',
            subfields: [{ code: 'e', value: 'per' }]
          }
        ]
      };
      expect(hasPersianLanguageEvidence(rec)).toBe(false);
    });

    it('rejects Arabic translation of Persian work (041$a=ara, 041$h=per or 008=eng, 041$h=per)', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0008')!;
      // 041$h='per' indicates source of translation, not content language
      expect(hasPersianLanguageEvidence(rec)).toBe(false);

      const evidence = extractEvidenceFromMarcRecord(rec);
      expect(evidence.length).toBe(0);

      const rec2: MarcRecord = {
        controlFields: [{ tag: '008', value: '260101s2026    xx            000 u eng d' }],
        dataFields: [
          {
            tag: '041',
            ind1: '1',
            ind2: ' ',
            subfields: [{ code: 'h', value: 'per' }]
          }
        ]
      };
      expect(hasPersianLanguageEvidence(rec2)).toBe(false);
    });

    it('rejects records with misleading 546 translation notes and non-Persian language code', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0009')!;
      expect(hasPersianLanguageEvidence(rec)).toBe(false);

      const evidence = extractEvidenceFromMarcRecord(rec);
      expect(evidence.length).toBe(0);
    });

    it('rejects records with Arabic content language (008=ara)', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0004')!;
      expect(hasPersianLanguageEvidence(rec)).toBe(false);
    });
  });

  describe('5. Required Extraction Scenarios & Preservation (A through J)', () => {
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
    it('C. does NOT extract evidence when occurrence numbers mismatch (880-02 vs 245-03)', () => {
      const rec = syntheticRecords.find((r) => r.lccn === 'syn0001')!;
      const evidence = extractEvidenceFromMarcRecord(rec);
      expect(evidence.length).toBe(0);
    });

    // Scenario D: Orphan 880 with occurrence 00
    it('D. handles occurrence 00 unlinked representation by preserving Persian-only evidence with observedRomanization: null', () => {
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
    it('F. skips Arabic-script records lacking positive Persian language evidence', () => {
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
      expect(e245b.observedRomanization).toBe('bā muqaddamah-ʼi Duktur Muḥammad Muʻīn.');
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

  describe('6. Genuine Library of Congress Fixture Validations', () => {
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

    it('extracts expected personal names, corporate bodies, and titles from Mīzān al-ṭibb (LCCN 2002341405)', () => {
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

  describe('7. LocEvidenceConnector Contract & Transport Safety', () => {
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
      await expect(client.fetchLccn('2016404617')).rejects.toThrow(LocRateLimitError);
    });
  });
});
