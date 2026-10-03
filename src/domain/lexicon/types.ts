export type LexicalCategory = 'noun' | 'adjective' | 'proper-noun' | 'preposition' | 'conjunction';

export type LexicalSourceType =
  | 'IJMES_GUIDE'
  | 'SCHOLARLY_DICTIONARY'
  | 'ACADEMIC_GRAMMAR'
  | 'ENCYCLOPEDIA'
  | 'REVIEWED_PROJECT_ENTRY';

export interface LexicalSource {
  type: LexicalSourceType;
  citation: string;
  reference?: string;
}

export type ProperNameType = 'PERSON' | 'PLACE' | 'DYNASTY' | 'INSTITUTION';

export interface ProperNameMetadata {
  type: ProperNameType;
  notes?: string;
}

export type ExplicitVowel = 'a' | 'i' | 'u';

export interface VocalizationEvidence {
  afterBaseIndex: number;
  vowel: ExplicitVowel;
}

export interface LexicalReading {
  id?: string;
  canonical: string;
  confidence: number;
  notes?: string;
  source: string;
  sources?: LexicalSource[];
  vocalization?: VocalizationEvidence[];
  properName?: ProperNameMetadata;
  category?: LexicalCategory;
}

export interface LexicalContextEvidence {
  explicitIzafatAfter?: string[];
  source: string;
  notes?: string;
}

export interface LexicalEntry {
  id: string;
  surface: string;
  normalized: string;
  category?: LexicalCategory;
  readings: LexicalReading[];
  sources?: LexicalSource[];
  context?: LexicalContextEvidence;
  notes?: string;
  properName?: ProperNameMetadata;
}
