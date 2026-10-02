import { describe, expect, it } from 'vitest';
import { consonantalScaffold, PERSIAN_CONSONANT_MAPPINGS, PERSIAN_GUIDE_SPECIAL_RENDERINGS } from '../data/ijmes-mappings';
import { transliterate } from './engine';

describe('Persian-column IJMES mapping data', () => {
  it.each([['ث','s'], ['ذ','z'], ['ض','ż'], ['ص','ṣ'], ['ط','ṭ'], ['ظ','ẓ'], ['ع','ʿ'], ['ء','ʾ'], ['خ','kh'], ['ژ','zh']])('maps %s to %s', (source, expected) => expect(PERSIAN_CONSONANT_MAPPINGS[source]).toBe(expected));
  it('marks unmapped vowel-bearing evidence rather than leaking source script', () => { const scaffold = consonantalScaffold('واژه'); expect(scaffold).not.toMatch(/[\u0600-\u06ff]/u); expect(scaffold).toContain('·'); });
  it('does not misrepresent tāʾ marbūṭa as a Persian consonant mapping', () => expect(PERSIAN_CONSONANT_MAPPINGS['ة']).toBeUndefined());
  it('represents the guide-level Persian tāʾ marbūṭa rule separately as ih', () => expect(PERSIAN_GUIDE_SPECIAL_RENDERINGS['ة']).toBe('ih'));
  it('uses a non-transliterative tāʾ marbūṭa marker in a diagnostic scaffold', () => { const scaffold = consonantalScaffold('مدرسة'); expect(scaffold).toContain('[TM]'); expect(scaffold).not.toMatch(/h$/); });
  it('keeps an unresolved Persian tāʾ marbūṭa token non-copyable with guide provenance', () => { const result = transliterate('مدرسة'); expect(result.copyable).toBe(false); expect(result.tokens[0].appliedRules.map((rule) => rule.id)).toContain('IJMES-P-TA-MARBUTA-IH'); expect(result.tokens[0].warnings.join(' ')).toMatch(/ih/); });
});
