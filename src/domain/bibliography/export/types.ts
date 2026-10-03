import { BibliographyDiagnostic } from '../types';

export type ScholarlyExportMode = 'STRICT_ALL' | 'READY_ONLY';

export type ScholarlyExportFormat = 'CSV_REVIEW' | 'CSV_FINAL' | 'RIS' | 'BIBTEX';

export interface BibliographyExportReport {
  format: ScholarlyExportFormat;
  mode?: ScholarlyExportMode;
  success: boolean;
  content: string;
  filename: string;
  mimeType: string;
  exportedRecordIds: string[];
  skippedRecordIds: string[];
  skipReasons: Record<string, string[]>;
  diagnostics: BibliographyDiagnostic[];
}
