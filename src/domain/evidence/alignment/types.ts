import {
  CandidateEligibility,
  LexicalCandidate,
  LexicalEvidence,
  LexicalEvidenceDerivation
} from '../types';

/**
 * An individual Persian lexical word token extracted from a parent string.
 */
export interface PersianLexicalToken {
  text: string;
  start: number;
  end: number;
}

/**
 * An individual scholarly Romanized lexeme token extracted from a parent string.
 */
export interface RomanLexemeToken {
  text: string;
  start: number;
  end: number;
  hasBoundMarker: boolean;
}

/**
 * Diagnostic failure code for alignment.
 */
export type AlignmentDiagnosticKind =
  | 'NO_ROMANIZATION'
  | 'NO_PERSIAN_TOKENS'
  | 'NO_ROMAN_TOKENS'
  | 'TOKEN_COUNT_MISMATCH';

/**
 * Structured diagnostic explaining why alignment failed or was skipped.
 */
export interface AlignmentDiagnostic {
  kind: AlignmentDiagnosticKind;
  message: string;
  persianTokenCount?: number;
  romanTokenCount?: number;
}

/**
 * A successfully paired Persian and Roman token with its derived LexicalEvidence record.
 */
export interface AlignedSegmentPair {
  segmentIndex: number;
  persianToken: PersianLexicalToken;
  romanToken: RomanLexemeToken;
  derivedEvidence: LexicalEvidence;
  candidateEligibility: CandidateEligibility;
  exclusionReason?: string;
}

/**
 * Complete outcome of running positional alignment on a parent LexicalEvidence record.
 */
export interface AlignmentResult {
  success: boolean;
  parentEvidenceId: string;
  persianTokens: PersianLexicalToken[];
  romanTokens: RomanLexemeToken[];
  pairs: AlignedSegmentPair[];
  derivedEvidence: LexicalEvidence[];
  diagnostic?: AlignmentDiagnostic;
}

/**
 * Options for configuring the alignment engine.
 */
export interface AlignmentOptions {
  extractorVersion?: string;
  now?: () => string;
}

/**
 * Options for candidate extraction from aligned evidence.
 */
export interface CandidateExtractionOptions {
  synthesizerVersion?: string;
  derivedAt?: string;
  notes?: string;
}

/**
 * Aggregated summary and candidates resulting from cross-record candidate extraction.
 */
export interface CandidateExtractionResult {
  candidates: LexicalCandidate[];
  parentObservationsCount: number;
  derivedSegmentsCount: number;
  eligibleSegmentsCount: number;
  contextBoundSegmentsCount: number;
  unalignedObservationsCount: number;
}
