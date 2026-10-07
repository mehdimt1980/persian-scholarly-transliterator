import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { DEFAULT_LEXICON_REPOSITORY } from '../../../data/lexicon';
import { LexiconRepository } from '../../lexicon/repository';
import { KaikkiEvidenceConnector } from './connector';
import {
  determineLemmaStatus,
  extractIpaObservations,
  extractKaikkiObservations,
  extractRawRomanizations,
  KAIKKI_EXTRACTOR_VERSION,
  KAIKKI_SOURCE_ID
} from './extractor';
import { KAIKKI_SAMPLE_FIXTURE_PATH } from './fixtures';
import {
  KaikkiParseError,
  parseKaikkiJsonlStream,
  parseRawKaikkiLine,
  validatePersianEntry
} from './parser';
import {
  analyzeLexiconOverlap,
  buildKaikkiAcquisitionReport,
  detectNormalizationCollisions,
  formatKaikkiSummary
} from './statistics';
import type { KaikkiRawEntry } from './types';

describe('Phase 7A: Kaikki Lexical Acquisition Pipeline', () => {
  describe('1. Streaming JSONL Parsing and Offset/Limit', () => {
    it('stream-parses JSONL lines incrementally without loading full dataset', async () => {
      const jsonlData = [
        JSON.stringify({ word: 'کتاب', lang_code: 'fa', pos: 'noun' }),
        JSON.stringify({ word: 'قلم', lang_code: 'fa', pos: 'noun' }),
        JSON.stringify({ word: 'دفتر', lang_code: 'fa', pos: 'noun' })
      ].join('\n');

      const stream = Readable.from([jsonlData]);
      const results = [];
      for await (const res of parseKaikkiJsonlStream(stream)) {
        results.push(res);
      }

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(results[0].entry?.word).toBe('کتاب');
      expect(results[1].entry?.word).toBe('قلم');
      expect(results[2].entry?.word).toBe('دفتر');
    });

    it('honors limit and offset parameters in stream parsing', async () => {
      const jsonlData = [
        JSON.stringify({ word: 'یک', lang_code: 'fa' }),
        JSON.stringify({ word: 'دو', lang_code: 'fa' }),
        JSON.stringify({ word: 'سه', lang_code: 'fa' }),
        JSON.stringify({ word: 'چهار', lang_code: 'fa' })
      ].join('\n');

      const stream = Readable.from([jsonlData]);
      const results = [];
      for await (const res of parseKaikkiJsonlStream(stream, { offset: 1, limit: 2 })) {
        results.push(res);
      }

      expect(results).toHaveLength(2);
      expect(results[0].entry?.word).toBe('دو');
      expect(results[1].entry?.word).toBe('سه');
    });
  });

  describe('2. Malformed Row Isolation and Strict Mode', () => {
    it('fails individual malformed JSON rows safely without crashing stream', async () => {
      const jsonlData = [
        '{"word": "سالم", "lang_code": "fa"}',
        '{"word": "شکسته", "invalid_json": ',
        '{"word": "درست", "lang_code": "fa"}'
      ].join('\n');

      const stream = Readable.from([jsonlData]);
      const results = [];
      for await (const res of parseKaikkiJsonlStream(stream, { strict: false })) {
        results.push(res);
      }

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('Malformed JSON');
      expect(results[2].success).toBe(true);
    });

    it('throws KaikkiParseError in strict mode when encountering malformed JSON', async () => {
      const jsonlData = '{"word": "خراب", "broken": ';
      const stream = Readable.from([jsonlData]);

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of parseKaikkiJsonlStream(stream, { strict: true })) {
          // consume
        }
      }).rejects.toThrow(KaikkiParseError);
    });
  });

  describe('3. Persian Language and Script Filtering', () => {
    it('accepts valid Persian entries with lang_code fa', () => {
      const valid = { word: 'آسمان', lang_code: 'fa', pos: 'noun' };
      const check = validatePersianEntry(valid);
      expect(check.isPersian).toBe(true);
    });

    it('rejects non-fa language entries', () => {
      const arabic = { word: 'كتاب', lang_code: 'ar', pos: 'noun' };
      const check = validatePersianEntry(arabic);
      expect(check.isPersian).toBe(false);
      expect(check.reason).toContain('Language code "ar" is not "fa"');
    });

    it('rejects entries with empty or whitespace-only words', () => {
      const empty = { word: '   ', lang_code: 'fa' };
      const check = validatePersianEntry(empty);
      expect(check.isPersian).toBe(false);
      expect(check.reason).toContain('missing or empty');
    });

    it('rejects non-Persian script forms', () => {
      const latin = { word: 'hello', lang_code: 'fa' };
      const check = validatePersianEntry(latin);
      expect(check.isPersian).toBe(false);
      expect(check.reason).toContain('does not contain Persian script characters');
    });

    it('rejects punctuation-only entries and isolated combining marks', () => {
      const punct = { word: '؟', lang_code: 'fa' };
      const checkPunct = validatePersianEntry(punct);
      expect(checkPunct.isPersian).toBe(false);
      expect(checkPunct.reason).toContain('combining marks or punctuation');

      const isolatedFatha = { word: '\u064E', lang_code: 'fa' };
      const checkDiacritic = validatePersianEntry(isolatedFatha);
      expect(checkDiacritic.isPersian).toBe(false);
      expect(checkDiacritic.reason).toContain('combining marks or punctuation');
    });
  });

  describe('4. Romanization Extraction and Scheme Assignment', () => {
    it('extracts romanizations from forms tagged with romanization', () => {
      const entry: KaikkiRawEntry = {
        word: 'کتاب',
        lang_code: 'fa',
        pos: 'noun',
        forms: [
          { form: 'ketâb', tags: ['romanization'] },
          { form: 'کتاب‌ها', tags: ['plural'] }
        ]
      };

      const romanizations = extractRawRomanizations(entry);
      expect(romanizations).toEqual(['ketâb']);
    });

    it('assigns LOCAL romanizationScheme and LEXICOGRAPHIC_DATASET sourceType to evidence', () => {
      const entry: KaikkiRawEntry = {
        word: 'کتاب',
        lang_code: 'fa',
        pos: 'noun',
        forms: [{ form: 'ketâb', tags: ['romanization'] }]
      };

      const observations = extractKaikkiObservations(entry, { now: () => '2026-10-07T12:00:00.000Z' });
      expect(observations).toHaveLength(1);
      const evi = observations[0].evidence;

      expect(evi.sourceType).toBe('LEXICOGRAPHIC_DATASET');
      expect(evi.romanizationScheme).toBe('LOCAL');
      expect(evi.observedRomanization).toBe('ketâb');
      expect(evi.persianForm).toBe('کتاب');
      expect(evi.provenance.sourceId).toBe(KAIKKI_SOURCE_ID);
      expect(evi.provenance.retrievalMethod).toBe('BULK_DATA');
      expect(evi.provenance.extractorVersion).toBe(KAIKKI_EXTRACTOR_VERSION);
    });
  });

  describe('5 & 6 & 7. Preservation of Multiple Romanizations and Exact Strings (No IJMES Rewriting)', () => {
    it('preserves all distinct romanizations without first-wins truncation', () => {
      const entry: KaikkiRawEntry = {
        word: 'گفتار',
        lang_code: 'fa',
        pos: 'noun',
        forms: [
          { form: 'guftār', tags: ['romanization'] },
          { form: 'goftâr', tags: ['romanization'] }
        ]
      };

      const observations = extractKaikkiObservations(entry);
      expect(observations).toHaveLength(2);

      const observedRoms = observations.map((o) => o.evidence.observedRomanization);
      expect(observedRoms).toEqual(['guftār', 'goftâr']);
    });

    it('never rewrites raw romanizations to IJMES at acquisition time', () => {
      const entry: KaikkiRawEntry = {
        word: 'گفتار',
        lang_code: 'fa',
        pos: 'noun',
        forms: [{ form: 'goftâr', tags: ['romanization'] }]
      };

      const observations = extractKaikkiObservations(entry);
      // Ensure 'â' is NOT rewritten to 'ā' or 'o' to 'u'
      expect(observations[0].evidence.observedRomanization).toBe('goftâr');
    });
  });

  describe('8. IPA Observations and Dialect Tags Preservation', () => {
    it('extracts and preserves IPA observations with dialect and regional tags', () => {
      const entry: KaikkiRawEntry = {
        word: 'روز',
        lang_code: 'fa',
        pos: 'noun',
        sounds: [
          { ipa: '/roːz/', tags: ['Classical-Persian'] },
          { ipa: '/ruːz/', tags: ['Dari'] },
          { ipa: '/ɾuːz/', tags: ['Iranian-Persian'], note: 'standard modern' }
        ]
      };

      const ipas = extractIpaObservations(entry);
      expect(ipas).toHaveLength(3);
      expect(ipas[0]).toEqual({ ipa: '/roːz/', tags: ['Classical-Persian'], note: undefined });
      expect(ipas[1]).toEqual({ ipa: '/ruːz/', tags: ['Dari'], note: undefined });
      expect(ipas[2]).toEqual({ ipa: '/ɾuːz/', tags: ['Iranian-Persian'], note: 'standard modern' });
    });
  });

  describe('9. Lemma vs Non-Lemma / Form-Of Detection', () => {
    it('identifies standard primary lemma entries', () => {
      const entry: KaikkiRawEntry = {
        word: 'درخت',
        lang_code: 'fa',
        pos: 'noun',
        senses: [{ glosses: ['tree'] }]
      };

      const { lemmaStatus, lemmaRelation } = determineLemmaStatus(entry);
      expect(lemmaStatus).toBe('LEMMA');
      expect(lemmaRelation).toBeUndefined();
    });

    it('identifies form_of senses and captures parent lemma relationship', () => {
      const entry: KaikkiRawEntry = {
        word: 'فهرست‌ها',
        lang_code: 'fa',
        pos: 'noun',
        senses: [
          {
            glosses: ['plural of فهرست'],
            tags: ['plural', 'form-of'],
            form_of: [{ word: 'فهرست' }]
          }
        ]
      };

      const { lemmaStatus, lemmaRelation } = determineLemmaStatus(entry);
      expect(lemmaStatus).toBe('NON_LEMMA_FORM');
      expect(lemmaRelation).toEqual({
        kind: 'FORM_OF',
        lemma: 'فهرست',
        tags: ['plural', 'form-of']
      });
    });
  });

  describe('10 & 11. Deterministic Evidence IDs and Rerun Idempotence', () => {
    it('generates deterministic evidence IDs for identical observations', () => {
      const entry: KaikkiRawEntry = {
        word: 'کتاب',
        lang_code: 'fa',
        pos: 'noun',
        forms: [{ form: 'ketâb', tags: ['romanization'] }]
      };

      const obs1 = extractKaikkiObservations(entry, { now: () => '2026-10-07T00:00:00.000Z' });
      const obs2 = extractKaikkiObservations(entry, { now: () => '2026-10-07T00:00:00.000Z' });

      expect(obs1[0].evidence.id).toBe(obs2[0].evidence.id);
      expect(obs1[0].evidence.id).toMatch(/^evi-kaikki-enwiktionary-fa-[a-f0-9]{16}$/);
    });

    it('yields identical candidate IDs across multiple pipeline runs on the same input', async () => {
      const connector = new KaikkiEvidenceConnector();
      const res1 = await connector.processFile(KAIKKI_SAMPLE_FIXTURE_PATH);
      const res2 = await connector.processFile(KAIKKI_SAMPLE_FIXTURE_PATH);

      expect(res1.evidence.map((e) => e.id)).toEqual(res2.evidence.map((e) => e.id));
      expect(res1.candidates.map((c) => c.id)).toEqual(res2.candidates.map((c) => c.id));
    });
  });

  describe('12. Normalization Collision Reporting', () => {
    it('detects and reports when different raw spellings collapse to the same normalized form', () => {
      const entry1: KaikkiRawEntry = {
        word: 'كتاب', // Arabic kaf (U+0643)
        lang_code: 'fa',
        pos: 'noun',
        forms: [{ form: 'ketâb', tags: ['romanization'] }]
      };
      const entry2: KaikkiRawEntry = {
        word: 'کتاب', // Persian kaf (U+06A9)
        lang_code: 'fa',
        pos: 'noun',
        forms: [{ form: 'ketâb', tags: ['romanization'] }]
      };

      const obs = [
        ...extractKaikkiObservations(entry1),
        ...extractKaikkiObservations(entry2)
      ];

      const collisions = detectNormalizationCollisions(obs);
      expect(collisions).toHaveLength(1);
      expect(collisions[0].normalizedForm).toBe('کتاب');
      expect(collisions[0].rawForms).toEqual(['كتاب', 'کتاب']);
    });
  });

  describe('13 & 14. Lexicon Overlap Analysis and Zero Lexicon Mutation', () => {
    it('analyzes overlap with LexiconRepository strictly read-only', () => {
      const initialEntryCount = DEFAULT_LEXICON_REPOSITORY.getAllEntries().length;

      const normMap = new Map<string, { rawWords: Set<string>; romanizations: Set<string> }>([
        ['کتاب', { rawWords: new Set(['کتاب']), romanizations: new Set(['ketâb']) }],
        ['واژه‌جدیدناشناس', { rawWords: new Set(['واژه‌جدیدناشناس']), romanizations: new Set(['vâže']) }]
      ]);

      const { overlapCount, newFormCount, overlapItems } = analyzeLexiconOverlap(
        normMap,
        DEFAULT_LEXICON_REPOSITORY
      );

      expect(overlapCount).toBe(1);
      expect(newFormCount).toBe(1);
      expect(overlapItems[0].inLexicon).toBe(true);
      expect(overlapItems[1].inLexicon).toBe(false);

      // Verify ZERO mutation
      expect(DEFAULT_LEXICON_REPOSITORY.getAllEntries().length).toBe(initialEntryCount);
    });
  });

  describe('15 & 16. Candidates Non-Authoritative and Zero Promotion Invariant', () => {
    it('ensures synthesized candidates have null proposedCanonical and UNREVIEWED status', async () => {
      const connector = new KaikkiEvidenceConnector();
      const result = await connector.processFile(KAIKKI_SAMPLE_FIXTURE_PATH);

      expect(result.candidates.length).toBeGreaterThan(0);
      for (const cand of result.candidates) {
        expect(cand.proposedCanonical).toBeNull();
        expect(cand.status).toBe('UNREVIEWED');
        expect(cand.adjudication).toBeUndefined();
      }

      expect(result.report.promotionCount).toBe(0);
      expect(result.report.authoritativeLexiconChanges).toBe(0);
    });
  });

  describe('17. Full Pipeline Integration on Sample Fixture', () => {
    it('processes sample fixture and produces formatted summary conforming to specifications', async () => {
      expect(fs.existsSync(KAIKKI_SAMPLE_FIXTURE_PATH)).toBe(true);

      const connector = new KaikkiEvidenceConnector();
      const result = await connector.processFile(KAIKKI_SAMPLE_FIXTURE_PATH);

      const report = result.report;
      expect(report.source).toBe(KAIKKI_SOURCE_ID);
      expect(report.rowsRead).toBe(10);
      expect(report.malformedRows).toBe(1); // 1 broken row
      expect(report.validPersianRecords).toBe(7); // 7 valid unique entries
      expect(report.promotionCount).toBe(0);
      expect(report.authoritativeLexiconChanges).toBe(0);

      const summaryText = formatKaikkiSummary(report);
      expect(summaryText).toContain('Kaikki Persian Acquisition Pilot');
      expect(summaryText).toMatch(/Automatically promoted:\s+0/);
      expect(summaryText).toMatch(/Authoritative lexicon changes:\s+0/);
    });
  });
});
