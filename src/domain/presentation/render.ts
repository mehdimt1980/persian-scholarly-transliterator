import type {
  CustomScholarlyV1Options,
  PresentationContentCategory,
  PresentationContext,
  PresentationDiagnostic,
  PresentationProfile,
  ScholarlyRenderingResult
} from './types';

const GUIDE = 'IJMES Translation and Transliteration Guide, General 2–7 and Detailed Guidelines';
const MINOR_WORDS = new Set(['al', 'az', 'ba', 'bar', 'bi', 'dar', 'fi', 'la', 'li', 'ta', 'u', 'va', 'wa']);
const STRUCTURAL_SUFFIXES = new Set(['i', 'yi', 'ha', 'hā', 'am', 'at', 'ash', 'iman', 'imān', 'itan', 'itān', 'ishan', 'ishān']);
const PREFIXES = ['wa-l-', 'bi-l-', 'li-l-', 'la-l-', 'al-', 'wa-', 'bi-', 'li-', 'la-'];

function diagnostic(id: string, severity: PresentationDiagnostic['severity'], message: string, ruleId: string): PresentationDiagnostic {
  return { id, severity, message, ruleId, source: GUIDE };
}

/** Remove ordinary letter diacritics while preserving independent ʿayn and hamza. */
export function removePublicationDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC');
}

function upperInitial(value: string): string {
  const chars = Array.from(value);
  const index = chars.findIndex((character) => /\p{L}/u.test(character) && character !== 'ʿ' && character !== 'ʾ');
  if (index >= 0) chars[index] = chars[index].toLocaleUpperCase('en-US');
  return chars.join('');
}

function renderHyphenatedTitleWord(word: string, boundary: boolean): string {
  const lower = word.toLocaleLowerCase('en-US');
  const prefix = PREFIXES.find((candidate) => lower.startsWith(candidate));
  if (prefix) {
    const base = word.slice(prefix.length);
    return prefix + upperInitial(base);
  }

  const parts = word.split('-');
  const firstLower = parts[0].replace(/^[ʿʾ]/u, '').toLocaleLowerCase('en-US');
  const first = MINOR_WORDS.has(firstLower) && !boundary ? parts[0].toLocaleLowerCase('en-US') : upperInitial(parts[0]);
  return [first, ...parts.slice(1).map((part) => {
    const normalized = part.replace(/^[ʿʾ]/u, '').toLocaleLowerCase('en-US');
    return STRUCTURAL_SUFFIXES.has(normalized) || MINOR_WORDS.has(normalized)
      ? part.toLocaleLowerCase('en-US')
      : upperInitial(part);
  })].join('-');
}

export function renderPublicationTitle(value: string): string {
  const matches = [...value.matchAll(/[\p{L}\p{M}ʿʾ]+(?:-[\p{L}\p{M}ʿʾ]+)*/gu)];
  if (matches.length === 0) return value;
  let output = '';
  let cursor = 0;
  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    output += value.slice(cursor, start);
    output += renderHyphenatedTitleWord(match[0], index === 0 || index === matches.length - 1);
    cursor = start + match[0].length;
  });
  return output + value.slice(cursor);
}

function validateCustom(options: CustomScholarlyV1Options): PresentationDiagnostic[] {
  const diagnostics: PresentationDiagnostic[] = [];
  if (options.capitalization === 'ENGLISH_TITLE' && options.contentCategory !== 'BOOK_OR_ARTICLE_TITLE') {
    diagnostics.push(diagnostic(
      'CUSTOM_V1_TITLE_CONTEXT_REQUIRED',
      'BLOCK',
      'English title capitalization is supported only for book or article titles.',
      'PROJECT-CUSTOM-V1-01'
    ));
  }
  return diagnostics;
}

function requiresPublicationDiacriticRemoval(category: PresentationContentCategory): boolean {
  return category === 'BOOK_OR_ARTICLE_TITLE' || category === 'PERSONAL_NAME' || category === 'PLACE_NAME';
}

export function renderScholarlyCanonical(
  canonicalInput: string,
  profile: PresentationProfile,
  context: PresentationContext = {}
): ScholarlyRenderingResult {
  const canonical = canonicalInput.normalize('NFC');
  const diagnostics: PresentationDiagnostic[] = [];
  const appliedRuleIds: string[] = [];

  if (profile.id === 'full_scholarly_v1') {
    return { ok: true, profileId: profile.id, canonical, output: canonical, appliedRuleIds: ['FULL-SCHOLARLY-PRESERVE-01'], diagnostics };
  }

  const category = profile.id === 'custom_scholarly_v1'
    ? profile.options.contentCategory
    : context.contentCategory;
  if (!category) {
    diagnostics.push(diagnostic('PRESENTATION_CONTEXT_REQUIRED', 'BLOCK', 'A content category is required for this presentation policy.', 'PROJECT-CONTEXT-01'));
    return { ok: false, profileId: profile.id, canonical, output: null, appliedRuleIds, diagnostics };
  }

  if (profile.id === 'custom_scholarly_v1') diagnostics.push(...validateCustom(profile.options));
  if (diagnostics.some((item) => item.severity === 'BLOCK')) {
    return { ok: false, profileId: profile.id, canonical, output: null, appliedRuleIds, diagnostics };
  }

  const publicationDiacritics = profile.id === 'ijmes_publication_v1'
    ? requiresPublicationDiacriticRemoval(category)
    : profile.options.diacritics === 'PUBLICATION';
  const titleCase = profile.id === 'ijmes_publication_v1'
    ? category === 'BOOK_OR_ARTICLE_TITLE'
    : profile.options.capitalization === 'ENGLISH_TITLE';

  let output = canonical;
  if (publicationDiacritics) {
    output = removePublicationDiacritics(output);
    appliedRuleIds.push('IJMES-PUB-DIACRITICS-01');
  }
  if (titleCase) {
    output = renderPublicationTitle(output);
    appliedRuleIds.push('IJMES-TITLE-CAPS-01', 'IJMES-ARTICLE-AL-01');
  }
  diagnostics.push(diagnostic('PRESENTATION_DOES_NOT_VERIFY_READING', 'INFO', 'Presentation formatting does not verify the underlying scholarly reading.', 'PROJECT-AUTHORITY-BOUNDARY-01'));
  return { ok: true, profileId: profile.id, canonical, output, appliedRuleIds, diagnostics };
}
