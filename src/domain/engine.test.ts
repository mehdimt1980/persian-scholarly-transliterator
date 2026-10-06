import { describe, expect, it } from 'vitest';
import { transliterate } from './engine';
import { ProfileId } from './types';

const ruleIds = (source: string, profile: ProfileId = 'ijmes_full') => transliterate(source, profile).tokens[0].appliedRules.map((rule) => rule.id);

describe('canonical IJMES scholarly characters', () => {
  it('drops initial hamza in canonical/full output', () => expect(transliterate('امر').output).toBe('amr'));
  it('drops initial hamza in citation title output', () => expect(transliterate('امر', 'ijmes_citation_title').output).toBe('Amr'));
  it('preserves non-initial hamza as Unicode ʾ', () => { expect(transliterate('تأملی').output).toBe('taʾammulī'); expect(ruleIds('تأملی')).toContain('IJMES-P-NONINITIAL-HAMZA'); });
  it('preserves ʿayn as distinct Unicode ʿ', () => { expect(transliterate('علم').output).toBe('ʿilm'); expect(transliterate('علم').output).not.toContain("'"); });
  it('preserves long ā, ī, and ū in full output', () => expect(transliterate('ایران فقیه دور').output).toBe('īrān faqīh dūr'));
});

describe('Persian IJMES conventions and context', () => {
  it('renders detected izāfat as -i without fixture logic in the engine', () => { const result = transliterate('ولایت فقیه'); expect(result.output).toBe('vilāyat-i faqīh'); expect(result.tokens[0].appliedRules.map((rule) => rule.id)).toEqual(expect.arrayContaining(['PERSIAN-CONTEXT-IZAFAT-DETECTED', 'IJMES-P-IZAFAT-RENDER'])); });
  it('uses IJMES u rather than spoken-Persian o', () => expect(transliterate('تأملی').output).toBe('taʾammulī'));
  it('keeps context detection separate from the rendering authority', () => { const rules = transliterate('ولایت فقیه').tokens[0].appliedRules; expect(rules.find((rule) => rule.id === 'PERSIAN-CONTEXT-IZAFAT-DETECTED')?.authority).toBe('linguistic-convention'); expect(rules.find((rule) => rule.id === 'IJMES-P-IZAFAT-RENDER')?.authority).toBe('current-guide'); });
});

describe('resolution behavior', () => {
  it('records lexical provenance without falsely claiming consonant production', () => { const token = transliterate('ایران').tokens[0]; expect(token.status).toBe('LEXICON_RESOLVED'); expect(token.appliedRules.map((rule) => rule.id)).toContain('LEXICON-READING'); expect(token.appliedRules.map((rule) => rule.id)).not.toContain('IJMES-P-CONSONANT'); });
  it('represents unknown material as non-copyable unresolved review content', () => { const result = transliterate('واژهناشناخته'); expect(result.status).toBe('UNRESOLVED'); expect(result.copyable).toBe(false); expect(result.tokens[0].canonicalTransliteration).toBeNull(); expect(result.output).toMatch(/unresolved/); expect(result.tokens[0].diagnosticScaffold).not.toMatch(/[\u0600-\u06ff]/u); });
  it('retains every ambiguous alternative without selecting the first', () => { const result = transliterate('کرم'); expect(result.status).toBe('AMBIGUOUS'); expect(result.copyable).toBe(false); expect(result.tokens[0].canonicalTransliteration).toBeNull(); expect(result.tokens[0].alternatives).toEqual(['karam', 'kirm']); expect(result.output).toContain('ambiguous'); });
  it('passes punctuation and numbers through deterministically', () => { const result = transliterate('ایران: ۱۴۰۰'); expect(result.output).toBe('īrān: ۱۴۰۰'); expect(result.tokens.find((token) => token.normalizedSurface === ':')?.status).toBe('DETERMINISTIC'); });

  it('exposes normalized token coordinates without implying original-input spans', () => {
    const token = transliterate('ايران').tokens[0];
    expect(token).toMatchObject({ normalizedSurface: 'ایران', normalizedStart: 0, normalizedEnd: 5 });
    expect(token).not.toHaveProperty('source');
    expect(token).not.toHaveProperty('start');
    expect(token).not.toHaveProperty('end');
  });
});

describe('integration fixtures', () => {
  it('handles the official vilāyat-i faqīh example', () => expect(transliterate('ولایت فقیه').output).toBe('vilāyat-i faqīh'));
  it('preserves the motivating title while surfacing joining decisions for review', () => { const result = transliterate('تأملی درباره ایران: مکتب تبریز و مبانی تجددخواهی'); expect(result.status).toBe('AMBIGUOUS'); expect(result.output).toContain('taʾammulī'); expect(result.output).not.toMatch(/taʾammol|dar-bāre|tajaddod/); expect(result.tokens.filter((token) => token.status === 'AMBIGUOUS')).toHaveLength(2); });
});
