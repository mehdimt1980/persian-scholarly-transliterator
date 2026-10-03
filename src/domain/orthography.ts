import { RULES } from './provenance';
import { ExplicitVowel, OrthographicVowelEvidence, Token, TokenAnalysis } from './types';

const VOWEL_MARKS: Record<string, { mark: OrthographicVowelEvidence['mark']; vowel: ExplicitVowel; rule: typeof RULES.orthFatha }> = {
  '\u064e': { mark: 'FATHA', vowel: 'a', rule: RULES.orthFatha },
  '\u0650': { mark: 'KASRA', vowel: 'i', rule: RULES.orthKasra },
  '\u064f': { mark: 'DAMMA', vowel: 'u', rule: RULES.orthDamma }
};

export function analyzeOrthography(tokens: Token[]): TokenAnalysis[] {
  return tokens.flatMap((token, tokenIndex) => token.type === 'persian-word' ? [analyzePersianToken(token, tokenIndex)] : []);
}

function analyzePersianToken(token: Token, tokenIndex: number): TokenAnalysis {
  const characters = [...token.text]; const explicitVowels: OrthographicVowelEvidence[] = []; const zwnjBoundaries: number[] = [];
  const provenance: TokenAnalysis['provenance'] = []; const warnings: string[] = []; let baseIndex = -1;
  const lastBaseIndex = characters.reduce((count, character) => VOWEL_MARKS[character] || character === '\u0654' || character === '\u200c' ? count : count + 1, -1);
  for (let sourceOffset = 0; sourceOffset < characters.length; sourceOffset += 1) {
    const character = characters[sourceOffset]; const vowel = VOWEL_MARKS[character];
    if (vowel) { const relationOnly = vowel.mark === 'KASRA' && baseIndex === lastBaseIndex && sourceOffset === characters.length - 1; explicitVowels.push({ ...vowel, sourceOffset, afterBaseIndex: baseIndex, relationOnly }); provenance.push(vowel.rule); continue; }
    if (character === '\u200c') { zwnjBoundaries.push(sourceOffset); provenance.push(RULES.orthZwnj); continue; }
    if (character !== '\u0654') baseIndex += 1;
  }
  const hehIzafat = token.text.endsWith('ۀ') || /ه\u0654$/u.test(token.text);
  if (hehIzafat) provenance.push(RULES.orthHehIzafat);
  const lookupForm = token.text.replace(/[َُِ]/gu, '').replace(/ۀ$/u, 'ه').replace(/ه\u0654$/u, 'ه');
  const evidencedSegments = zwnjBoundaries.length ? lookupForm.split('\u200c') : [lookupForm];
  if (zwnjBoundaries.length) warnings.push('ZWNJ boundary retained without assigning suffix or compound semantics.');
  return { tokenIndex, surface: token.text, lookupForm, start: token.start, end: token.end, explicitVowels, explicitIzafat: explicitVowels.some((item) => item.relationOnly) ? 'FINAL_KASRA' : hehIzafat ? 'HEH_ORTHOGRAPHY' : null, zwnjBoundaries, evidencedSegments, warnings, provenance };
}
