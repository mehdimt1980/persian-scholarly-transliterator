import { ProfileId, TransliterationResult } from '../types';
import { ReviewDecision, ReviewIssue } from '../review/types';
import { AssistedResolution } from '../assistance/types';

export type BibliographyRecordType =
  | 'BOOK'
  | 'JOURNAL_ARTICLE'
  | 'BOOK_CHAPTER'
  | 'THESIS'
  | 'OTHER';

export interface BibliographyCreator {
  literal: string;
  given?: string;
  family?: string;
}

export interface BibliographySourceCell {
  header: string;
  value: string;
}

export interface BibliographyRecord {
  id: string;
  type: BibliographyRecordType;

  title: string;
  containerTitle?: string;

  authors: BibliographyCreator[];
  editors: BibliographyCreator[];
  translators: BibliographyCreator[];

  year?: string;
  publisher?: string;
  place?: string;

  volume?: string;
  issue?: string;
  pageStart?: string;
  pageEnd?: string;

  doi?: string;
  url?: string;
  isbn?: string;
  issn?: string;

  language?: string;
  notes?: string;

  sourceRowIndex: number;
  sourceColumns: BibliographySourceCell[];

  passthrough: Record<string, string>;
}

export type BibliographyFieldPath =
  | 'title'
  | 'containerTitle'
  | `authors.${number}.literal`
  | `editors.${number}.literal`
  | `translators.${number}.literal`
  | 'publisher'
  | 'place';

export type BibliographyFieldStatus =
  | 'PASSTHROUGH'
  | 'DETERMINISTIC'
  | 'LEXICON_RESOLVED'
  | 'USER_OVERRIDE'
  | 'REVIEW_REQUIRED'
  | 'UNRESOLVED';

export interface ProcessedBibliographyField {
  fieldPath: BibliographyFieldPath;
  sourceText: string;
  profile: ProfileId | null;

  requiresTransliteration: boolean;
  transliterationResult?: TransliterationResult;

  finalText: string | null;
  status: BibliographyFieldStatus;
  reviewIssues: ReviewIssue[];
}

export type BibliographyRecordReadiness =
  | 'READY'
  | 'REVIEW_REQUIRED'
  | 'INVALID';

export interface ProcessedBibliographyRecord {
  record: BibliographyRecord;
  fields: Record<string, ProcessedBibliographyField>;
  readiness: BibliographyRecordReadiness;
  reviewIssueCount: number;
  invalidReasons: string[];
}

export interface BibliographyBatchSummary {
  total: number;
  ready: number;
  reviewRequired: number;
  invalid: number;
}

export interface BibliographyReviewDecision {
  recordId: string;
  fieldPath: BibliographyFieldPath;
  decision: ReviewDecision;
}

export interface BibliographyAssistanceState {
  recordId: string;
  fieldPath: BibliographyFieldPath;
  issueId: string;
  resolution: AssistedResolution;
}

export function makeBibliographyIssueScopeKey(
  recordId: string,
  fieldPath: BibliographyFieldPath,
  issueId: string
): string {
  return `${recordId}:::${fieldPath}:::${issueId}`;
}

export interface ProcessedBibliographyBatch {
  records: ProcessedBibliographyRecord[];
  summary: BibliographyBatchSummary;
  diagnostics: BibliographyDiagnostic[];
}

export interface BibliographyDiagnostic {
  row?: number;
  recordId?: string;
  field?: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  code: string;
  message: string;
}

export interface BibliographyImportLimits {
  maxFileSize: number; // bytes
  maxRowCount: number;
  maxFieldLength: number;
}

export const DEFAULT_IMPORT_LIMITS: BibliographyImportLimits = {
  maxFileSize: 10 * 1024 * 1024, // 10 MB
  maxRowCount: 5000,
  maxFieldLength: 50000
};
