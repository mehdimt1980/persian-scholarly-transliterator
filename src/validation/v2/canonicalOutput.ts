import { TransliterationResult } from '../../domain/types';

/**
 * Derives the scholarly canonical transliteration output from the token state of a TransliterationResult.
 *
 * This function preserves scholarly diacritics and linguistic representations independently
 * of any publication or title rendering profile that may have been applied to `result.output`
 * or `token.rendered`.
 *
 * Rules:
 * 1. If a transliterated Persian token (`persian-word`) has a non-null `canonicalTransliteration`, use it.
 * 2. Structural/non-transliterated tokens (`whitespace`, `punctuation`, `number`, `latin`) preserve their literal representation.
 * 3. If any token requiring scholarly resolution lacks a safe canonical value (e.g. `canonicalTransliteration === null` or token status is `UNRESOLVED` / `AMBIGUOUS`), fails closed and returns `null`.
 * 4. Tokens with unrecognized / unknown types fail closed and return `null`.
 * 5. Does NOT use `result.output` or reconstruct from rendered strings.
 * 6. Does NOT apply title-profile diacritic removal or English capitalization.
 * 7. Confirmed izāfat already represented in token canonical state is preserved.
 */
export function deriveScholarlyCanonicalOutput(result: TransliterationResult): string | null {
  if (!result || !Array.isArray(result.tokens)) {
    return null;
  }

  const parts: string[] = [];

  for (const token of result.tokens) {
    if (token.tokenType === 'persian-word') {
      if (token.canonicalTransliteration === null || token.canonicalTransliteration === undefined) {
        return null;
      }
      parts.push(token.canonicalTransliteration);
    } else if (
      token.tokenType === 'whitespace' ||
      token.tokenType === 'punctuation' ||
      token.tokenType === 'number' ||
      token.tokenType === 'latin'
    ) {
      const val = token.canonicalTransliteration ?? token.rendered ?? token.normalizedSurface;
      if (typeof val !== 'string') {
        return null;
      }
      parts.push(val);
    } else {
      // Unhandled or unknown token types fail closed
      return null;
    }
  }

  return parts.join('');
}
