import { describe, expect, it } from 'vitest';
import { transliterate } from './engine';
import { renderCanonicalForProfile, renderCitationTitleWord } from './profiles';

describe('IJMES output profiles', () => {
  it('keeps scholarly diacritics and lexical lowercase in full profile', () => {
    expect(transliterate('ایران و تبریز', 'ijmes_full').output).toBe('īrān va tabrīz');
  });

  it('preserves all scholarly diacritics (macrons, under-dots, ayn/hamza) in citation title profile', () => {
    const result = transliterate('علم تأملی', 'ijmes_citation_title');
    expect(result.output).toBe('ʿIlm Taʾammulī');
    expect(result.output).toContain('ʿ');
    expect(result.output).toContain('ʾ');
    expect(result.output).toContain('ī');
  });

  it('capitalizes independent words including prepositions/conjunctions in citation titles', () => {
    expect(transliterate('مکتب ایران تبریز', 'ijmes_citation_title').output).toBe('Maktab Īrān Tabrīz');
    expect(transliterate('مکتب و ایران در تبریز', 'ijmes_citation_title').output).toBe('Maktab Va Īrān Dar Tabrīz');
    expect(transliterate('در ایران', 'ijmes_citation_title').output).toBe('Dar Īrān');
  });

  it('preserves full diacritics on proper nouns without requiring lexical upper case', () => {
    expect(transliterate('ایران', 'ijmes_full').tokens[0].canonicalTransliteration).toBe('īrān');
    expect(transliterate('ایران', 'ijmes_citation_title').output).toBe('Īrān');
  });

  it('records citation title rule truthfully without diacritic removal', () => {
    const rules = transliterate('ایران', 'ijmes_citation_title').tokens[0].appliedRules.map((rule) => rule.id);
    expect(rules).toContain('SCHOLARLY-CITATION-TITLE-CAPITALIZATION');
    expect(rules).not.toContain('IJMES-TITLE-DIACRITIC-REMOVAL');
  });

  it('preserves lowercase structural hyphen suffixes in citation title', () => {
    expect(renderCanonicalForProfile('zavāl-i andīshah-i siyāsī dar īrān', 'ijmes_citation_title')).toBe(
      'Zavāl-i Andīshah-i Siyāsī Dar Īrān'
    );
    expect(renderCanonicalForProfile('shabhā-yi tīra dar farāmūshkhāna-yi ashbāḥ', 'ijmes_citation_title')).toBe(
      'Shabhā-yi Tīra Dar Farāmūshkhāna-yi Ashbāḥ'
    );
    expect(renderCanonicalForProfile('chashm-hā-yash', 'ijmes_citation_title')).toBe('Chashm-hā-yash');
  });

  it('does not capitalize internal compound segments automatically', () => {
    expect(renderCanonicalForProfile('siyāsat-nāma', 'ijmes_citation_title')).toBe('Siyāsat-nāma');
    expect(renderCanonicalForProfile('qābūs-nāma', 'ijmes_citation_title')).toBe('Qābūs-nāma');
    expect(renderCanonicalForProfile('marzbān-nāma', 'ijmes_citation_title')).toBe('Marzbān-nāma');
    expect(renderCanonicalForProfile('safarnāma-yi nāṣir-i khusraw', 'ijmes_citation_title')).toBe(
      'Safarnāma-yi Nāṣir-i Khusraw'
    );
  });

  it('preserves long vowels and under-dot consonants: ā ī ū ḥ ṣ ṭ ẓ ż ʿ ʾ', () => {
    const canonical = 'ā ī ū ḥ ṣ ṭ ẓ ż ʿ ʾ';
    const rendered = renderCanonicalForProfile(canonical, 'ijmes_citation_title');
    expect(rendered).toBe('Ā Ī Ū Ḥ Ṣ Ṭ Ẓ Ż ʿ ʾ');
  });

  it('renderCitationTitleWord capitalizes only the first segment before the first hyphen', () => {
    expect(renderCitationTitleWord('zavāl-i')).toBe('Zavāl-i');
    expect(renderCitationTitleWord('andīshah-i')).toBe('Andīshah-i');
    expect(renderCitationTitleWord('shabhā-yi')).toBe('Shabhā-yi');
    expect(renderCitationTitleWord('chashm-hā-yash')).toBe('Chashm-hā-yash');
    expect(renderCitationTitleWord('siyāsat-nāma')).toBe('Siyāsat-nāma');
    expect(renderCitationTitleWord('ʿilm')).toBe('ʿIlm');
    expect(renderCitationTitleWord('ʾamr')).toBe('ʾAmr');
    expect(renderCitationTitleWord('īrān')).toBe('Īrān');
  });
});
