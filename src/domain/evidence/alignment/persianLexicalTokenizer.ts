import { tokenize } from '../../tokenizer';
import { PersianLexicalToken } from './types';

/**
 * Deterministically tokenize a Persian text string into lexical word tokens with exact source spans.
 *
 * Surrounding punctuation and whitespace are excluded from the lexical tokens.
 * Exact original characters are preserved (no normalization applied to the token text).
 */
export function tokenizePersianLexicalTokens(text: string): PersianLexicalToken[] {
  if (!text || typeof text !== 'string') return [];

  const rawTokens = tokenize(text);
  const result: PersianLexicalToken[] = [];

  for (const t of rawTokens) {
    if (t.type === 'persian-word') {
      const start = t.normalizedStart;
      const end = t.normalizedEnd;
      const slice = text.slice(start, end);
      result.push({
        text: slice,
        start,
        end
      });
    }
  }

  return result;
}
