import { describe, expect, it } from 'vitest';
import { DEFAULT_LEXICON_REPOSITORY } from '../../data/lexicon';
import { transliterate } from '../engine';

const CASES = [
  { input: 'مهر', readings: ['mihr', 'muhr'], page: '1353' },
  { input: 'سر', readings: ['sar', 'sirr'], page: '671' },
  { input: 'گل', readings: ['gul', 'gil'], page: '1092' },
  { input: 'شور', readings: ['shūr', 'shawr'], page: '764' },
  { input: 'روی', readings: ['rūy', 'ravī'], page: '598' }
] as const;

describe('Phase 4.6C reviewed lexical ambiguity recognition', () => {
  it.each(CASES)('stores $input as a source-backed multi-reading lexical entry', ({ input, readings, page }) => {
    const entry = DEFAULT_LEXICON_REPOSITORY.findByNormalized(input);

    expect(entry).toBeDefined();
    expect(entry?.readings.map((reading) => reading.canonical).sort()).toEqual([...readings].sort());
    expect(entry?.readings).toHaveLength(2);

    for (const reading of entry?.readings ?? []) {
      expect(reading.confidence).toBe(0.5);
      expect(reading.sources?.some((source) =>
        source.type === 'SCHOLARLY_DICTIONARY' &&
        source.citation.includes('Steingass') &&
        source.citation.includes(`p. ${page}`)
      )).toBe(true);
    }
  });

  it.each(CASES)('keeps $input non-copyable and reports LEXICAL_AMBIGUITY rather than UNKNOWN_TOKEN', ({ input, readings }) => {
    const result = transliterate(input, 'ijmes_full');
    const token = result.tokens.find((candidate) => candidate.tokenType === 'persian-word');
    const issueTypes = result.reviewIssues.map((issue) => issue.type);

    expect(result.copyable).toBe(false);
    expect(result.status).toBe('AMBIGUOUS');
    expect(issueTypes).toContain('LEXICAL_AMBIGUITY');
    expect(issueTypes).not.toContain('UNKNOWN_TOKEN');
    expect(token?.blockingReason).toBe('LEXICAL_AMBIGUITY');
    expect(token?.canonicalTransliteration).toBeNull();
    expect(token?.alternatives.sort()).toEqual([...readings].sort());
  });
});
