import { RULES } from './provenance';
import { TokenResult } from './types';

const DIACRITICS: Record<string, string> = { ā:'a', ī:'i', ū:'u', Ā:'A', Ī:'I', Ū:'U', ḥ:'h', ṣ:'s', ṭ:'t', ẓ:'z', ż:'z' };
const MINOR_TITLE_WORDS = new Set(['va', 'dar', 'az', 'ba', 'bar', 'bi', 'ta', 'u', 'wa', 'al']);
const LOWERCASE_HYPHENATED_PREFIXES = ['wa-l-', 'bi-l-', 'li-l-', 'la-l-', 'al-', 'wa-', 'bi-', 'li-', 'la-'];
const LOWERCASE_HYPHENATED_SUFFIXES = new Set(['i']);

export function removeTitleDiacritics(value: string): string {
  return value.replace(/[āīūĀĪŪḥṣṭẓż]/g, (character) => DIACRITICS[character] ?? character);
}

function capitalizeFirstLetter(value: string): string {
  return value.replace(/[a-z]/, (letter) => letter.toUpperCase());
}

function capitalizeHyphenatedCompound(value: string): string {
  return value.split('-').map((part, index) => index > 0 && LOWERCASE_HYPHENATED_SUFFIXES.has(part) ? part : capitalizeFirstLetter(part)).join('-');
}

function titleCaseTransliteration(value: string, isBoundary: boolean): string {
  const lower = value.toLocaleLowerCase('en-US');
  const structuralPrefix = LOWERCASE_HYPHENATED_PREFIXES.find((prefix) => lower.startsWith(prefix));
  if (structuralPrefix) return structuralPrefix + capitalizeHyphenatedCompound(lower.slice(structuralPrefix.length));
  if (!isBoundary && MINOR_TITLE_WORDS.has(lower)) return lower;
  return capitalizeHyphenatedCompound(value);
}

export function applyTitleProfile(results: TokenResult[]): void {
  const wordIndexes = results.map((result, index) => result.canonicalTransliteration === null || !/[a-zāīūḥṣṭẓżʿʾ]/i.test(result.canonicalTransliteration) ? -1 : index).filter((index) => index >= 0);
  const first = wordIndexes[0]; const last = wordIndexes[wordIndexes.length - 1];
  for (const index of wordIndexes) {
    const result = results[index];
    const withoutDiacritics = removeTitleDiacritics(result.canonicalTransliteration!);
    result.rendered = titleCaseTransliteration(withoutDiacritics, index === first || index === last);
    if (withoutDiacritics !== result.canonicalTransliteration) result.appliedRules.push(RULES.titleDiacritics);
    result.appliedRules.push(RULES.titleCase);
  }
}
