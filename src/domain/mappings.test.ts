import { describe, expect, it } from 'vitest';
import { consonantalScaffold, PERSIAN_CONSONANT_MAPPINGS } from '../data/ijmes-mappings';

describe('Persian-column IJMES mapping data', () => {
  it.each([['ث','s'], ['ذ','z'], ['ض','ż'], ['ص','ṣ'], ['ط','ṭ'], ['ظ','ẓ'], ['ع','ʿ'], ['ء','ʾ'], ['خ','kh'], ['ژ','zh']])('maps %s to %s', (source, expected) => expect(PERSIAN_CONSONANT_MAPPINGS[source]).toBe(expected));
  it('marks unmapped vowel-bearing evidence rather than leaking source script', () => { const scaffold = consonantalScaffold('واژه'); expect(scaffold).not.toMatch(/[\u0600-\u06ff]/u); expect(scaffold).toContain('·'); });
});
