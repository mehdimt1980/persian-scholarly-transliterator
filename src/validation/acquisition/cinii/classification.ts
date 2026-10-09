import type { PairingStatus, RawTitleVariant, ScriptClassification } from './types';

const ARABIC = /\p{Script=Arabic}/u;
const LATIN = /\p{Script=Latin}/u;
const PERSIAN_SPECIFIC = /[پچژگککیی]/u;

export function classifyScript(value: string): ScriptClassification {
  const arabic = ARABIC.test(value); const latin = LATIN.test(value);
  if (arabic && latin) return 'MIXED_ARABIC_LATIN';
  if (arabic) return PERSIAN_SPECIFIC.test(value) ? 'PERSIAN_SCRIPT' : 'ARABIC_SCRIPT_UNCERTAIN_LANGUAGE';
  if (latin) return 'LATIN_ONLY';
  return 'OTHER_SCRIPT';
}

export function pairTitles(titles: RawTitleVariant[]): { persianTitle: string | null; romanizations: RawTitleVariant[]; status: PairingStatus; evidence: string[] } {
  const persian = titles.filter((title) => classifyScript(title.value) === 'PERSIAN_SCRIPT');
  const uncertainArabic = titles.filter((title) => classifyScript(title.value) === 'ARABIC_SCRIPT_UNCERTAIN_LANGUAGE');
  const latin = titles.filter((title) => classifyScript(title.value) === 'LATIN_ONLY');
  if (persian.length === 0) return { persianTitle: null, romanizations: [], status: latin.length === titles.length ? 'LATIN_ONLY' : 'UNCERTAIN_LANGUAGE_OR_PAIRING', evidence: uncertainArabic.length ? ['Arabic-script title lacks Persian-specific Unicode evidence.'] : [] };
  if (persian.length > 1) return { persianTitle: persian[0].value, romanizations: [], status: 'UNCERTAIN_LANGUAGE_OR_PAIRING', evidence: ['Multiple Persian-script title variants require human pairing review.'] };
  if (latin.length === 0) return { persianTitle: persian[0].value, romanizations: [], status: 'PERSIAN_ONLY', evidence: ['One Persian-script title; no explicit Latin title variant in the record.'] };
  if (latin.length === 1) return { persianTitle: persian[0].value, romanizations: latin, status: 'PERSIAN_WITH_OBSERVED_ROMANIZATION', evidence: ['Persian and Latin variants coexist in the same source title field structure.'] };
  return { persianTitle: persian[0].value, romanizations: latin, status: 'MULTIPLE_ROMANIZATION_VARIANTS', evidence: ['Multiple Latin variants coexist with one Persian title in the same source record.'] };
}
