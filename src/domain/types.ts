import type { LexicalCategory, LexicalEntry, LexicalReading, ExplicitVowel } from './lexicon/types';
import type { ReviewDecision, ReviewIssue } from './review/types';
import type { MorphologicalAnalysis } from './morphology/types';

export type ResultStatus = 'DETERMINISTIC' | 'LEXICON_RESOLVED' | 'AMBIGUOUS' | 'UNRESOLVED' | 'USER_OVERRIDE';
export type TokenType = 'persian-word' | 'punctuation' | 'whitespace' | 'number' | 'latin' | 'unknown';
export type ProfileId = 'ijmes_full' | 'ijmes_title';
export type AuthorityCategory = 'chart' | 'current-guide' | 'linguistic-convention' | 'lexical-data' | 'editorial' | 'user-decision';
export type RelationStatus = 'CONFIRMED' | 'CANDIDATE';
export type EvidenceCompatibility = 'MATCH' | 'CONFLICT' | 'UNKNOWN';

export interface RuleDefinition {
  id: string;
  title: string;
  description: string;
  authority: AuthorityCategory;
  reference: string;
}

export interface NormalizationChange {
  index: number;
  original: string;
  normalized: string;
  kind: 'orthographic-variant' | 'joiner' | 'whitespace';
  semanticRole?: 'persian-heh-with-ye-above' | 'arabic-ta-marbuta';
}

export interface NormalizationResult {
  originalInput: string;
  normalizedInput: string;
  changes: NormalizationChange[];
}

export interface Token {
  normalizedSurface: string;
  type: TokenType;
  normalizedStart: number;
  normalizedEnd: number;
}

export interface OrthographicVowelEvidence {
  mark: 'FATHA' | 'KASRA' | 'DAMMA';
  vowel: ExplicitVowel;
  normalizedTokenOffset: number;
  afterBaseIndex: number;
  rule: RuleDefinition;
  relationOnly: boolean;
}

export interface UnsupportedCombiningEvidence {
  mark: string;
  normalizedTokenOffset: number;
  afterBaseIndex: number;
  rule: RuleDefinition;
}

export interface TokenAnalysis {
  tokenIndex: number;
  normalizedSurface: string;
  lookupForm: string;
  normalizedStart: number;
  normalizedEnd: number;
  explicitVowels: OrthographicVowelEvidence[];
  explicitIzafat: 'FINAL_KASRA' | 'HEH_ORTHOGRAPHY' | null;
  unsupportedCombiningMarks: UnsupportedCombiningEvidence[];
  zwnjBoundaries: number[];
  evidencedSegments: string[];
  warnings: string[];
  provenance: RuleDefinition[];
}

export interface RelationEvidence {
  kind: 'EXPLICIT_FINAL_KASRA' | 'EXPLICIT_HEH_ORTHOGRAPHY' | 'EXPLICIT_PLURAL_IZAFAT_YE' | 'CURATED_LEXICAL_CONTEXT' | 'GRAMMATICAL_CANDIDATE' | 'USER_DECISION';
  rule: RuleDefinition;
  source: string;
}

export interface ContextRelation {
  type: 'IZAFAT';
  sourceTokenIndex: number;
  targetTokenIndex: number;
  status: RelationStatus;
  evidence: RelationEvidence[];
  confidence?: number;
  rendering: 'STANDARD_I' | 'REVIEW_REQUIRED_ALLOMORPH';
  warnings: string[];
  userDecision?: ReviewDecision;
}

export interface TokenResult {
  normalizedSurface: string;
  tokenType: TokenType;
  canonicalTransliteration: string | null;
  rendered: string;
  diagnosticScaffold?: string;
  status: ResultStatus;
  automaticStatus?: ResultStatus;
  automaticCanonical?: string | null;
  confidence?: number;
  lexicalCategory?: LexicalCategory;
  appliedRules: RuleDefinition[];
  lexicalSources: string[];
  warnings: string[];
  alternatives: string[];
  normalizedStart: number;
  normalizedEnd: number;
  userDecision?: ReviewDecision;
}

export interface TransliterationResult {
  originalInput: string;
  normalizedInput: string;
  normalizationChanges: NormalizationChange[];
  profile: ProfileId;
  output: string;
  copyable: boolean;
  status: ResultStatus;
  tokens: TokenResult[];
  analyses: TokenAnalysis[];
  morphology: MorphologicalAnalysis[];
  relations: ContextRelation[];
  reviewIssues: ReviewIssue[];
  appliedDecisions: ReviewDecision[];
  staleDecisions: ReviewDecision[];
  reviewReasons: string[];
  warnings: string[];
}

export * from './lexicon/types';
export * from './review/types';
export type {
  MorphemeEvidence,
  MorphemeRealization,
  MorphemeSegment,
  MorphemeType,
  MorphologicalAnalysis,
  MorphologicalHostEnding,
  MorphologyStatus,
  ProductiveSuffixRule
} from './morphology/types';
