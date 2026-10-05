import { describe, expect, it } from 'vitest';
import { LexiconRepository } from './lexicon/repository';
import { transliterate } from './engine';
import { FROZEN_REVIEWED_AUTHORITY_METADATA } from './frozenReviewedAuthority';

describe('human-approved frozen reviewed authority runtime layer', () => {
  it('loads exactly the 108 frozen reviewed authority cases', () => {
    expect(FROZEN_REVIEWED_AUTHORITY_METADATA.promotedGoldVersion).toBe('2.0.0');
    expect(FROZEN_REVIEWED_AUTHORITY_METADATA.sourceBenchmarkGitBlobSha1).toBe(
      'be46b312e2cb82cc4ec0f95ed1c019f8f5e27162'
    );
    expect(FROZEN_REVIEWED_AUTHORITY_METADATA.entryCount).toBe(108);
    expect(FROZEN_REVIEWED_AUTHORITY_METADATA.exactMatchOnly).toBe(true);
  });

  it('resolves canonical and publication rendering independently for an exact reviewed hit', () => {
    const result = transliterate('زکات', 'ijmes_full');

    expect(result.copyable).toBe(true);
    expect(result.status).toBe('LEXICON_RESOLVED');
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].canonicalTransliteration).toBe('zakāt');
    expect(result.output).toBe('zakat');
    expect(result.tokens[0].warnings.join(' ')).toContain('frozen reviewed authority');
  });

  it('preserves frozen lexical ambiguity as LEXICAL_AMBIGUITY and supports an explicit human selection', () => {
    const initial = transliterate('مهر', 'ijmes_full');

    expect(initial.copyable).toBe(false);
    expect(initial.status).toBe('AMBIGUOUS');
    expect(initial.reviewIssues).toHaveLength(1);
    expect(initial.reviewIssues[0].type).toBe('LEXICAL_AMBIGUITY');
    expect(initial.reviewIssues[0].alternatives.map((alternative) => alternative.canonical)).toEqual([
      'mihr',
      'muhr'
    ]);

    const selected = transliterate('مهر', 'ijmes_full', [
      {
        issueId: initial.reviewIssues[0].id,
        action: 'SELECT_LEXICAL_READING',
        selectedAlternativeId: initial.reviewIssues[0].alternatives[0].id
      }
    ]);

    expect(selected.copyable).toBe(true);
    expect(selected.status).toBe('USER_OVERRIDE');
    expect(selected.output).toBe('mihr');
    expect(selected.tokens[0].automatic.status).toBe('AMBIGUOUS');
  });

  it('does not fuzzy-match near misses or the wrong profile', () => {
    const nearMiss = transliterate('زکاتی', 'ijmes_full');
    expect(nearMiss.warnings.join(' ')).not.toContain('frozen reviewed authority');

    const wrongProfile = transliterate('تاریخ بیداری ایرانیان', 'ijmes_full');
    expect(wrongProfile.warnings.join(' ')).not.toContain('frozen reviewed authority');
    expect(wrongProfile.copyable).toBe(false);
  });

  it('does not inject frozen authority when a caller supplies an explicit custom lexicon', () => {
    const emptyLexicon = new LexiconRepository([]);
    const result = transliterate('زکات', 'ijmes_full', [], emptyLexicon);

    expect(result.copyable).toBe(false);
    expect(result.status).toBe('UNRESOLVED');
    expect(result.warnings.join(' ')).not.toContain('frozen reviewed authority');
  });
});
