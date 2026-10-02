import { describe, expect, it } from 'vitest';
import { transliterate } from './engine';

describe('IJMES output profiles', () => {
  it('keeps scholarly diacritics and lexical lowercase in full profile', () => expect(transliterate('ایران و تبریز').output).toBe('īrān va tabrīz'));
  it('removes title diacritics while preserving ʿayn and medial hamza', () => { expect(transliterate('علم تأملی', 'ijmes_title').output).toBe('ʿIlm Taʾammuli'); expect(transliterate('علم تأملی', 'ijmes_title').output).toContain('ʾ'); });
  it('capitalizes major words after canonical transliteration', () => expect(transliterate('مکتب ایران تبریز', 'ijmes_title').output).toBe('Maktab Iran Tabriz'));
  it('keeps conjunctions and prepositions lowercase inside a title', () => expect(transliterate('مکتب و ایران در تبریز', 'ijmes_title').output).toBe('Maktab va Iran dar Tabriz'));
  it('capitalizes a minor word at a title boundary', () => expect(transliterate('در ایران', 'ijmes_title').output).toBe('Dar Iran'));
  it('does not require proper-noun capitalization in lexical data', () => { expect(transliterate('ایران').tokens[0].canonicalTransliteration).toBe('īrān'); expect(transliterate('ایران', 'ijmes_title').output).toBe('Iran'); });
  it('records both title profile transformations truthfully', () => expect(transliterate('ایران', 'ijmes_title').tokens[0].appliedRules.map((rule) => rule.id)).toEqual(expect.arrayContaining(['IJMES-TITLE-DIACRITIC-REMOVAL', 'IJMES-TITLE-CAPITALIZATION'])));
});
