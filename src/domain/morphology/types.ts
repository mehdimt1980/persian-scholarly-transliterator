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
