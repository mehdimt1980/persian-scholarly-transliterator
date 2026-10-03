import { BibliographyExportReport, ScholarlyExportMode } from '../export/types';
import { validateRecordForFinalExport } from '../export/validateRecord';
import { BibliographyDiagnostic, ProcessedBibliographyBatch, ProcessedBibliographyRecord } from '../types';

export { validateRecordForFinalExport };

function escapeCsvField(val: string | undefined | null): string {
  if (val === undefined || val === null) {
    return '';
  }
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getDerivedCreatorCollection(
  record: ProcessedBibliographyRecord,
  prefix: 'authors' | 'editors' | 'translators',
  count: number
): string {
  if (count === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const field = record.fields[`${prefix}.${i}.literal`];
    if (!field || field.finalText === null) {
      // If any creator in the list is unresolved, leave the derived collection cell empty
      return '';
    }
    parts.push(field.finalText);
  }
  return parts.join(' | ');
}

export function exportReviewCsv(batch: ProcessedBibliographyBatch): BibliographyExportReport {
  const diagnostics: BibliographyDiagnostic[] = [];
  const exportedRecordIds: string[] = [];

  // Determine original source headers from the first record that has sourceColumns
  let baseHeaders: string[] = [];
  const firstWithSourceCols = batch.records.find((r) => r.record.sourceColumns && r.record.sourceColumns.length > 0);

  if (firstWithSourceCols && firstWithSourceCols.record.sourceColumns) {
    baseHeaders = firstWithSourceCols.record.sourceColumns.map((c) => c.header);
  } else {
    baseHeaders = [
      'id', 'type', 'title', 'container_title', 'authors', 'editors', 'translators',
      'year', 'publisher', 'place', 'volume', 'issue', 'page_start', 'page_end',
      'doi', 'url', 'isbn', 'issn', 'language', 'notes'
    ];
  }

  // Validate that all records carrying sourceColumns have matching header layout
  for (const pr of batch.records) {
    const sc = pr.record.sourceColumns;
    if (sc && sc.length > 0) {
      if (sc.length !== baseHeaders.length || !sc.every((cell, idx) => cell.header === baseHeaders[idx])) {
        diagnostics.push({
          recordId: pr.record.id,
          row: pr.record.sourceRowIndex,
          severity: 'ERROR',
          code: 'SOURCE_COLUMN_LAYOUT_MISMATCH',
          message: `Record "${pr.record.id}" source column layout does not match batch reference layout.`
        });
      }
    }
  }

  if (diagnostics.some((d) => d.severity === 'ERROR')) {
    return {
      format: 'CSV_REVIEW',
      success: false,
      content: '',
      filename: 'bibliography-review.csv',
      mimeType: 'text/csv;charset=utf-8',
      exportedRecordIds: [],
      skippedRecordIds: batch.records.map((r) => r.record.id),
      skipReasons: {},
      diagnostics
    };
  }

  const auditHeaders = [
    'translit_title',
    'translit_container_title',
    'translit_authors',
    'translit_editors',
    'translit_translators',
    'translit_publisher',
    'translit_place',
    'record_status',
    'review_issue_count'
  ];

  const fullHeaders = [...baseHeaders, ...auditHeaders];
  const lines: string[] = [fullHeaders.map(escapeCsvField).join(',')];

  for (const pr of batch.records) {
    const r = pr.record;
    exportedRecordIds.push(r.id);

    // Positional source values preservation without collapsing repeated headers into a Map
    let baseRowValues: string[] = [];
    if (r.sourceColumns && r.sourceColumns.length > 0) {
      baseRowValues = r.sourceColumns.map((cell) => cell.value);
    } else {
      baseRowValues = [
        r.id,
        r.type,
        r.title,
        r.containerTitle ?? '',
        r.authors.map((a) => a.literal).join(' | '),
        r.editors.map((e) => e.literal).join(' | '),
        r.translators.map((t) => t.literal).join(' | '),
        r.year ?? '',
        r.publisher ?? '',
        r.place ?? '',
        r.volume ?? '',
        r.issue ?? '',
        r.pageStart ?? '',
        r.pageEnd ?? '',
        r.doi ?? '',
        r.url ?? '',
        r.isbn ?? '',
        r.issn ?? '',
        r.language ?? '',
        r.notes ?? ''
      ];
    }

    const translitTitle = pr.fields['title']?.finalText ?? '';
    const translitContainer = pr.fields['containerTitle']?.finalText ?? '';
    const translitPublisher = pr.fields['publisher']?.finalText ?? '';
    const translitPlace = pr.fields['place']?.finalText ?? '';

    const translitAuthors = getDerivedCreatorCollection(pr, 'authors', r.authors.length);
    const translitEditors = getDerivedCreatorCollection(pr, 'editors', r.editors.length);
    const translitTranslators = getDerivedCreatorCollection(pr, 'translators', r.translators.length);

    const auditValues = [
      translitTitle,
      translitContainer,
      translitAuthors,
      translitEditors,
      translitTranslators,
      translitPublisher,
      translitPlace,
      pr.readiness,
      String(pr.reviewIssueCount)
    ];

    const fullRow = [...baseRowValues, ...auditValues];
    lines.push(fullRow.map(escapeCsvField).join(','));
  }

  return {
    format: 'CSV_REVIEW',
    success: true,
    content: lines.join('\r\n'),
    filename: 'bibliography-review.csv',
    mimeType: 'text/csv;charset=utf-8',
    exportedRecordIds,
    skippedRecordIds: [],
    skipReasons: {},
    diagnostics
  };
}

export function exportFinalCsv(
  batch: ProcessedBibliographyBatch,
  mode: ScholarlyExportMode = 'STRICT_ALL'
): BibliographyExportReport {
  const diagnostics: BibliographyDiagnostic[] = [];
  const exportedRecordIds: string[] = [];
  const skippedRecordIds: string[] = [];
  const skipReasons: Record<string, string[]> = {};

  const eligibleRecords: Array<{ pr: ProcessedBibliographyRecord; authoritativeValues: Record<string, string> }> = [];

  for (const pr of batch.records) {
    const reasons: string[] = [];

    if (pr.readiness !== 'READY') {
      if (pr.readiness === 'INVALID') {
        reasons.push(...pr.invalidReasons);
      } else {
        reasons.push(`Record has ${pr.reviewIssueCount} unresolved review issues.`);
      }
    }

    const validation = validateRecordForFinalExport(pr);
    if (!validation.valid) {
      for (const d of validation.diagnostics) {
        reasons.push(d.message);
      }
    }

    if (reasons.length > 0) {
      if (mode === 'STRICT_ALL') {
        diagnostics.push({
          recordId: pr.record.id,
          row: pr.record.sourceRowIndex,
          severity: 'ERROR',
          code: 'UNREADY_RECORD_BLOCKS_STRICT_EXPORT',
          message: `Record "${pr.record.id}" cannot be exported: ${reasons.join('; ')}`
        });
      } else {
        skippedRecordIds.push(pr.record.id);
        skipReasons[pr.record.id] = reasons;
      }
    } else {
      eligibleRecords.push({ pr, authoritativeValues: validation.authoritativeValues });
    }
  }

  if (mode === 'STRICT_ALL' && diagnostics.some((d) => d.severity === 'ERROR')) {
    return {
      format: 'CSV_FINAL',
      mode,
      success: false,
      content: '',
      filename: 'bibliography-final.csv',
      mimeType: 'text/csv;charset=utf-8',
      exportedRecordIds: [],
      skippedRecordIds: batch.records.map((r) => r.record.id),
      skipReasons,
      diagnostics
    };
  }

  // Collect passthrough headers
  const passthroughHeaderSet = new Set<string>();
  for (const { pr } of eligibleRecords) {
    for (const k of Object.keys(pr.record.passthrough)) {
      passthroughHeaderSet.add(k);
    }
  }
  const passthroughHeaders = Array.from(passthroughHeaderSet).sort();

  const headers = [
    'id',
    'type',
    'title',
    'container_title',
    'authors',
    'editors',
    'translators',
    'year',
    'publisher',
    'place',
    'volume',
    'issue',
    'page_start',
    'page_end',
    'doi',
    'url',
    'isbn',
    'issn',
    'language',
    'notes',
    ...passthroughHeaders
  ];

  const lines: string[] = [headers.map(escapeCsvField).join(',')];

  for (const { pr, authoritativeValues } of eligibleRecords) {
    const r = pr.record;
    exportedRecordIds.push(r.id);

    const title = authoritativeValues['title'] ?? '';
    const containerTitle = r.containerTitle ? (authoritativeValues['containerTitle'] ?? '') : '';
    const publisher = r.publisher ? (authoritativeValues['publisher'] ?? '') : '';
    const place = r.place ? (authoritativeValues['place'] ?? '') : '';

    const authorValues = r.authors.map((_, i) => authoritativeValues[`authors.${i}.literal`] ?? '');
    const editorValues = r.editors.map((_, i) => authoritativeValues[`editors.${i}.literal`] ?? '');
    const translatorValues = r.translators.map((_, i) => authoritativeValues[`translators.${i}.literal`] ?? '');

    const row = [
      r.id,
      r.type,
      title,
      containerTitle,
      authorValues.join(' | '),
      editorValues.join(' | '),
      translatorValues.join(' | '),
      r.year ?? '',
      publisher,
      place,
      r.volume ?? '',
      r.issue ?? '',
      r.pageStart ?? '',
      r.pageEnd ?? '',
      r.doi ?? '',
      r.url ?? '',
      r.isbn ?? '',
      r.issn ?? '',
      r.language ?? '',
      r.notes ?? '',
      ...passthroughHeaders.map((k) => r.passthrough[k] ?? '')
    ];

    lines.push(row.map(escapeCsvField).join(','));
  }

  return {
    format: 'CSV_FINAL',
    mode,
    success: true,
    content: lines.join('\r\n'),
    filename: 'bibliography-final.csv',
    mimeType: 'text/csv;charset=utf-8',
    exportedRecordIds,
    skippedRecordIds,
    skipReasons,
    diagnostics
  };
}
