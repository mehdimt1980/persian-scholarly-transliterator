import { Token, TokenType } from './types';
const persian = /[\u0600-\u06ff\u0750-\u077f]/;
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []; const re = /\s+|[\u0600-\u06ff\u0750-\u077f\u200c]+|[A-Za-zÀ-ÿ]+|[0-9۰-۹]+|[^\s]/gu; let match: RegExpExecArray | null;
  while ((match = re.exec(text))) { const value = match[0]; let type: TokenType = 'unknown';
    if (/^\s+$/.test(value)) type = 'whitespace'; else if (/^[0-9۰-۹]+$/.test(value)) type = 'number'; else if (/^[A-Za-zÀ-ÿ]+$/.test(value)) type = 'latin'; else if (persian.test(value)) type = 'persian-word'; else if (/^[،؛؟,.!?():؛«»\-–—]+$/.test(value)) type = 'punctuation';
    tokens.push({ text: value, normalizedText: value, type, start: match.index, end: match.index + value.length });
  } return tokens;
}
