import { describe, expect, it } from 'vitest';
import { transliterate } from './engine';

describe('explicit-vowel lexical resolution', () => {
  it('keeps unvocalized کرم ambiguous', () => expect(transliterate('کرم').status).toBe('AMBIGUOUS'));
  it('uses explicit kasra evidence to select only kirm', () => {
    const result = transliterate('کِرم');
    expect(result.output).toBe('kirm');
    expect(result.tokens[0]).toMatchObject({ status: 'LEXICON_RESOLVED', alternatives: [] });
    expect(result.copyable).toBe(true);
  });
  it('fails visibly when explicit vowel evidence conflicts with every reviewed reading', () => {
    const result = transliterate('کُرم');
    expect(result.status).toBe('UNRESOLVED');
    expect(result.copyable).toBe(false);
    expect(result.tokens[0].canonicalTransliteration).toBeNull();
    expect(result.tokens[0].warnings.join(' ')).toMatch(/conflicts/i);
  });
});

describe('productive izāfat relation analysis', () => {
  it('confirms final-kasra izāfat productively and renders it through IJMES', () => {
    const result = transliterate('کتابِ ایران');
    expect(result.output).toBe('kitāb-i īrān');
    expect(result.copyable).toBe(true);
    expect(result.relations[0]).toMatchObject({ type: 'IZAFAT', status: 'CONFIRMED', rendering: 'STANDARD_I', sourceTokenIndex: 0, targetTokenIndex: 2 });
    expect(result.relations[0].evidence[0].kind).toBe('EXPLICIT_FINAL_KASRA');
    expect(result.tokens[0].appliedRules.map((rule) => rule.id)).toEqual(expect.arrayContaining(['PERSIAN-CONTEXT-IZAFAT-EXPLICIT', 'IJMES-P-IZAFAT-RENDER']));
  });

  it('retains curated relation evidence as a confirmed higher-quality source', () => {
    const result = transliterate('ولایت فقیه');
    expect(result.output).toBe('vilāyat-i faqīh');
    expect(result.relations[0]).toMatchObject({ status: 'CONFIRMED', evidence: [{ kind: 'CURATED_LEXICAL_CONTEXT', rule: expect.anything(), source: expect.any(String) }] });
  });

  it('gives explicit source evidence precedence over curated relation evidence', () => {
    const relation = transliterate('ولایتِ فقیه').relations[0];
    expect(relation.status).toBe('CONFIRMED');
    expect(relation.evidence[0].kind).toBe('EXPLICIT_FINAL_KASRA');
  });

  it('surfaces an unmarked noun/proper-noun relation as a non-copyable candidate', () => {
    const result = transliterate('تاریخ ایران');
    expect(result.tokens.filter((token) => token.status === 'LEXICON_RESOLVED')).toHaveLength(2);
    expect(result.relations[0]).toMatchObject({ type: 'IZAFAT', status: 'CANDIDATE' });
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.copyable).toBe(false);
    expect(result.output).toContain('⟦izāfat?: -i / none⟧');
    expect(result.output).not.toContain('tārīkh-i');
  });

  it('detects heh izāfat but requires review for unsupported allomorphic rendering', () => {
    const result = transliterate('خانۀ ایران');
    expect(result.relations[0]).toMatchObject({ status: 'CONFIRMED', rendering: 'REVIEW_REQUIRED_ALLOMORPH' });
    expect(result.copyable).toBe(false);
    expect(result.output).toContain('izāfat rendering: review');
  });

  it.each([
    ['در ایران', 'preposition structure'],
    ['ایران و تبریز', 'conjunction boundary'],
    ['کتاب، ایران', 'punctuation boundary']
  ])('does not propose izāfat across %s', (input) => {
    expect(transliterate(input).relations).toEqual([]);
  });

  it('does not infer grammar from an unresolved lexical item', () => {
    const result = transliterate('واژهناشناخته ایران');
    expect(result.relations).toEqual([]);
    expect(result.status).toBe('UNRESOLVED');
  });
});
