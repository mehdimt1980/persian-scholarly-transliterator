import { RULES } from './provenance';
import { ProfileId, TokenResult } from './types';

export const SUPPORTED_PROFILES: readonly ProfileId[] = ['ijmes_full', 'ijmes_citation_title'] as const;

export function renderCitationTitleWord(word: string): string {
  const hyphenIndex = word.indexOf('-');
  const first = hyphenIndex === -1 ? word : word.slice(0, hyphenIndex);
  const rest = hyphenIndex === -1 ? '' : word.slice(hyphenIndex);

  if (first.length === 0) {
    return rest;
  }

  let prefix = '';
  let main = first;
  if (main.startsWith('ʿ') || main.startsWith('ʾ') || main.startsWith("'") || main.startsWith('`')) {
    prefix = main[0];
    main = main.slice(1);
  }

  if (main.length > 0) {
    const chars = Array.from(main);
    chars[0] = chars[0].toUpperCase();
    main = chars.join('');
  }

  return prefix + main + rest;
}

export function renderCanonicalForProfile(scholarlyCanonical: string, profile: ProfileId): string {
  if (profile !== 'ijmes_citation_title') {
    return scholarlyCanonical;
  }
  return scholarlyCanonical.replace(/[\p{L}\p{M}ʿʾ]+(?:-[\p{L}\p{M}ʿʾ]+)*/gu, (word) =>
    renderCitationTitleWord(word)
  );
}

export function applyTitleProfile(results: TokenResult[]): void {
  for (const result of results) {
    if (result.canonicalTransliteration !== null && /[\p{L}\p{M}ʿʾ]/u.test(result.canonicalTransliteration)) {
      result.rendered = renderCanonicalForProfile(result.canonicalTransliteration, 'ijmes_citation_title');
      result.appliedRules.push(RULES.citationTitleCapitalization);
    } else if (result.evidenceDerivedProposal && /[\p{L}\p{M}ʿʾ]/u.test(result.evidenceDerivedProposal.hypothesis)) {
      result.evidenceDerivedProposal.renderedProposal = renderCanonicalForProfile(
        result.evidenceDerivedProposal.hypothesis,
        'ijmes_citation_title'
      );
      result.rendered = result.evidenceDerivedProposal.renderedProposal;
      result.appliedRules.push(RULES.citationTitleCapitalization);
    }
  }
}

