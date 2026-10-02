import { describe, expect, it } from 'vitest';
import { normalizePersian } from './normalization';

describe('input normalization', () => {
  it.each([['ي','ی'], ['ى','ی'], ['ك','ک']])('normalizes safe orthographic variant %s', (input, expected) => expect(normalizePersian(input).normalizedInput).toBe(expected));
  it('preserves ZWNJ and canonicalizes ZWJ while recording the change', () => { expect(normalizePersian('می\u200cرود').normalizedInput).toBe('می\u200cرود'); const result = normalizePersian('می\u200dرود'); expect(result.normalizedInput).toBe('می\u200cرود'); expect(result.changes[0].kind).toBe('joiner'); });
  it.each(['ه', 'ۀ', 'ة'])('preserves meaningful heh-family character %s', (character) => expect(normalizePersian(character).normalizedInput).toBe(character));
  it('records Persian heh-with-ye-above semantic evidence', () => expect(normalizePersian('خانۀ').changes[0].semanticRole).toBe('persian-heh-with-ye-above'));
  it('records Arabic ta marbuta semantic evidence', () => expect(normalizePersian('مدرسة').changes[0].semanticRole).toBe('arabic-ta-marbuta'));
  it('preserves punctuation while normalizing whitespace', () => expect(normalizePersian('ایران:  تبریز').normalizedInput).toBe('ایران: تبریز'));
  it('always preserves the original input', () => expect(normalizePersian('كي').originalInput).toBe('كي'));
});
