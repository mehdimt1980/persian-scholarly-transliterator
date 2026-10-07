import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { DEFAULT_LEXICON_REPOSITORY } from '../../../data/lexicon';
import { KaikkiEvidenceConnector } from './connector';
import {
  buildKaikkiSourceRecordId,
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
  validatePersianEntry
} from './parser';
import {
  analyzeLexiconOverlap,
  detectNormalizationCollisions,
  formatKaikkiSummary
} from './statistics';
import type { KaikkiRawEntry } from './types';

describe('Phase 7A Hardened: Kaikki Lexical Acquisition Pipeline', () => {
  describe('1. Streaming JSONL Parsing and Valid-Record Offset', () => {
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

    it('honors valid-record offset ignoring preceding malformed and non-Persian lines', async () => {
      const jsonlData = [
        '{"word": "arabic", "lang_code": "ar"}', // non-fa
        '{"word": "broken", ',                   // malformed JSON
        JSON.stringify({ word: 'یک', lang_code: 'fa', pos: 'num' }),     // valid 1
        JSON.stringify({ word: 'دو', lang_code: 'fa', pos: 'num' }),     // valid 2
        JSON.stringify({ word: 'سه', lang_code: 'fa', pos: 'num' })      // valid 3
      ].join('\n');

      const stream = Readable.from([jsonlData]);
      const validYielded = [];
      for await (const res of parseKaikkiJsonlStream(stream, { offset: 1, limit: 1 })) {
        if (res.success && res.entry) {
          validYielded.push(res.entry.word);
        }
      }

      // Offset 1 skips "یک" (first valid record), yielding "دو" (second valid record)
      expect(validYielded).toEqual(['دو']);
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

  describe('4. Source Record Identity and Etymology Disambiguation', () => {
    it('constructs deterministic source record id including etymology number and head number', () => {
      const entry1: KaikkiRawEntry = {
        word: 'شیر',
        lang_code: 'fa',
        pos: 'noun',
        etymology_number: 1
      };
      const entry2: KaikkiRawEntry = {
        word: 'شیر',
        lang_code: 'fa',
        pos: 'noun',
        etymology_number: 2
      };

      const id1 = buildKaikkiSourceRecordId(entry1);
      const id2 = buildKaikkiSourceRecordId(entry2);

      expect(id1).toBe('شیر#fa#noun#etym:1');
      expect(id2).toBe('شیر#fa#noun#etym:2');
      expect(id1).not.toBe(id2);
    });

    it('generates distinct deterministic evidence IDs for different etymologies of the same word and pos', () => {
      const entry1: KaikkiRawEntry = {
        word: 'شیر',
        lang_code: 'fa',
        pos: 'noun',
        etymology_number: 1,
        forms: [{ form: 'šir', tags: ['romanization'] }]
      };
      const entry2: KaikkiRawEntry = {
        word: 'شیر',
        lang_code: 'fa',
        pos: 'noun',
        etymology_number: 2,
        forms: [{ form: 'šir', tags: ['romanization'] }]
      };

      const obs1 = extractKaikkiObservations(entry1);
      const obs2 = extractKaikkiObservations(entry2);

      expect(obs1[0].evidence.id).not.toBe(obs2[0].evidence.id);
      expect(obs1[0].evidence.sourceRecordId).toBe('شیر#fa#noun#etym:1');
      expect(obs2[0].evidence.sourceRecordId).toBe('شیر#fa#noun#etym:2');
    });
  });

  describe('5. Sense Identifiers (senseid array and id)', () => {
    it('preserves both singular id and Wiktextract senseid arrays without inventing IDs', () => {
      const entry: KaikkiRawEntry = {
        word: 'کتاب',
        lang_code: 'fa',
        pos: 'noun',
        senses: [
          { id: 'fa-ketab-1', glosses: ['book'] },
          { senseid: ['fa-ketab-sense-2', 'q12345'], glosses: ['written document'] }
        ]
      };

      const obs = extractKaikkiObservations(entry);
      expect(obs[0].metadata.sourceSenseIds).toEqual(['fa-ketab-1', 'fa-ketab-sense-2', 'q12345']);
      expect(obs[0].metadata.glosses).toEqual(['book', 'written document']);
    });
  });

  describe('6. Per-Romanization Metadata and Source Field Locators', () => {
    it('preserves per-romanization tags individually and ties sourceField to forms array index', () => {
      const entry: KaikkiRawEntry = {
        word: 'گفتار',
        lang_code: 'fa',
        pos: 'noun',
        forms: [
          { form: 'کتاب‌ها', tags: ['plural'] },                                      // index 0: non-romanization
          { form: 'guftār', tags: ['romanization', 'Classical-Persian'] },           // index 1
          { form: 'goftâr', tags: ['romanization', 'Iranian-Persian', 'standard'] } // index 2
        ]
      };

      const roms = extractRawRomanizations(entry);
      expect(roms).toHaveLength(2);
      expect(roms[0].sourceFormIndex).toBe(1);
      expect(roms[0].tags).toEqual(['romanization', 'Classical-Persian']);
      expect(roms[1].sourceFormIndex).toBe(2);
      expect(roms[1].tags).toEqual(['romanization', 'Iranian-Persian', 'standard']);

      const observations = extractKaikkiObservations(entry);
      expect(observations).toHaveLength(2);

      expect(observations[0].evidence.sourceField).toBe('forms[1]');
      expect(observations[0].metadata.romanizationTags).toEqual(['romanization', 'Classical-Persian']);
      expect(observations[0].metadata.sourceFormIndex).toBe(1);

      expect(observations[1].evidence.sourceField).toBe('forms[2]');
      expect(observations[1].metadata.romanizationTags).toEqual(['romanization', 'Iranian-Persian', 'standard']);
      expect(observations[1].metadata.sourceFormIndex).toBe(2);
    });
  });

  describe('7. Candidate Synthesis by Normalized Persian Form', () => {
    it('groups raw spelling variants into one normalized candidate while preserving distinct raw observations and reporting collisions', async () => {
      const jsonlData = [
        JSON.stringify({
          word: 'كتاب', // Arabic kaf
          lang_code: 'fa',
          pos: 'noun',
          forms: [{ form: 'ketâb', tags: ['romanization'] }]
        }),
        JSON.stringify({
          word: 'کتاب', // Persian kaf
          lang_code: 'fa',
          pos: 'noun',
          forms: [{ form: 'ketâb', tags: ['romanization'] }]
        })
      ].join('\n');

      const connector = new KaikkiEvidenceConnector();
      const result = await connector.processStream(Readable.from([jsonlData]), { collectObservations: true });

      // Two distinct raw observations
      expect(result.evidence).toHaveLength(2);
      expect(result.evidence![0].persianForm).toBe('كتاب');
      expect(result.evidence![1].persianForm).toBe('کتاب');
      expect(result.evidence![0].id).not.toBe(result.evidence![1].id);

      // Exactly ONE candidate synthesized for normalized form 'کتاب'
      expect(result.candidates).toHaveLength(1);
      const cand = result.candidates![0];
      expect(cand.persianForm).toBe('کتاب');
      expect(cand.normalizedForm).toBe('کتاب');
      expect(cand.evidenceIds).toEqual([result.evidence![0].id, result.evidence![1].id]);
      expect(cand.proposedCanonical).toBeNull();
      expect(cand.status).toBe('UNREVIEWED');

      // Normalization collision is captured in the report
      expect(result.report.normalizationCollisions).toHaveLength(1);
      expect(result.report.normalizationCollisions[0].normalizedForm).toBe('کتاب');
      expect(result.report.normalizationCollisions[0].rawForms).toEqual(['كتاب', 'کتاب']);
    });
  });

  describe('8. Lemma Status and --only-lemmas Filtering', () => {
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

    it('identifies form_of, alt_of, and non-lemma POS as NON_LEMMA_FORM', () => {
      const formOfEntry: KaikkiRawEntry = {
        word: 'فهرست‌ها',
        lang_code: 'fa',
        pos: 'noun',
        senses: [{ form_of: [{ word: 'فهرست' }], tags: ['form-of'] }]
      };
      const altOfEntry: KaikkiRawEntry = {
        word: 'طهران',
        lang_code: 'fa',
        pos: 'noun',
        senses: [{ alt_of: [{ word: 'تهران' }], tags: ['archaic'] }]
      };
      const inflVerbEntry: KaikkiRawEntry = {
        word: 'می‌روم',
        lang_code: 'fa',
        pos: 'verb_form'
      };

      expect(determineLemmaStatus(formOfEntry).lemmaStatus).toBe('NON_LEMMA_FORM');
      expect(determineLemmaStatus(altOfEntry).lemmaStatus).toBe('NON_LEMMA_FORM');
      expect(determineLemmaStatus(inflVerbEntry).lemmaStatus).toBe('NON_LEMMA_FORM');
    });

    it('strictly filters out NON_LEMMA_FORM and UNKNOWN_LEMMA_STATUS when --only-lemmas is set', async () => {
      const jsonlData = [
        JSON.stringify({ word: 'کتاب', lang_code: 'fa', pos: 'noun', forms: [{ form: 'ketâb', tags: ['romanization'] }] }),
        JSON.stringify({ word: 'فهرست‌ها', lang_code: 'fa', pos: 'noun', senses: [{ form_of: [{ word: 'فهرست' }] }] }),
        JSON.stringify({ word: 'ناشناس', lang_code: 'fa', pos: 'unknown_pos' })
      ].join('\n');

      const connector = new KaikkiEvidenceConnector();
      const result = await connector.processStream(Readable.from([jsonlData]), {
        onlyLemmas: true,
        collectObservations: true
      });

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates![0].persianForm).toBe('کتاب');
    });
  });

  describe('9. Read-Only Lexicon Overlap Analysis and Zero Lexicon Mutation', () => {
    it('analyzes overlap with LexiconRepository strictly read-only', () => {
      const initialEntryCount = DEFAULT_LEXICON_REPOSITORY.getAllEntries().length;

      const normMap = new Map([
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

      expect(DEFAULT_LEXICON_REPOSITORY.getAllEntries().length).toBe(initialEntryCount);
    });
  });

  describe('10. Scalable Streaming Mode (collectObservations: false)', () => {
    it('streams through dataset generating full report without holding observation arrays in memory', async () => {
      const connector = new KaikkiEvidenceConnector();
      const result = await connector.processFile(KAIKKI_SAMPLE_FIXTURE_PATH, {
        collectObservations: false
      });

      expect(result.observations).toBeUndefined();
      expect(result.evidence).toBeUndefined();
      expect(result.report.validPersianRecords).toBe(7);
      expect(result.report.distinctNormalizedForms).toBe(6);
      expect(result.report.candidateCount).toBe(6);
      expect(result.report.promotionCount).toBe(0);
    });
  });

  describe('11. Full Pipeline on Pilot Sample Fixture', () => {
    it('processes sample fixture cleanly maintaining all Phase 5/7A invariants', async () => {
      expect(fs.existsSync(KAIKKI_SAMPLE_FIXTURE_PATH)).toBe(true);

      const connector = new KaikkiEvidenceConnector();
      const result = await connector.processFile(KAIKKI_SAMPLE_FIXTURE_PATH);

      const report = result.report;
      expect(report.source).toBe(KAIKKI_SOURCE_ID);
      expect(report.extractorVersion).toBe(KAIKKI_EXTRACTOR_VERSION);
      expect(report.rowsRead).toBe(10);
      expect(report.malformedRows).toBe(1);
      expect(report.validPersianRecords).toBe(7);
      expect(report.distinctPersianForms).toBe(6);
      expect(report.distinctNormalizedForms).toBe(6);
      expect(report.candidateCount).toBe(6);
      expect(report.promotionCount).toBe(0);
      expect(report.authoritativeLexiconChanges).toBe(0);

      const summaryText = formatKaikkiSummary(report);
      expect(summaryText).toContain('Kaikki Persian Acquisition Pilot');
      expect(summaryText).toMatch(/Automatically promoted:\s+0/);
      expect(summaryText).toMatch(/Authoritative lexicon changes:\s+0/);
    });
  });
});
