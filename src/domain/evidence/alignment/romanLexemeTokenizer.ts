import { RomanLexemeToken } from './types';

const LATIN_LETTER = /^(?=\p{Script=Latin}$)\p{L}$/u;
const COMBINING_MARK = /^\p{M}$/u;
const SCHOLARLY_MODIFIER = /^[ʻʼʿʾ'’‘ʹˈ]$/u;

function codePointAt(text: string, index: number): string {
  return String.fromCodePoint(text.codePointAt(index)!);
}

function isRomanLetterOrSign(ch: string): boolean {
  return LATIN_LETTER.test(ch) || COMBINING_MARK.test(ch) || SCHOLARLY_MODIFIER.test(ch);
}

/**
 * Deterministically tokenize a scholarly Romanized string into lexeme tokens with exact source spans.
 *
 * Supports:
 *   - Unicode Latin letters (including diacritics / combining macrons and underdots)
 *   - Scholarly modifier characters (ʻ, ʼ, ʿ, ʾ, ', ’, ‘)
 *   - Internal hyphens connecting word components (e.g. Kitāb-i, al-ṭibb, Dawrah-ʼi)
 *
 * Punctuation (commas, periods, slashes, colons, brackets) and surrounding whitespace are excluded.
 */
export function tokenizeRomanLexemes(text: string): RomanLexemeToken[] {
  if (!text || typeof text !== 'string') return [];

  const tokens: RomanLexemeToken[] = [];
  let index = 0;

  while (index < text.length) {
    const ch = codePointAt(text, index);

    // Check if we are at the start of a Roman lexeme
    if (isRomanLetterOrSign(ch)) {
      const start = index;
      index += ch.length;

      while (index < text.length) {
        const next = codePointAt(text, index);

        if (isRomanLetterOrSign(next)) {
          index += next.length;
        } else if (next === '-') {
          // Hyphen inside a token: check if followed by Roman letter/sign
          const afterHyphenIdx = index + next.length;
          if (afterHyphenIdx < text.length && isRomanLetterOrSign(codePointAt(text, afterHyphenIdx))) {
            index = afterHyphenIdx; // include hyphen and advance past next char
            index += codePointAt(text, afterHyphenIdx).length;
          } else {
            // Standalone or trailing hyphen
            break;
          }
        } else {
          // Punctuation, whitespace, or other script: token boundary
          break;
        }
      }

      const end = index;
      const tokenText = text.slice(start, end);
      const hasBoundMarker = tokenText.includes('-');

      tokens.push({
        text: tokenText,
        start,
        end,
        hasBoundMarker
      });
    } else {
      index += ch.length;
    }
  }

  return tokens;
}
