import { RULES } from './provenance';
import { TokenResult } from './types';

const DIACRITICS: Record<string, string> = { ā:'a', ī:'i', ū:'u', Ā:'A', Ī:'I', Ū:'U', ḥ:'h', ṣ:'s', ṭ:'t', ẓ:'z', ż:'z' };
const MINOR_TITLE_WORDS = new Set(['va', 'dar', 'az', 'ba', 'bar', 'bi', 'ta', 'u', 'wa', 'al']);

export function removeTitleDiacritics(value: string): string {
  return value.replace(/[āīūĀĪŪḥṣṭẓż]/g, (character) => DIACRITICS[character] ?? character);
}

function capitalizeFirstLetter(value: string): string {
  return value.replace(/[a-z]/, (letter) => letter.toUpperCase());
}

export function applyTitleProfile(results: TokenResult[]): void {
  const wordIndexes = results.map((result, index) => result.canonicalTransliteration === null || !/[a-zāīūḥṣṭẓżʿʾ]/i.test(result.canonicalTransliteration) ? -1 : index).filter((index) => index >= 0);
  const first = wordIndexes[0]; const last = wordIndexes[wordIndexes.length - 1];
  for (const index of wordIndexes) {
    const result = results[index];
    const withoutDiacritics = removeTitleDiacritics(result.canonicalTransliteration!);
    const lowerForPolicy = withoutDiacritics.toLocaleLowerCase('en-US');
    result.rendered = index !== first && index !== last && MINOR_TITLE_WORDS.has(lowerForPolicy) ? lowerForPolicy : capitalizeFirstLetter(withoutDiacritics);
    if (withoutDiacritics !== result.canonicalTransliteration) result.appliedRules.push(RULES.titleDiacritics);
    result.appliedRules.push(RULES.titleCase);
  }
}
