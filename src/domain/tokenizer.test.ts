import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenizer';

const compact = (input: string) => tokenize(input).map(({ normalizedSurface, type, normalizedStart, normalizedEnd }) => ({ normalizedSurface, type, normalizedStart, normalizedEnd }));

describe('Unicode-category Persian tokenization', () => {
  it('separates Persian comma from adjacent words with stable normalized offsets', () => expect(compact('کتاب، ایران')).toEqual([
    { normalizedSurface: 'کتاب', type: 'persian-word', normalizedStart: 0, normalizedEnd: 4 },
    { normalizedSurface: '،', type: 'punctuation', normalizedStart: 4, normalizedEnd: 5 },
    { normalizedSurface: ' ', type: 'whitespace', normalizedStart: 5, normalizedEnd: 6 },
    { normalizedSurface: 'ایران', type: 'persian-word', normalizedStart: 6, normalizedEnd: 11 }
  ]));
  it('separates Persian semicolon', () => expect(compact('ایران؛ تبریز').map(({ normalizedSurface, type }) => [normalizedSurface, type])).toEqual([['ایران','persian-word'],['؛','punctuation'],[' ','whitespace'],['تبریز','persian-word']]));
  it('separates Persian question mark', () => expect(compact('ایران؟').map(({ normalizedSurface, type }) => [normalizedSurface, type])).toEqual([['ایران','persian-word'],['؟','punctuation']]));
  it('keeps final kasra inside its Persian word token', () => expect(compact('کتابِ ایران')[0]).toMatchObject({ normalizedSurface: 'کتابِ', type: 'persian-word' }));
  it('keeps medial kasra inside its Persian word token', () => expect(compact('کِرم')).toEqual([{ normalizedSurface: 'کِرم', type: 'persian-word', normalizedStart: 0, normalizedEnd: 4 }]));
  it('keeps ZWNJ inside its Persian word token', () => expect(compact('می‌رود')).toEqual([{ normalizedSurface: 'می‌رود', type: 'persian-word', normalizedStart: 0, normalizedEnd: 6 }]));
  it('classifies Persian digits as a number token', () => expect(compact('۱۴۰۰')).toEqual([{ normalizedSurface: '۱۴۰۰', type: 'number', normalizedStart: 0, normalizedEnd: 4 }]));
});
