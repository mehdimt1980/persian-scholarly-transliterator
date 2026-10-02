export type ResultStatus = 'DETERMINISTIC' | 'LEXICON_RESOLVED' | 'AMBIGUOUS' | 'UNRESOLVED' | 'USER_OVERRIDE';
export type TokenType = 'persian-word' | 'punctuation' | 'whitespace' | 'number' | 'latin' | 'unknown';
export type ProfileId = 'ijmes_full' | 'ijmes_title';
export type AuthorityCategory = 'chart' | 'current-guide' | 'linguistic-convention' | 'lexical-data' | 'editorial';

export interface RuleDefinition { id: string; title: string; description: string; authority: AuthorityCategory; reference: string; }
export interface LexicalReading { transliteration: string; status: 'LEXICON_RESOLVED' | 'AMBIGUOUS'; confidence: number; notes?: string; }
export interface LexicalEntry { surface: string; normalized: string; readings: LexicalReading[]; source: string; notes?: string; }
export interface Token { text: string; normalizedText: string; type: TokenType; start: number; end: number; }
export interface TokenResult { source: string; transliteration: string; status: ResultStatus; confidence?: number; appliedRules: RuleDefinition[]; lexicalSource?: string; warnings: string[]; alternatives: string[]; start: number; end: number; }
export interface TransliterationResult { originalInput: string; normalizedInput: string; profile: ProfileId; output: string; status: ResultStatus; tokens: TokenResult[]; warnings: string[]; }
