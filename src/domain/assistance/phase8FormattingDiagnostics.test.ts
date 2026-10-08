import { describe, expect, it } from 'vitest';
import { renderCanonicalForProfile } from '../profiles';

/**
 * Diagnostic fixtures only. They record the boundary between official IJMES policy
 * and the deliberately fully diacritized project profile without changing frozen output.
 */
describe('Phase 8B deferred IJMES publication-format diagnostics', () => {
  const fixture = {
    input: 'صدای پای باران در کوچه های تهران',
    observedDraft: 'Ṣadā-yi Pā-yi Bārān Dar Kūchehā-yi Tihrān',
    canonical: 'ṣadā-yi pā-yi bārān dar kūchihā-yi tihrān'
  } as const;

  it('records the screenshot fixture and current fully diacritized citation-title behavior', () => {
    expect(fixture.input).toBe('صدای پای باران در کوچه های تهران');
    expect(renderCanonicalForProfile(fixture.canonical, 'ijmes_citation_title')).toBe(
      'Ṣadā-yi Pā-yi Bārān Dar Kūchihā-yi Tihrān'
    );
    expect(fixture.observedDraft).toContain('Kūchehā');
  });

  it('records official-policy expectations separately from current project profile behavior', () => {
    const officialIjmesPolicy = {
      persianShortVowels: 'i/u-not-e/o',
      medialPrepositionDar: 'lowercase',
      publicationTitleDiacritics: 'omit-except-ayn-and-hamza'
    } as const;
    const currentProjectProfile = {
      id: 'ijmes_citation_title',
      preservesScholarlyDiacritics: true
    } as const;

    expect(officialIjmesPolicy).toEqual({
      persianShortVowels: 'i/u-not-e/o',
      medialPrepositionDar: 'lowercase',
      publicationTitleDiacritics: 'omit-except-ayn-and-hamza'
    });
    expect(currentProjectProfile.preservesScholarlyDiacritics).toBe(true);
  });
});
