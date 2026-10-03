import { describe, expect, it } from 'vitest';
import { LEXICON } from '../../data/lexicon';
import { transliterate } from '../engine';
import { normalizePersian } from '../normalization';
import { analyzeOrthography } from '../orthography';
import { tokenize } from '../tokenizer';
import { LexicalEntry } from '../types';
import { analyzeMorphology } from './analyzeMorphology';
import { resolveMorphologicalToken } from './resolveMorphology';
import { PRODUCTIVE_SUFFIX_RULES } from './rules';

describe('productive plural morphology', () => {
  it('derives کتاب‌ها from a reviewed stem and plural rule', () => {
    const result = transliterate('کتاب‌ها');
    expect(result.output).toBe('kitāb-hā');
    expect(result.copyable).toBe(true);
    expect(result.morphology[0]).toMatchObject({ lexicalLookupStem: 'کتاب', stemCategory: 'noun', status: 'CONFIRMED', explicitIzafat: false });
    expect(result.morphology[0].morphemes.map((item) => item.type)).toEqual(['STEM', 'PLURAL_HA']);
    expect(result.morphology[0].morphemes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'STEM', normalizedStart: 0, normalizedEnd: 4 }),
      expect.objectContaining({ type: 'PLURAL_HA', normalizedStart: 5, normalizedEnd: 7 })
    ]));
    expect(result.morphology[0].evidence.map((item) => item.rule.id)).toEqual(expect.arrayContaining(['PERSIAN-MORPH-ZWNJ-EVIDENCE', 'PERSIAN-MORPH-PLURAL-HA', 'PERSIAN-MORPH-REVIEWED-STEM']));
    expect(LEXICON.some((entry) => entry.normalized === 'کتاب‌ها')).toBe(false);
  });

  it('uses the same rule for a second reviewed noun', () => {
    const result = transliterate('خانه‌ها');
    expect(result.output).toBe('khāna-hā');
    expect(result.morphology[0]).toMatchObject({ lexicalLookupStem: 'خانه', status: 'CONFIRMED' });
  });

  it('does not manufacture a stem reading for an unknown plural', () => {
    const result = transliterate('ناشناخته‌ها');
    expect(result.status).toBe('UNRESOLVED');
    expect(result.copyable).toBe(false);
    expect(result.morphology[0]).toMatchObject({ lexicalLookupStem: 'ناشناخته', status: 'CANDIDATE' });
  });

  it('does not assign plural semantics to an arbitrary ZWNJ boundary', () => {
    const result = transliterate('کتاب‌XYZ');
    expect(result.morphology).toEqual([]);
  });
});

describe('plural-host izāfat', () => {
  it('models های as plural ها plus explicit izāfat on the inflected host', () => {
    const result = transliterate('کتاب‌های ایران');
    expect(result.output).toBe('kitāb-hā-i īrān');
    expect(result.copyable).toBe(true);
    expect(result.morphology[0]).toMatchObject({ lexicalLookupStem: 'کتاب', explicitIzafat: true, status: 'CONFIRMED' });
    expect(result.morphology[0].morphemes[1]).toMatchObject({ type: 'PLURAL_HA', normalizedSurface: 'ها' });
    expect(result.relations[0]).toMatchObject({ sourceTokenIndex: 0, targetTokenIndex: 2, status: 'CONFIRMED' });
    expect(result.relations[0].evidence[0].kind).toBe('EXPLICIT_PLURAL_IZAFAT_YE');
    expect(result.relations[0].evidence[0].rule.id).toBe('PERSIAN-CONTEXT-IZAFAT-EXPLICIT');
  });

  it('does not equate bare plural adjacency with explicit plural izāfat', () => {
    const result = transliterate('کتاب‌ها ایران');
    expect(result.relations[0]).toMatchObject({ status: 'CANDIDATE' });
    expect(result.copyable).toBe(false);
    expect(result.output).not.toContain('kitāb-hā-i');
  });
});

describe('comparative and superlative morphology', () => {
  it.each([
    ['بزرگ‌تر', 'COMPARATIVE_TAR', 'buzurg-tar'],
    ['بزرگ‌ترین', 'SUPERLATIVE_TARIN', 'buzurg-tarīn']
  ])('derives %s from the reviewed adjective stem', (surface, type, output) => {
    const result = transliterate(surface);
    expect(result.output).toBe(output);
    expect(result.morphology[0]).toMatchObject({ lexicalLookupStem: 'بزرگ', stemCategory: 'adjective', status: 'CONFIRMED' });
    expect(result.morphology[0].morphemes[1].type).toBe(type);
    expect(result.morphology[0].evidence.some((item) => item.kind === 'ZWNJ_BOUNDARY')).toBe(true);
    expect(LEXICON.some((entry) => entry.normalized === surface)).toBe(false);
  });

  it('does not authorize a comparative whose stem is unresolved', () => {
    const result = transliterate('ناشناخته‌تر');
    expect(result.status).toBe('UNRESOLVED');
    expect(result.morphology[0]).toMatchObject({ status: 'CANDIDATE', lexicalLookupStem: 'ناشناخته' });
  });
});

