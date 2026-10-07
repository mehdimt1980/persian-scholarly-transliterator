/**
 * Kaikki / Wiktextract Persian lexical acquisition domain and source types.
 *
 * Source: English Wiktionary parsed via Wiktextract and distributed by Kaikki.org.
 *
 * Core scholarly invariant:
 *   EXTERNAL OBSERVATION ≠ LEXICAL CANDIDATE ≠ HUMAN DECISION ≠ AUTHORITATIVE LEXICON ENTRY
 */

import type { LexicalCandidate, LexicalEvidence } from '../types';

/**
 * Raw Wiktextract form entry.
 */
export interface KaikkiForm {
  form?: string;
  tags?: string[];
  raw_tags?: string[];
  source?: string;
  ipa?: string;
  romanization?: string;
  head_nr?: number;
}

/**
 * Raw Wiktextract sound/pronunciation entry.
 */
export interface KaikkiSound {
  ipa?: string;
  tags?: string[];
  raw_tags?: string[];
  note?: string;
  enpr?: string;
  audio?: string;
  text?: string;
}

/**
 * Raw Wiktextract form_of / alt_of sense relation.
 */
export interface KaikkiSenseFormOf {
  word?: string;
  extra?: string;
}

/**
 * Raw Wiktextract sense entry supporting both singular id and Wiktextract senseid array.
 */
export interface KaikkiSense {
  id?: string;
  senseid?: string[];
  glosses?: string[];
  tags?: string[];
  raw_tags?: string[];
  categories?: unknown[];
  form_of?: KaikkiSenseFormOf[];
  alt_of?: KaikkiSenseFormOf[];
  links?: unknown[];
}

/**
 * Raw Wiktextract / Kaikki Persian entry data shape.
 */
export interface KaikkiRawEntry {
  word: string;
  lang?: string;
  lang_code?: string;
  pos?: string;
  tags?: string[];
  etymology_number?: string | number;
  head_nr?: number;
  forms?: KaikkiForm[];
  sounds?: KaikkiSound[];
  senses?: KaikkiSense[];
  etymology_text?: string;
  etymology_templates?: unknown[];
  head_templates?: unknown[];
  title?: string;
  redirect?: string;
}

/**
 * Extracted per-romanization observation with localized source index and tags.
 */
export interface KaikkiRomanizationObservation {
  value: string;
  sourceFormIndex: number;
  tags: string[];
  rawTags?: string[];
  source?: string;
  headNr?: number;
}

/**
 * Classification of lexical lemma status in Wiktextract.
 */
export type KaikkiLemmaStatus = 'LEMMA' | 'NON_LEMMA_FORM' | 'UNKNOWN_LEMMA_STATUS';

/**
 * Preserved IPA observation with tags and notes.
 */
export interface KaikkiIpaObservation {
  ipa: string;
  tags: string[];
  note?: string;
}

/**
 * Preserved lemma relation for inflected / variant forms.
 */
export interface KaikkiLemmaRelation {
  kind: 'FORM_OF' | 'ALT_OF';
  lemma: string;
  tags?: string[];
}

/**
 * Preserved linguistic metadata extracted alongside raw observations.
 * Metadata ≠ Authority.
 */
export interface KaikkiEvidenceMetadata {
  pos?: string;
  etymologyNumber?: string | number;
  headNr?: number;
  lemmaStatus: KaikkiLemmaStatus;
  lemmaRelation?: KaikkiLemmaRelation;
  ipaObservations: KaikkiIpaObservation[];
  varietyTags: string[];
  romanizationTags?: string[];
  romanizationRawTags?: string[];
  romanizationSource?: string;
  romanizationHeadNr?: number;
  sourceFormIndex?: number;
  sourceSenseIds: string[];
  glosses: string[];
  etymologyText?: string;
  rawSourceWord: string;
  normalizedForm: string;
}

/**
 * Bundle of an extracted LexicalEvidence observation and its linguistic metadata.
 */
export interface KaikkiExtractedObservation {
  evidence: LexicalEvidence;
  metadata: KaikkiEvidenceMetadata;
  rawSourceWord: string;
  normalizedForm: string;
}

/**
 * Single-line parsing outcome.
 */
export interface KaikkiRecordParseResult {
  success: boolean;
  entry?: KaikkiRawEntry;
  rawLine: string;
  lineNumber: number;
  error?: string;
  isPersian: boolean;
  rejectionReason?: string;
}

/**
 * Options for stream parsing and bulk execution.
 */
export interface KaikkiParseOptions {
  strict?: boolean;
  onlyLemmas?: boolean;
  limit?: number;
  offset?: number;
  collectObservations?: boolean;
  evidenceSink?: (evidence: LexicalEvidence) => void | Promise<void>;
  candidateSink?: (candidate: LexicalCandidate) => void | Promise<void>;
}

/**
 * Source provenance and run manifest.
 */
export interface KaikkiSourceManifest {
  source?: string;
  wiktionaryDumpDate?: string;
  extractionDate?: string;
  wiktextractVersion?: string;
  acquisitionTimestamp: string;
  extractorVersion: string;
  inputSha256?: string;
  inputFile?: string;
}

/**
 * Aggregated entry for Persian forms with multiple romanization observations.
 */
export interface KaikkiMultiRomanizationEntry {
  persianForm: string;
  normalizedForm: string;
  observations: string[];
  distinctObservations: string[];
  automaticAuthority: false;
  evidenceIds: string[];
}

/**
 * Record of raw forms colliding on the same normalized Persian project string.
 */
export interface KaikkiNormalizationCollision {
  normalizedForm: string;
  rawForms: string[];
  posList: string[];
  romanizations: string[];
}

/**
 * Read-only overlap assessment between an external observation and the project LexiconRepository.
 */
export interface KaikkiLexiconOverlapItem {
  normalizedForm: string;
  persianForm: string;
  inLexicon: boolean;
  lexiconCanonical?: string;
  externalRomanizations: string[];
  overlapStatus: 'EXACT_MATCH' | 'DIVERGENT' | 'NEW_FORM';
}

/**
 * Complete machine-readable summary report for Kaikki acquisition pilot.
 */
export interface KaikkiAcquisitionReport {
  source: string;
  extractorVersion: string;
  manifest: KaikkiSourceManifest;
  rowsRead: number;
  malformedRows: number;
  validPersianRecords: number;
  distinctPersianForms: number;
  distinctNormalizedForms: number;
  lemmaRecords: number;
  nonLemmaRecords: number;
  unknownLemmaStatusRecords: number;
  entriesWithRomanization: number;
  romanizationObservationCount: number;
  formsWithOneRomanization: number;
  formsWithMultiRomanization: number;
  formsWithNoRomanization: number;
  entriesWithIpa: number;
  existingLexiconOverlapCount: number;
  newFormCount: number;
  candidateCount: number;
  promotionCount: 0;
  authoritativeLexiconChanges: 0;
  normalizationCollisions: KaikkiNormalizationCollision[];
  multiRomanizationSamples: KaikkiMultiRomanizationEntry[];
}

/**
 * Result bundle returned by KaikkiEvidenceConnector.
 */
export interface KaikkiAcquisitionResult {
  observations?: KaikkiExtractedObservation[];
  evidence?: LexicalEvidence[];
  candidates?: LexicalCandidate[];
  report: KaikkiAcquisitionReport;
}
