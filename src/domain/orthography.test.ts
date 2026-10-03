import { describe, expect, it } from 'vitest';
import { normalizePersian } from './normalization';
import { analyzeOrthography } from './orthography';
import { tokenize } from './tokenizer';

function analyze(input: string) {
  const normalized = normalizePersian(input).normalizedInput;
  return analyzeOrthography(tokenize(normalized))[0];
}

describe('Persian orthographic evidence', () => {
  it.each([
    ['کَرم', 'FATHA', 'a'],
    ['کِرم', 'KASRA', 'i'],
    ['کُرم', 'DAMMA', 'u']
  ])('extracts explicit vowel evidence from %s', (surface, mark, vowel) => {
    const result = analyze(surface);
    expect(result.explicitVowels[0]).toMatchObject({ mark, vowel, afterBaseIndex: 0, relationOnly: false });
  });

  it('preserves the vocalized normalized surface and normalized offsets while deriving lookup form', () => {
    const result = analyze('کِرم');
    expect(result).toMatchObject({ normalizedSurface: 'کِرم', lookupForm: 'کرم', normalizedStart: 0, normalizedEnd: 4 });
  });

  it('classifies final kasra separately as explicit relation evidence', () => {
    const result = analyze('کتابِ');
    expect(result.lookupForm).toBe('کتاب');
    expect(result.explicitIzafat).toBe('FINAL_KASRA');
    expect(result.explicitVowels[0].relationOnly).toBe(true);
  });

  it('retains ZWNJ boundaries and only segments where source orthography provides a boundary', () => {
    const result = analyze('می‌رود');
    expect(result.zwnjBoundaries).toEqual([2]);
    expect(result.evidencedSegments).toEqual(['می', 'رود']);
    expect(result.warnings[0]).toMatch(/without assigning suffix/i);
  });

  it('recognizes precomposed heh-with-ye-above without losing the source form', () => {
    const result = analyze('خانۀ');
    expect(result).toMatchObject({ normalizedSurface: 'خانۀ', lookupForm: 'خانه', explicitIzafat: 'HEH_ORTHOGRAPHY' });
  });

  it('recognizes canonically equivalent decomposed heh izāfat orthography', () => {
    const normalization = normalizePersian('خانهٔ');
    const result = analyzeOrthography(tokenize(normalization.normalizedInput))[0];
    expect(result.lookupForm).toBe('خانه');
    expect(result.explicitIzafat).toBe('HEH_ORTHOGRAPHY');
    expect(normalization.originalInput).toBe('خانهٔ');
  });
});