describe('possessive enclitics', () => {
  it.each([
    ['کتابم', 'POSSESSIVE_1SG', 'kitāb-am'],
    ['کتابت', 'POSSESSIVE_2SG', 'kitāb-at'],
    ['کتابش', 'POSSESSIVE_3SG', 'kitāb-ash'],
    ['کتابمان', 'POSSESSIVE_1PL', 'kitāb-imān'],
    ['کتابتان', 'POSSESSIVE_2PL', 'kitāb-itān'],
    ['کتابشان', 'POSSESSIVE_3PL', 'kitāb-ishān']
  ])('derives %s productively', (surface, type, output) => {
    const result = transliterate(surface);
    expect(result.output).toBe(output);
    expect(result.copyable).toBe(true);
    expect(result.morphology[0]).toMatchObject({ lexicalLookupStem: 'کتاب', status: 'CONFIRMED' });
    expect(result.morphology[0].hostEnding).toBe('CONSONANT_FINAL');
    expect(result.morphology[0].morphemes[1].type).toBe(type);
    expect(LEXICON.some((entry) => entry.normalized === surface)).toBe(false);
  });

  it('does not strip a superficially matching final letter from a reviewed lexical word', () => {
    const result = transliterate('کرم');
    expect(result.morphology).toEqual([]);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.tokens[0].alternatives).toEqual(['karam', 'kirm']);
  });

  it('keeps host-ending applicability in possessive rule data', () => {
    const possessives = PRODUCTIVE_SUFFIX_RULES.filter((rule) => rule.morphemeType.startsWith('POSSESSIVE_'));
    expect(possessives).toHaveLength(6);
    expect(possessives.every((rule) => rule.canonicalRendering === undefined)).toBe(true);
    expect(possessives.every((rule) => rule.realizations?.length === 1 && rule.realizations[0].hostEnding === 'CONSONANT_FINAL')).toBe(true);
  });

  it('recognizes but does not render a reviewed vowel-final possessive host', () => {
    const normalized = normalizePersian('پام').normalizedInput;
    const tokens = tokenize(normalized);
    const orthography = analyzeOrthography(tokens);
    const vowelFinal: LexicalEntry = { id: 'lex:pa', surface: 'پا', normalized: 'پا', category: 'noun', readings: [{ canonical: 'pā', confidence: 0.99, source: 'test-only reviewed vowel-final stem' }] };
    const morphology = analyzeMorphology(tokens, orthography, [...LEXICON, vowelFinal])[0];
    expect(morphology).toMatchObject({ lexicalLookupStem: 'پا', hostEnding: 'VOWEL_FINAL', status: 'CANDIDATE' });
    expect(morphology.morphemes[1]).toMatchObject({ type: 'POSSESSIVE_1SG', canonicalRendering: undefined });
    const resolved = resolveMorphologicalToken(tokens[0], morphology).result;
    expect(resolved.status).toBe('UNRESOLVED');
    expect(resolved.canonicalTransliteration).toBeNull();
    expect(resolved.rendered).not.toMatch(/pā-(?:am|m|y-am)/u);
  });

  it('recognizes but does not render a heh-final possessive host', () => {
    const result = transliterate('خانه‌م');
    expect(result.morphology[0]).toMatchObject({ lexicalLookupStem: 'خانه', hostEnding: 'HEH_FINAL', status: 'CANDIDATE' });
    expect(result.tokens[0].canonicalTransliteration).toBeNull();
    expect(result.copyable).toBe(false);
    expect(result.output).not.toMatch(/khāna-(?:am|m|y-am)/u);
  });
});

describe('morphological evidence and ambiguity', () => {
  it('keeps stem vowel evidence separate from suffix vowel evidence', () => {
    const result = transliterate('کِتاب‌هَا');
    expect(result.morphology[0].stemVowelEvidence.map((item) => item.normalizedTokenOffset)).toEqual([1]);
    expect(result.analyses[0].explicitVowels).toHaveLength(2);
    expect(result.status).toBe('UNRESOLVED');
  });

  it('keeps whole-word and productive analyses ambiguous without array-order selection', () => {
    const normalized = normalizePersian('کتابم').normalizedInput;
    const tokens = tokenize(normalized);
    const orthography = analyzeOrthography(tokens);
    const competing: LexicalEntry[] = [...LEXICON, { id: 'lex:kitabam-whole', surface: 'کتابم', normalized: 'کتابم', category: 'noun', readings: [{ canonical: 'kitābam-as-word', confidence: 0.5, source: 'test fixture' }] }];
    const morphology = analyzeMorphology(tokens, orthography, competing)[0];
    expect(morphology.status).toBe('CANDIDATE');
    expect(morphology.alternatives).toEqual(['WHOLE_WORD', 'PRODUCTIVE_SEGMENTATION']);
    expect(morphology.evidence.some((item) => item.kind === 'WHOLE_WORD_READING')).toBe(true);
    const resolved = resolveMorphologicalToken(tokens[0], morphology).result;
    expect(resolved.status).toBe('AMBIGUOUS');
    expect(resolved.canonicalTransliteration).toBeNull();
  });

  it('preserves unsupported combining evidence and blocks morphology certainty', () => {
    const result = transliterate('کتّاب‌ها');
    expect(result.status).toBe('UNRESOLVED');
    expect(result.morphology[0].status).toBe('CONFLICT');
    expect(result.analyses[0].unsupportedCombiningMarks[0].mark).toBe('ّ');
  });
});
