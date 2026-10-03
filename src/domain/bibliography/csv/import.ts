import { generateFallbackRecordId } from '../recordIdentity';
import {
  BibliographyCreator,
  BibliographyDiagnostic,
  BibliographyImportLimits,
  BibliographyRecord,
  BibliographyRecordType,
  BibliographySourceCell,
  DEFAULT_IMPORT_LIMITS
} from '../types';
import { parseCsvString } from './parser';

export interface CsvImportResult {
  records: BibliographyRecord[];
  diagnostics: BibliographyDiagnostic[];
  success: boolean;
}

export function validateFileSize(
  sizeInBytes: number,
  maxSizeBytes: number = DEFAULT_IMPORT_LIMITS.maxFileSize
): { valid: boolean; diagnostic?: BibliographyDiagnostic } {
  if (sizeInBytes > maxSizeBytes) {
    return {
      valid: false,
      diagnostic: {
        severity: 'ERROR',
        code: 'FILE_SIZE_EXCEEDED',
        message: `File size (${sizeInBytes} bytes) exceeds the maximum limit of ${maxSizeBytes} bytes.`
      }
    };
  }
  return { valid: true };
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
  const normalized = normalizeHeaderKey(raw);
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

// Canonical field mappings
const CANONICAL_FIELD_ALIASES: Record<string, string[]> = {
  id: ['id', 'recordid'],
  type: ['type', 'recordtype', 'entrytype'],
  title: ['title', 'articletitle', 'chaptertitle', 'article_title', 'chapter_title'],
  containerTitle: ['containertitle', 'container_title', 'booktitle', 'book_title', 'journaltitle', 'journal_title', 'journal', 'publication', 'container'],
  authors: ['authors', 'author', 'creators', 'creator'],
  editors: ['editors', 'editor'],
  translators: ['translators', 'translator'],
  year: ['year', 'date', 'publicationyear', 'publication_year', 'pubyear', 'pub_year'],
  publisher: ['publisher'],
  place: ['place', 'city', 'address', 'location'],
  volume: ['volume', 'vol'],
  issue: ['issue', 'number', 'no'],
  pageStart: ['pagestart', 'page_start', 'startpage', 'start_page', 'firstpage', 'first_page', 'sp'],
  pageEnd: ['pageend', 'page_end', 'endpage', 'end_page', 'lastpage', 'last_page', 'ep'],
  doi: ['doi'],
  url: ['url', 'link'],
  isbn: ['isbn'],
  issn: ['issn'],
  language: ['language', 'lang'],
  notes: ['notes', 'note', 'abstract']
};

export function importBibliographyFromCsv(
  csvContent: string,
  limits: BibliographyImportLimits = DEFAULT_IMPORT_LIMITS
): CsvImportResult {
  const diagnostics: BibliographyDiagnostic[] = [];

  const byteLength = typeof Buffer !== 'undefined'
    ? Buffer.byteLength(csvContent, 'utf8')
    : new Blob([csvContent]).size;

  const sizeCheck = validateFileSize(byteLength, limits.maxFileSize);
  if (!sizeCheck.valid && sizeCheck.diagnostic) {
    diagnostics.push(sizeCheck.diagnostic);
    return { records: [], diagnostics, success: false };
  }

  const parseResult = parseCsvString(csvContent);
  for (const err of parseResult.errors) {
    const isRowWidth = err.includes('columns, expected');
    diagnostics.push({
      severity: 'ERROR',
      code: isRowWidth ? 'ROW_WIDTH_MISMATCH' : 'CSV_PARSE_ERROR',
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

  // Check for ambiguous duplicate headers mapping to the same canonical field
  const canonicalFieldMatches = new Map<string, string[]>(); // canonicalField -> original headers
  const headerIndexMap = new Map<string, number>(); // normalizedHeader -> column index

  parseResult.headers.forEach((header, index) => {
    const norm = normalizeHeaderKey(header);
    headerIndexMap.set(norm, index);

    // Find which canonical field(s) this header matches
    for (const [canonicalKey, aliases] of Object.entries(CANONICAL_FIELD_ALIASES)) {
      const normAliases = aliases.map(normalizeHeaderKey);
      if (normAliases.includes(norm)) {
        const matches = canonicalFieldMatches.get(canonicalKey) ?? [];
        matches.push(header);
        canonicalFieldMatches.set(canonicalKey, matches);
      }
    }
  });

  let hasAmbiguousHeader = false;
  for (const [canonicalKey, matchingHeaders] of canonicalFieldMatches.entries()) {
    if (matchingHeaders.length > 1) {
      diagnostics.push({
        severity: 'ERROR',
        code: 'AMBIGUOUS_HEADER_MAPPING',
        message: `Multiple CSV columns map to the canonical field "${canonicalKey}": ${matchingHeaders.map((h) => `"${h}"`).join(', ')}.`
      });
      hasAmbiguousHeader = true;
    }
  }

  if (hasAmbiguousHeader || parseResult.errors.length > 0) {
    return { records: [], diagnostics, success: false };
  }

  const getFieldValue = (row: string[], canonicalKey: string): string | undefined => {
    const aliases = CANONICAL_FIELD_ALIASES[canonicalKey] ?? [];
    for (const alias of aliases) {
      const idx = headerIndexMap.get(normalizeHeaderKey(alias));
      if (idx !== undefined && row[idx] !== undefined) {
        const val = row[idx].trim();
        return val.length > 0 ? val : undefined;
      }
    }
    return undefined;
  };

  // Known canonical normalized alias set
  const allKnownAliases = new Set<string>();
  for (const aliases of Object.values(CANONICAL_FIELD_ALIASES)) {
    for (const a of aliases) {
      allKnownAliases.add(normalizeHeaderKey(a));
    }
  }

  const seenSuppliedIds = new Set<string>();
  let hasDuplicateSuppliedId = false;
  let hasFieldLengthExceeded = false;
  const occurrenceCounts = new Map<string, number>();
  const records: BibliographyRecord[] = [];

  for (let rowIndex = 0; rowIndex < parseResult.rows.length; rowIndex++) {
    const row = parseResult.rows[rowIndex];
    const sourceRowNumber = rowIndex + 2; // 1-indexed including header row

    // Field length check
    for (let c = 0; c < row.length; c++) {
      if (row[c] && row[c].length > limits.maxFieldLength) {
        diagnostics.push({
          row: sourceRowNumber,
          severity: 'ERROR',
          code: 'FIELD_LENGTH_EXCEEDED',
          message: `Field at column ${c + 1} exceeds maximum length limit of ${limits.maxFieldLength} characters.`
        });
        hasFieldLengthExceeded = true;
      }
    }

    const title = getFieldValue(row, 'title') ?? '';
    if (!title) {
      diagnostics.push({
        row: sourceRowNumber,
        field: 'title',
        severity: 'ERROR',
        code: 'MISSING_TITLE',
        message: 'Record is missing a required title.'
      });
    }

    const suppliedId = getFieldValue(row, 'id');
    if (suppliedId) {
      if (seenSuppliedIds.has(suppliedId)) {
        diagnostics.push({
          row: sourceRowNumber,
          field: 'id',
          severity: 'ERROR',
          code: 'DUPLICATE_ID',
          message: `Duplicate record ID "${suppliedId}" detected.`
        });
        hasDuplicateSuppliedId = true;
      } else {
        seenSuppliedIds.add(suppliedId);
      }
    }

    const type = parseRecordType(getFieldValue(row, 'type'), sourceRowNumber, diagnostics);
    const containerTitle = getFieldValue(row, 'containerTitle');
    const authors = parseCreators(getFieldValue(row, 'authors') ?? '');
    const editors = parseCreators(getFieldValue(row, 'editors') ?? '');
    const translators = parseCreators(getFieldValue(row, 'translators') ?? '');
    const year = getFieldValue(row, 'year');
    const publisher = getFieldValue(row, 'publisher');
    const place = getFieldValue(row, 'place');
    const volume = getFieldValue(row, 'volume');
    const issue = getFieldValue(row, 'issue');
    const pageStart = getFieldValue(row, 'pageStart');
    const pageEnd = getFieldValue(row, 'pageEnd');
    const doi = getFieldValue(row, 'doi');
    const url = getFieldValue(row, 'url');
    const isbn = getFieldValue(row, 'isbn');
    const issn = getFieldValue(row, 'issn');
    const language = getFieldValue(row, 'language');
    const notes = getFieldValue(row, 'notes');

    // Extract exact source columns (verbatim values and header names)
    const sourceColumns: BibliographySourceCell[] = parseResult.headers.map((header, colIdx) => ({
      header,
      value: row[colIdx] ?? ''
    }));

    // Extract passthrough unknown columns
    const passthrough: Record<string, string> = {};
    parseResult.headers.forEach((headerName, colIdx) => {
      const normalized = normalizeHeaderKey(headerName);
      if (!allKnownAliases.has(normalized)) {
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
      sourceRowIndex: sourceRowNumber,
      sourceColumns
    });
  }

  const hasFatalErrors =
    hasDuplicateSuppliedId ||
    hasFieldLengthExceeded ||
    hasAmbiguousHeader ||
    parseResult.errors.length > 0;

  return {
    records: hasFatalErrors ? [] : records,
    diagnostics,
    success: !hasFatalErrors
  };
}
