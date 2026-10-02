export type ResultStatus = 'DETERMINISTIC' | 'LEXICON_RESOLVED' | 'AMBIGUOUS' | 'UNRESOLVED' | 'USER_OVERRIDE';
export type TokenType = 'persian-word' | 'punctuation' | 'whitespace' | 'number' | 'latin' | 'unknown';
export type ProfileId = 'ijmes_full' | 'ijmes_title';
export type AuthorityCategory = 'chart' | 'current-guide' | 'linguistic-convention' | 'lexical-data' | 'editorial';

export interface RuleDefinition { id: string; title: string; description: string; authority: AuthorityCategory; reference: string; }
export interface NormalizationChange { index: number; original: string; normalized: string; kind: 'orthographic-variant' | 'joiner' | 'whitespace'; semanticRole?: 'persian-heh-with-ye-above' | 'arabic-ta-marbuta'; }
export interface NormalizationResult { originalInput: string; normalizedInput: string; changes: NormalizationChange[]; }
export interface LexicalReading { canonical: string; confidence: number; notes?: string; source: string; }
export interface LexicalContextEvidence { explicitIzafatAfter?: string[]; source: string; notes?: string; }
export interface LexicalEntry { surface: string; normalized: string; readings: LexicalReading[]; context?: LexicalContextEvidence; notes?: string; }
export interface Token { text: string; normalizedText: string; type: TokenType; start: number; end: number; }
export interface ContextEvidence { type: 'IZAFAT'; sourceTokenIndex: number; targetTokenIndex: number; rule: RuleDefinition; source: string; }
export interface TokenResult {
  source: string; canonicalTransliteration: string | null; rendered: string; diagnosticScaffold?: string;
  status: ResultStatus; confidence?: number; appliedRules: RuleDefinition[]; lexicalSources: string[];
  warnings: string[]; alternatives: string[]; start: number; end: number;
}
export interface TransliterationResult {
  originalInput: string; normalizedInput: string; normalizationChanges: NormalizationChange[]; profile: ProfileId;
  output: string; copyable: boolean; status: ResultStatus; tokens: TokenResult[]; warnings: string[];
}
