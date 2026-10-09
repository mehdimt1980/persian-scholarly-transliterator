import type { LanguageEvidenceAssessment, LatinVariantClassification, PairingStatus, RawTitleVariant, ScriptClassification } from './types';

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

function language(value: string | undefined): string | undefined { return value?.toLowerCase().split('-')[0]; }

export function assessLanguageEvidence(titles: RawTitleVariant[], catalogLanguages: string[]): { candidates: RawTitleVariant[]; assessment: LanguageEvidenceAssessment; evidence: string[] } {
  const catalog = catalogLanguages.map(language).filter((item): item is string => Boolean(item));
  const arabicScript = titles.filter((title) => ['PERSIAN_SCRIPT', 'ARABIC_SCRIPT_UNCERTAIN_LANGUAGE'].includes(classifyScript(title.value)));
  const contradictions = arabicScript.some((title) => language(title.language) === 'ar') && catalog.includes('fa');
  const candidates = arabicScript.filter((title) => classifyScript(title.value) === 'PERSIAN_SCRIPT' || language(title.language) === 'fa' || (catalog.includes('fa') && language(title.language) !== 'ar'));
  if (contradictions) return { candidates, assessment: 'CONTRADICTORY', evidence: ['Catalog-level Persian metadata conflicts with an Arabic title-language tag.'] };
  if (candidates.length > 0) return { candidates, assessment: 'POSITIVE_PERSIAN_EVIDENCE', evidence: candidates.some((title) => classifyScript(title.value) === 'ARABIC_SCRIPT_UNCERTAIN_LANGUAGE') ? ['Arabic-script title is supported as Persian by explicit catalog language metadata.'] : ['Persian-specific Unicode characters provide positive script evidence.'] };
  return { candidates: [], assessment: 'AMBIGUOUS', evidence: arabicScript.length ? ['Arabic script is present without supporting Persian language metadata.'] : ['No Persian language evidence is present.'] };
}

function classifyLatinVariant(title: RawTitleVariant): LatinVariantClassification {
  if (title.explicitRelationship === 'ROMANIZATION') return 'ROMANIZATION_CANDIDATE';
  if (title.explicitRelationship === 'TRANSLATION') return 'TRANSLATED_TITLE';
  return 'UNDETERMINED_LATIN_VARIANT';
}

export function pairTitles(titles: RawTitleVariant[], catalogLanguages: string[] = []): { persianTitle: string | null; latinVariants: Array<RawTitleVariant & { classification: LatinVariantClassification }>; status: PairingStatus; evidence: string[]; languageAssessment: LanguageEvidenceAssessment } {
  const languageEvidence = assessLanguageEvidence(titles, catalogLanguages);
  const persian = languageEvidence.candidates;
  const uncertainArabic = titles.filter((title) => classifyScript(title.value) === 'ARABIC_SCRIPT_UNCERTAIN_LANGUAGE');
  const latin = titles.filter((title) => classifyScript(title.value) === 'LATIN_ONLY');
  const latinVariants = latin.map((title) => ({ ...title, classification: classifyLatinVariant(title) }));
  if (persian.length === 0) return { persianTitle: null, latinVariants, status: latin.length === titles.length ? 'LATIN_ONLY' : 'UNCERTAIN_LANGUAGE_OR_PAIRING', evidence: [...languageEvidence.evidence, ...(uncertainArabic.length ? ['Arabic-script title remains preserved for audit.'] : [])], languageAssessment: languageEvidence.assessment };
  if (persian.length > 1) return { persianTitle: persian[0].value, latinVariants, status: 'UNCERTAIN_LANGUAGE_OR_PAIRING', evidence: [...languageEvidence.evidence, 'Multiple Persian candidates require human pairing review.'], languageAssessment: languageEvidence.assessment };
  if (latin.length === 0) return { persianTitle: persian[0].value, latinVariants, status: 'PERSIAN_ONLY', evidence: [...languageEvidence.evidence, 'One Persian candidate; no explicit Latin title variant in the record.'], languageAssessment: languageEvidence.assessment };
  const hasRomanizationCandidate = latinVariants.some((title) => title.classification === 'ROMANIZATION_CANDIDATE');
  return { persianTitle: persian[0].value, latinVariants, status: latin.length > 1 ? 'MULTIPLE_ROMANIZATION_VARIANTS' : hasRomanizationCandidate ? 'PERSIAN_WITH_OBSERVED_ROMANIZATION' : 'UNCERTAIN_LANGUAGE_OR_PAIRING', evidence: [...languageEvidence.evidence, 'Latin variants coexist in the same record; co-occurrence is evidence, not proof of romanization.', ...(hasRomanizationCandidate ? ['Source metadata explicitly marks at least one variant as a romanization candidate; scholarly verification remains required.'] : [])], languageAssessment: languageEvidence.assessment };
}
