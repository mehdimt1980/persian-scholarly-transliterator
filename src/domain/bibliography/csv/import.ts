import { generateFallbackRecordId } from '../recordIdentity';
import {
  BibliographyCreator,
  BibliographyDiagnostic,
  BibliographyImportLimits,
  BibliographyRecord,
  BibliographyRecordType,
  DEFAULT_IMPORT_LIMITS
} from '../types';
import { parseCsvString } from './parser';

export interface CsvImportResult {
  records: BibliographyRecord[];
  diagnostics: BibliographyDiagnostic[];
  success: boolean;
}

function normalizeHeaderKey(key: string): string {
  return key.toLowerCase().replace(/[\s\-_]+/g, '');
}

function parseCreators(raw: string): BibliographyCreator[] {
  if (!raw || raw.trim().length === 0) {
    return [];
  }
  // Split on '|' only. Do not split on commas.
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((literal) => ({ literal }));
}

function parseRecordType(raw: string | undefined, rowIdx: number, diagnostics: BibliographyDiagnostic[]): BibliographyRecordType {
  if (!raw || raw.trim().length === 0) {
    return 'OTHER';
  }
  const normalized = raw.trim().toLowerCase().replace(/[\s\-_]+/g, '');
  switch (normalized) {
    case 'book':
    case 'monograph':
      return 'BOOK';
    case 'journalarticle':
    case 'article':
    case 'journal':
      return 'JOURNAL_ARTICLE';
    case 'bookchapter':
    case 'chapter':
    case 'incollection':
    case 'inbook':
      return 'BOOK_CHAPTER';
    case 'thesis':
    case 'phdthesis':
    case 'mastersthesis':
    case 'dissertation':
      return 'THESIS';
    case 'other':
    case 'misc':
    case 'generic':
      return 'OTHER';
    default:
      diagnostics.push({
        row: rowIdx,
        severity: 'WARNING',
        code: 'UNKNOWN_RECORD_TYPE',
        message: `Unrecognized record type "${raw}". Defaulting to "OTHER".`
      });
      return 'OTHER';
  }
}

