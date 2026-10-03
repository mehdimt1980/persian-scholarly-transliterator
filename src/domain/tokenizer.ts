import { Token, TokenType } from './types';

const ARABIC_LETTER = /^(?=\p{Script=Arabic}$)\p{L}$/u;
const LATIN_LETTER = /^(?=\p{Script=Latin}$)\p{L}$/u;
const COMBINING_MARK = /^\p{M}$/u;
const DECIMAL_DIGIT = /^\p{Nd}$/u;
const PUNCTUATION = /^\p{P}$/u;
const WHITESPACE = /^\s$/u;
const ZWNJ = '\u200c';

function codePointAt(text: string, index: number): string { return String.fromCodePoint(text.codePointAt(index)!); }
export const isArabicScriptLetter = (character: string) => ARABIC_LETTER.test(character);
export const isCombiningMark = (character: string) => COMBINING_MARK.test(character);

export function tokenize(text: string): Token[] {
  const tokens: Token[] = []; let index = 0;
  const push = (normalizedStart: number, normalizedEnd: number, type: TokenType) => tokens.push({ normalizedSurface: text.slice(normalizedStart, normalizedEnd), type, normalizedStart, normalizedEnd });
  while (index < text.length) {
    const start = index; const first = codePointAt(text, index); index += first.length;
    if (WHITESPACE.test(first)) { while (index < text.length && WHITESPACE.test(codePointAt(text, index))) index += codePointAt(text, index).length; push(start, index, 'whitespace'); continue; }
    if (isArabicScriptLetter(first)) { while (index < text.length) { const next = codePointAt(text, index); if (!isArabicScriptLetter(next) && !isCombiningMark(next) && next !== ZWNJ) break; index += next.length; } push(start, index, 'persian-word'); continue; }
    if (DECIMAL_DIGIT.test(first)) { while (index < text.length && DECIMAL_DIGIT.test(codePointAt(text, index))) index += codePointAt(text, index).length; push(start, index, 'number'); continue; }
    if (LATIN_LETTER.test(first)) { while (index < text.length) { const next = codePointAt(text, index); if (!LATIN_LETTER.test(next) && !COMBINING_MARK.test(next)) break; index += next.length; } push(start, index, 'latin'); continue; }
    push(start, index, PUNCTUATION.test(first) ? 'punctuation' : 'unknown');
  }
  return tokens;
}
