import { describe, expect, it } from 'vitest';
import { DEFAULT_LEXICON_REPOSITORY, LEXICON } from '../../data/lexicon';
import { LexiconIntegrityError, LexiconRepository } from './repository';
import { LexicalEntry } from './types';

describe('Lexicon Repository and Data Integrity', () => {
  it('instantiates and provides indexed lookups by normalized form and ID', () => {
    const entry = DEFAULT_LEXICON_REPOSITORY.findByNormalized('ایران');
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('lex:iran');
    expect(entry?.category).toBe('proper-noun');
    expect(entry?.properName?.type).toBe('PLACE');

    const byId = DEFAULT_LEXICON_REPOSITORY.findById('lex:iran');
    expect(byId).toBe(entry);
  });

  it('validates the default scholarly lexicon integrity with zero errors', () => {
    const report = DEFAULT_LEXICON_REPOSITORY.validateIntegrity();
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('detects duplicate IDs and reports errors during validation', () => {
    const duplicateData: LexicalEntry[] = [
      {
        id: 'lex:duplicate',
        surface: 'کتاب',
        normalized: 'کتاب',
        readings: [{ canonical: 'kitāb', confidence: 0.9, source: 'Test source' }]
      },
      {
        id: 'lex:duplicate',
        surface: 'دفتر',
        normalized: 'دفتر',
        readings: [{ canonical: 'daftar', confidence: 0.9, source: 'Test source' }]
      }
    ];

    const repo = new LexiconRepository(duplicateData);
    const report = repo.validateIntegrity();
    expect(report.valid).toBe(false);
    expect(report.errors.some((err) => err.includes('Duplicate lexical entry id "lex:duplicate"'))).toBe(true);
  });

  it('detects duplicate normalized forms across entries and rejects collision authority', () => {
    const duplicateNormalized: LexicalEntry[] = [
      {
        id: 'lex:kitab_1',
        surface: 'کتاب',
        normalized: 'کتاب',
        readings: [{ canonical: 'kitāb_a', confidence: 0.9, source: 'Test source 1' }]
      },
      {
        id: 'lex:kitab_2',
        surface: 'کتاب',
        normalized: 'کتاب',
        readings: [{ canonical: 'kitāb_b', confidence: 0.9, source: 'Test source 2' }]
      }
    ];

    const repo = new LexiconRepository(duplicateNormalized);
    const report = repo.validateIntegrity();
    expect(report.valid).toBe(false);
    expect(report.errors.some((err) => err.includes('Duplicate lexical entry normalized form "کتاب"'))).toBe(true);
  });

  it('detects duplicate identical canonical readings within the same entry', () => {
    const duplicateReadings: LexicalEntry[] = [
      {
        id: 'lex:bad_readings',
        surface: 'کتاب',
        normalized: 'کتاب',
        readings: [
          { canonical: 'kitāb', confidence: 0.9, source: 'Source 1' },
          { canonical: 'kitāb', confidence: 0.9, source: 'Source 2' }
        ]
      }
    ];

    const repo = new LexiconRepository(duplicateReadings);
    const report = repo.validateIntegrity();
    expect(report.valid).toBe(false);
    expect(report.errors.some((err) => err.includes('duplicate canonical reading "kitāb"'))).toBe(true);
  });

  it('detects missing source citation metadata', () => {
    const missingSource: LexicalEntry[] = [
      {
        id: 'lex:no_source',
        surface: 'کتاب',
        normalized: 'کتاب',
        readings: [
          { canonical: 'kitāb', confidence: 0.9, source: '' }
        ]
      }
    ];

    const repo = new LexiconRepository(missingSource);
    const report = repo.validateIntegrity();
    expect(report.valid).toBe(false);
    expect(report.errors.some((err) => err.includes('lacks source citation metadata'))).toBe(true);
  });

  it('contains over 25 reviewed scholarly entries with academic provenance', () => {
    expect(LEXICON.length).toBeGreaterThanOrEqual(35);
    const constitution = DEFAULT_LEXICON_REPOSITORY.findByNormalized('مشروطه');
    expect(constitution).toBeDefined();
    expect(constitution?.readings[0].canonical).toBe('mashrūṭa');

    const parliament = DEFAULT_LEXICON_REPOSITORY.findByNormalized('مجلس');
    expect(parliament).toBeDefined();
    expect(parliament?.readings[0].canonical).toBe('majlis');

    const jurisprudence = DEFAULT_LEXICON_REPOSITORY.findByNormalized('فقه');
    expect(jurisprudence).toBeDefined();
    expect(jurisprudence?.readings[0].canonical).toBe('fiqh');

    const dynasty = DEFAULT_LEXICON_REPOSITORY.findByNormalized('قاجار');
    expect(dynasty?.properName?.type).toBe('DYNASTY');
    expect(dynasty?.readings[0].canonical).toBe('qājār');
  });

  describe('Fail-Closed Integrity Enforcement', () => {
    const entryA: LexicalEntry = {
      id: 'lex:kitab_a',
      surface: 'کتاب',
      normalized: 'کتاب',
      category: 'noun',
      readings: [{ canonical: 'kitāb-a', confidence: 0.9, source: 'Source A' }]
    };

    const entryB: LexicalEntry = {
      id: 'lex:kitab_b',
      surface: 'کتاب',
      normalized: 'کتاب',
      category: 'noun',
      readings: [{ canonical: 'kitāb-b', confidence: 0.9, source: 'Source B' }]
    };

    it('fails closed when duplicate normalized entries are passed in order [A, B]', () => {
      const repoAB = new LexiconRepository([entryA, entryB]);
      expect(repoAB.validateIntegrity().valid).toBe(false);
      expect(() => repoAB.assertValid()).toThrow(LexiconIntegrityError);
      expect(() => repoAB.findByNormalized('کتاب')).toThrow(LexiconIntegrityError);
      expect(() => repoAB.findById('lex:kitab_a')).toThrow(LexiconIntegrityError);
    });

    it('fails closed when duplicate normalized entries are passed in reverse order [B, A]', () => {
      const repoBA = new LexiconRepository([entryB, entryA]);
      expect(repoBA.validateIntegrity().valid).toBe(false);
      expect(() => repoBA.assertValid()).toThrow(LexiconIntegrityError);
      expect(() => repoBA.findByNormalized('کتاب')).toThrow(LexiconIntegrityError);
      expect(() => repoBA.findById('lex:kitab_b')).toThrow(LexiconIntegrityError);
    });

    it('fails closed on duplicate entry IDs regardless of normalized key', () => {
      const dupIdRepo = new LexiconRepository([
        { id: 'lex:same', surface: 'کتاب', normalized: 'کتاب', category: 'noun', readings: [{ canonical: 'kitāb', confidence: 0.9, source: 'Source 1' }] },
        { id: 'lex:same', surface: 'دفتر', normalized: 'دفتر', category: 'noun', readings: [{ canonical: 'daftar', confidence: 0.9, source: 'Source 2' }] }
      ]);
      expect(dupIdRepo.validateIntegrity().valid).toBe(false);
      expect(() => dupIdRepo.assertValid()).toThrow(LexiconIntegrityError);
      expect(() => dupIdRepo.findById('lex:same')).toThrow(LexiconIntegrityError);
    });
  });
});
