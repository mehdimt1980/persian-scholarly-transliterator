export type ResultStatus = 'DETERMINISTIC' | 'LEXICON_RESOLVED' | 'AMBIGUOUS' | 'UNRESOLVED' | 'USER_OVERRIDE';
export type TokenType = 'persian-word' | 'punctuation' | 'whitespace' | 'number' | 'latin' | 'unknown';
export type ProfileId = 'ijmes_full' | 'ijmes_title';
export type AuthorityCategory = 'chart' | 'current-guide' | 'linguistic-convention' | 'lexical-data' | 'editorial';
export type LexicalCategory = 'noun' | 'adjective' | 'proper-noun' | 'preposition' | 'conjunction';
export type ExplicitVowel = 'a' | 'i' | 'u';
export type RelationStatus = 'CONFIRMED' | 'CANDIDATE';

export interface RuleDefinition { id: string; title: string; description: string; authority: AuthorityCategory; reference: string; }
export interface NormalizationChange { index: number; original: string; normalized: string; kind: 'orthographic-variant' | 'joiner' | 'whitespace'; semanticRole?: 'persian-heh-with-ye-above' | 'arabic-ta-marbuta'; }
export interface NormalizationResult { originalInput: string; normalizedInput: string; changes: NormalizationChange[]; }
export interface VocalizationEvidence { afterBaseIndex: number; vowel: ExplicitVowel; }
export interface LexicalReading { canonical: string; confidence: number; notes?: string; source: string; vocalization?: VocalizationEvidence[]; }
export interface LexicalContextEvidence { explicitIzafatAfter?: string[]; source: string; notes?: string; }
export interface LexicalEntry { surface: string; normalized: string; readings: LexicalReading[]; category?: LexicalCategory; context?: LexicalContextEvidence; notes?: string; }
export interface Token { text: string; normalizedText: string; type: TokenType; start: number; end: number; }
export interface OrthographicVowelEvidence { mark: 'FATHA' | 'KASRA' | 'DAMMA'; vowel: ExplicitVowel; sourceOffset: number; afterBaseIndex: number; rule: RuleDefinition; relationOnly: boolean; }
export interface TokenAnalysis {
  tokenIndex: number; surface: string; lookupForm: string; start: number; end: number;
  explicitVowels: OrthographicVowelEvidence[]; explicitIzafat: 'FINAL_KASRA' | 'HEH_ORTHOGRAPHY' | null;
  zwnjBoundaries: number[]; evidencedSegments: string[]; warnings: string[]; provenance: RuleDefinition[];
}
export interface RelationEvidence { kind: 'EXPLICIT_FINAL_KASRA' | 'EXPLICIT_HEH_ORTHOGRAPHY' | 'CURATED_LEXICAL_CONTEXT' | 'GRAMMATICAL_CANDIDATE'; rule: RuleDefinition; source: string; }
export interface ContextRelation {
  type: 'IZAFAT'; sourceTokenIndex: number; targetTokenIndex: number; status: RelationStatus;
  evidence: RelationEvidence[]; confidence?: number; rendering: 'STANDARD_I' | 'REVIEW_REQUIRED_ALLOMORPH'; warnings: string[];
}
export interface TokenResult {
  source: string; canonicalTransliteration: string | null; rendered: string; diagnosticScaffold?: string;
  status: ResultStatus; confidence?: number; appliedRules: RuleDefinition[]; lexicalSources: string[];
  warnings: string[]; alternatives: string[]; start: number; end: number;
}
export interface TransliterationResult {
  originalInput: string; normalizedInput: string; normalizationChanges: NormalizationChange[]; profile: ProfileId;
  output: string; copyable: boolean; status: ResultStatus; tokens: TokenResult[]; analyses: TokenAnalysis[];
  relations: ContextRelation[]; reviewReasons: string[]; warnings: string[];
}
