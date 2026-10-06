import { RomanizationScheme } from '../types';

/**
 * Supported query formats for Library of Congress catalog retrieval.
 */
export type LocQuery =
  | {
      kind: 'LCCN';
      lccn: string;
    }
  | {
      kind: 'SRU';
      cql: string;
      startRecord?: number;
      maximumRecords?: number;
    };

/**
 * Individual MARC subfield ($code value).
 */
export interface MarcSubfield {
  code: string;
  value: string;
}

/**
 * Variable datafield in a MARC record.
 */
export interface MarcDataField {
  tag: string;
  ind1: string;
  ind2: string;
  subfields: MarcSubfield[];
}

/**
 * Fixed controlfield in a MARC record (e.g. 001, 005, 008).
 */
export interface MarcControlField {
  tag: string;
  value: string;
}

/**
 * In-memory representation of a parsed MARC 21 record.
 */
export interface MarcRecord {
  leader?: string;
  controlFields: MarcControlField[];
  dataFields: MarcDataField[];
  lccn?: string;
  language?: string;
  sourceUri?: string;
}

/**
 * Parsed components of a MARC Subfield $6 (Linkage).
 * Format: tag-occurrence[/(script-code)/(orientation-code)]
 * Example: '100-01/(3/r' -> linkingTag: '100', occurrenceNumber: '01', scriptCode: '3', orientationCode: 'r'
 */
export interface ParsedSubfield6 {
  linkingTag: string;
  occurrenceNumber: string;
  scriptCode?: string;
  orientationCode?: string;
  raw: string;
}

/**
 * Status of a MARC field 880 linkage resolution.
 */
export type LinkageStatus =
  | 'MATCHED'
  | 'OCCURRENCE_00'
  | 'UNMATCHED_NONZERO'
  | 'AMBIGUOUS_DUPLICATE'
  | 'MALFORMED_LINKAGE';

/**
 * Resolved linkage between a regular MARC field and its alternate graphic representation (field 880).
 */
export interface LinkedMarcFieldPair {
  tag: string;
  regularField?: MarcDataField;
  alternateField: MarcDataField;
  occurrenceNumber: string;
  linkage?: ParsedSubfield6;
  status: LinkageStatus;
  diagnostic?: string;
}

/**
 * Diagnostic error reported by an SRU server.
 */
export interface SruDiagnostic {
  uri?: string;
  message: string;
  details?: string;
}

/**
 * Parsed SRU response envelope containing record count, diagnostics, and records.
 */
export interface SruResponse {
  version?: string;
  numberOfRecords: number;
  diagnostics: SruDiagnostic[];
  records: MarcRecord[];
  rawRecords: string[];
}

/**
 * Configuration options for the LoC LexicalEvidence extractor.
 */
export interface LocExtractorOptions {
  extractorVersion?: string;
  defaultScheme?: RomanizationScheme;
  now?: () => string;
}