export function importBibliographyFromCsv(
  csvContent: string,
  limits: BibliographyImportLimits = DEFAULT_IMPORT_LIMITS
): CsvImportResult {
  const diagnostics: BibliographyDiagnostic[] = [];

  if (new Blob([csvContent]).size > limits.maxFileSize) {
    diagnostics.push({
      severity: 'ERROR',
      code: 'FILE_SIZE_EXCEEDED',
      message: `File size exceeds the maximum limit of ${limits.maxFileSize} bytes.`
    });
    return { records: [], diagnostics, success: false };
  }

  const parseResult = parseCsvString(csvContent);
  for (const err of parseResult.errors) {
    diagnostics.push({
      severity: 'ERROR',
      code: 'CSV_PARSE_ERROR',
      message: err
    });
  }

  if (parseResult.headers.length === 0) {
    diagnostics.push({
      severity: 'ERROR',
      code: 'EMPTY_CSV',
      message: 'The provided CSV file contains no headers or data.'
    });
    return { records: [], diagnostics, success: false };
  }

  if (parseResult.rows.length > limits.maxRowCount) {
    diagnostics.push({
      severity: 'ERROR',
      code: 'ROW_LIMIT_EXCEEDED',
      message: `Row count (${parseResult.rows.length}) exceeds maximum limit of ${limits.maxRowCount}.`
    });
    return { records: [], diagnostics, success: false };
  }

  // Map header indexes
  const headerMap = new Map<string, { original: string; index: number }>();
  parseResult.headers.forEach((h, index) => {
    headerMap.set(normalizeHeaderKey(h), { original: h, index });
  });

  const getField = (row: string[], ...aliases: string[]): string | undefined => {
    for (const alias of aliases) {
      const match = headerMap.get(normalizeHeaderKey(alias));
      if (match && row[match.index] !== undefined) {
        const val = row[match.index].trim();
        return val.length > 0 ? val : undefined;
      }
    }
    return undefined;
  };

  const knownNormalizedHeaders = new Set([
    'id', 'recordid',
    'type', 'recordtype', 'entrytype',
    'title', 'booktitle', 'articletitle',
    'containertitle', 'container', 'journal', 'publication',
    'authors', 'author', 'creator', 'creators',
    'editors', 'editor',
    'translators', 'translator',
    'year', 'date', 'publicationyear', 'pubyear',
    'publisher',
    'place', 'city', 'address', 'location',
    'volume', 'vol',
    'issue', 'number', 'no',
    'pagestart', 'startpage', 'firstpage', 'sp',
    'pageend', 'endpage', 'lastpage', 'ep',
    'doi',
    'url', 'link',
    'isbn',
    'issn',
    'language', 'lang',
    'notes', 'note', 'abstract'
  ]);

  const seenSuppliedIds = new Set<string>();
  const occurrenceCounts = new Map<string, number>();
  const records: BibliographyRecord[] = [];

  for (let rowIndex = 0; rowIndex < parseResult.rows.length; rowIndex++) {
    const row = parseResult.rows[rowIndex];
    const sourceRowNumber = rowIndex + 2; // 1-indexed including header row

    // Field length check
    for (let c = 0; c < row.length; c++) {
      if (row[c].length > limits.maxFieldLength) {
        diagnostics.push({
          row: sourceRowNumber,
          severity: 'ERROR',
          code: 'FIELD_LENGTH_EXCEEDED',
          message: `Field at column ${c + 1} exceeds maximum length limit of ${limits.maxFieldLength} characters.`
        });
      }
    }

    const title = getField(row, 'title', 'book_title', 'article_title') ?? '';
    if (!title) {
      diagnostics.push({
        row: sourceRowNumber,
        field: 'title',
        severity: 'ERROR',
        code: 'MISSING_TITLE',
        message: 'Record is missing a required title.'
      });
    }

    const suppliedId = getField(row, 'id', 'record_id');
    if (suppliedId) {
      if (seenSuppliedIds.has(suppliedId)) {
        diagnostics.push({
          row: sourceRowNumber,
          field: 'id',
          severity: 'ERROR',
          code: 'DUPLICATE_ID',
          message: `Duplicate record ID "${suppliedId}" detected.`
        });
      } else {
        seenSuppliedIds.add(suppliedId);
      }
    }

    const type = parseRecordType(getField(row, 'type', 'record_type', 'entry_type'), sourceRowNumber, diagnostics);
    const containerTitle = getField(row, 'container_title', 'containerTitle', 'container', 'journal', 'booktitle', 'publication');
    const authors = parseCreators(getField(row, 'authors', 'author', 'creators', 'creator') ?? '');
    const editors = parseCreators(getField(row, 'editors', 'editor') ?? '');
    const translators = parseCreators(getField(row, 'translators', 'translator') ?? '');
    const year = getField(row, 'year', 'date', 'publication_year', 'pub_year');
    const publisher = getField(row, 'publisher');
    const place = getField(row, 'place', 'city', 'address', 'location');
    const volume = getField(row, 'volume', 'vol');
    const issue = getField(row, 'issue', 'number', 'no');
    const pageStart = getField(row, 'page_start', 'pageStart', 'start_page', 'first_page', 'sp');
    const pageEnd = getField(row, 'page_end', 'pageEnd', 'end_page', 'last_page', 'ep');
    const doi = getField(row, 'doi');
    const url = getField(row, 'url', 'link');
    const isbn = getField(row, 'isbn');
    const issn = getField(row, 'issn');
    const language = getField(row, 'language', 'lang');
    const notes = getField(row, 'notes', 'note', 'abstract');

    // Extract passthrough unknown columns
    const passthrough: Record<string, string> = {};
    parseResult.headers.forEach((headerName, colIdx) => {
      const normalized = normalizeHeaderKey(headerName);
      if (!knownNormalizedHeaders.has(normalized)) {
        const val = row[colIdx];
        if (val !== undefined) {
          passthrough[headerName] = val;
        }
      }
    });

    const recordBase = {
      type,
      title,
      containerTitle,
      authors,
      editors,
      translators,
      year,
      publisher,
      place,
      volume,
      issue,
      pageStart,
      pageEnd,
      doi,
      url,
      isbn,
      issn,
      language,
      notes,
      passthrough
    };

    let id: string;
    if (suppliedId) {
      id = suppliedId;
    } else {
      const fingerprint = generateFallbackRecordId(recordBase, 0).split(':')[1];
      const count = (occurrenceCounts.get(fingerprint) ?? 0) + 1;
      occurrenceCounts.set(fingerprint, count);
      id = `record:${fingerprint}:${count}`;
    }

    records.push({
      ...recordBase,
      id,
      sourceRowIndex: sourceRowNumber
    });
  }

  const hasFatalErrors = diagnostics.some((d) => d.severity === 'ERROR' && d.code === 'DUPLICATE_ID');

  return {
    records,
    diagnostics,
    success: !hasFatalErrors
  };
}
