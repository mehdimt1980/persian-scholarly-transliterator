import type { LexicalCategory, LexicalEntry, OrthographicVowelEvidence, RuleDefinition } from '../types';

export type MorphemeType =
  | 'STEM'
  | 'PLURAL_HA'
  | 'COMPARATIVE_TAR'
  | 'SUPERLATIVE_TARIN'
  | 'POSSESSIVE_1SG'
  | 'POSSESSIVE_2SG'
  | 'POSSESSIVE_3SG'
  | 'POSSESSIVE_1PL'
  | 'POSSESSIVE_2PL'
  | 'POSSESSIVE_3PL';

export type MorphologyStatus = 'CONFIRMED' | 'CANDIDATE' | 'CONFLICT';
export type MorphologicalHostEnding = 'CONSONANT_FINAL' | 'VOWEL_FINAL' | 'HEH_FINAL' | 'UNKNOWN';

export interface MorphemeRealization {
  hostEnding: MorphologicalHostEnding;
  canonicalRendering: string;
}

export interface MorphemeEvidence {
  kind: 'ZWNJ_BOUNDARY' | 'REVIEWED_STEM' | 'HOST_ENDING' | 'PRODUCTIVE_RULE' | 'EXPLICIT_IZAFAT_YE' | 'WHOLE_WORD_READING';
  rule: RuleDefinition;
  description: string;
}

export interface MorphemeSegment {
  type: MorphemeType;
  normalizedSurface: string;
  normalizedStart: number;
  normalizedEnd: number;
  canonicalRendering?: string;
  evidence: MorphemeEvidence[];
  status: MorphologyStatus;
}

export interface MorphologicalAnalysis {
  tokenIndex: number;
  normalizedSurface: string;
  normalizedStart: number;
  normalizedEnd: number;
  lexicalLookupStem: string;
  stemEntry?: LexicalEntry;
  stemCategory?: LexicalCategory;
  hostEnding: MorphologicalHostEnding;
  stemVowelEvidence: OrthographicVowelEvidence[];
  morphemes: MorphemeSegment[];
  status: MorphologyStatus;
  explicitIzafat: boolean;
  evidence: MorphemeEvidence[];
  warnings: string[];
  alternatives: string[];
}

export interface ProductiveSuffixRule {
  id: string;
  surfaceForms: string[];
  morphemeType: Exclude<MorphemeType, 'STEM'>;
  hostCategories: LexicalCategory[];
  canonicalRendering?: string;
  realizations?: MorphemeRealization[];
  allowWithoutZwnj: boolean;
  rule: RuleDefinition;
}

export type MorphologyResolutionStrength =
  | 'CONFIRMED_REVIEWED'
  | 'COMPETING_REVIEWED'
  | 'CANDIDATE_SHAPE_ONLY'
  | 'BLOCKED_BY_EXPLICIT_EVIDENCE'
  | 'UNSUPPORTED_OR_AMBIGUOUS';

export function classifyMorphologyStrength(
  morphology?: MorphologicalAnalysis,
  hasUnsupportedOrthography?: boolean,
  hasExplicitVowels?: boolean
): MorphologyResolutionStrength {
  if (!morphology) {
    return 'CANDIDATE_SHAPE_ONLY';
  }
  if (
    hasUnsupportedOrthography ||
    hasExplicitVowels ||
    morphology.warnings.some(
      (w) =>
        w.includes('Unsupported combining-mark') ||
        w.includes('conflicts with every reviewed') ||
        w.includes('Explicit source vowel')
    )
  ) {
    return 'BLOCKED_BY_EXPLICIT_EVIDENCE';
  }
  if (morphology.status === 'CONFIRMED' && morphology.stemEntry) {
    return 'CONFIRMED_REVIEWED';
  }
  if (
    morphology.alternatives.includes('WHOLE_WORD') ||
    (morphology.stemEntry && morphology.status === 'CANDIDATE')
  ) {
    return 'COMPETING_REVIEWED';
  }
  if (
    morphology.status === 'CONFLICT' ||
    morphology.warnings.some(
      (w) =>
        w.includes('allomorphs require review') ||
        w.includes('no authoritative') ||
        w.includes('lexically ambiguous')
    )
  ) {
    return 'UNSUPPORTED_OR_AMBIGUOUS';
  }
  if (!morphology.stemEntry) {
    return 'CANDIDATE_SHAPE_ONLY';
  }
  return 'UNSUPPORTED_OR_AMBIGUOUS';
}
