import { describe, expect, it } from 'vitest';
import { normalizePersian } from './normalization';
import { transliterate } from './engine';
describe('IJMES Persian foundation', () => {
  it('normalizes Arabic variants without losing text', () => expect(normalizePersian('كي يى')).toBe('کی یی'));
  it('preserves punctuation and applies the guide izāfat example', () => { const r = transliterate('ولایت فقیه'); expect(r.output).toBe('vilāyat-i faqīh'); expect(r.tokens[0].appliedRules.map(x => x.id)).toContain('IJMES-P-IZAFAT'); });
  it('keeps an unknown word unresolved', () => { const r = transliterate('واژهناشناخته'); expect(r.status).toBe('UNRESOLVED'); expect(r.tokens[0].confidence).toBe(0); expect(r.tokens[0].warnings[0]).toMatch(/unresolved/i); });
  it('converts full output to title presentation', () => expect(transliterate('ایران', 'ijmes_title').output).toBe('Iran'));
  it('handles the motivating fixture as a real pipeline', () => { const r = transliterate('تأملی درباره ایران: مکتب تبریز و مبانی تجددخواهی'); expect(r.output).toContain('taʾammolī'); expect(r.output).toContain(':'); expect(r.tokens.some(t => t.status === 'LEXICON_RESOLVED')).toBe(true); });
});
