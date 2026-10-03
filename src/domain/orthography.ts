import { RULES } from './provenance';
import { ExplicitVowel, OrthographicVowelEvidence, Token, TokenAnalysis } from './types';
import { isArabicScriptLetter, isCombiningMark } from './tokenizer';

const VOWEL_MARKS: Record<string, { mark: OrthographicVowelEvidence['mark']; vowel: ExplicitVowel; rule: typeof RULES.orthFatha }> = {
  '\u064e': { mark: 'FATHA', vowel: 'a', rule: RULES.orthFatha },
  '\u0650': { mark: 'KASRA', vowel: 'i', rule: RULES.orthKasra },
  '\u064f': { mark: 'DAMMA', vowel: 'u', rule: RULES.orthDamma }
};

export function analyzeOrthography(tokens: Token[]): TokenAnalysis[] {
  return tokens.flatMap((token, tokenIndex) => token.type === 'persian-word' ? [analyzePersianToken(token, tokenIndex)] : []);
}

function analyzePersianToken(token: Token, tokenIndex: number): TokenAnalysis {
  const characters = [...token.normalizedSurface]; const explicitVowels: OrthographicVowelEvidence[] = []; const unsupportedCombiningMarks: TokenAnalysis['unsupportedCombiningMarks'] = []; const zwnjBoundaries: number[] = [];
  const provenance: TokenAnalysis['provenance'] = []; const warnings: string[] = []; let baseIndex = -1;
  const lastBaseIndex = characters.reduce((count, character) => isArabicScriptLetter(character) ? count + 1 : count, -1);
  for (let normalizedTokenOffset = 0; normalizedTokenOffset < characters.length; normalizedTokenOffset += 1) {
    const character = characters[normalizedTokenOffset]; const vowel = VOWEL_MARKS[character];
    if (vowel) { const relationOnly = vowel.mark === 'KASRA' && baseIndex === lastBaseIndex && normalizedTokenOffset === characters.length - 1; explicitVowels.push({ ...vowel, normalizedTokenOffset, afterBaseIndex: baseIndex, relationOnly }); provenance.push(vowel.rule); continue; }
    if (character === '\u200c') { zwnjBoundaries.push(normalizedTokenOffset); provenance.push(RULES.orthZwnj); continue; }
    if (character === '\u0654') continue;
    if (isCombiningMark(character)) { unsupportedCombiningMarks.push({ mark: character, normalizedTokenOffset, afterBaseIndex: baseIndex, rule: RULES.orthUnsupportedCombining }); provenance.push(RULES.orthUnsupportedCombining); continue; }
    if (isArabicScriptLetter(character)) baseIndex += 1;
  }
  const hehIzafat = token.normalizedSurface.endsWith('ۀ') || /ه\u0654$/u.test(token.normalizedSurface);
  if (hehIzafat) provenance.push(RULES.orthHehIzafat);
  const lookupForm = token.normalizedSurface.replace(/\p{M}/gu, '').replace(/ۀ$/u, 'ه');
  const evidencedSegments = zwnjBoundaries.length ? lookupForm.split('\u200c') : [lookupForm];
  if (zwnjBoundaries.length) warnings.push('ZWNJ boundary retained without assigning suffix or compound semantics.');
  if (unsupportedCombiningMarks.length) warnings.push('Unsupported combining-mark evidence is preserved but not interpreted; authoritative lexical resolution requires review.');
  return { tokenIndex, normalizedSurface: token.normalizedSurface, lookupForm, normalizedStart: token.normalizedStart, normalizedEnd: token.normalizedEnd, explicitVowels, explicitIzafat: explicitVowels.some((item) => item.relationOnly) ? 'FINAL_KASRA' : hehIzafat ? 'HEH_ORTHOGRAPHY' : null, unsupportedCombiningMarks, zwnjBoundaries, evidencedSegments, warnings, provenance };
}
