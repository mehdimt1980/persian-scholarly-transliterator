import { BibliographyExportReport, ScholarlyExportMode } from '../export/types';
import { BibliographyDiagnostic, ProcessedBibliographyBatch, ProcessedBibliographyField, ProcessedBibliographyRecord } from '../types';

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

export function getAuthoritativeFinalFieldValue(
  field: ProcessedBibliographyField | undefined,
  fallbackSourceText: string | undefined
): { value: string; isAuthoritative: boolean } {
  if (!field) {
    return { value: fallbackSourceText ?? '', isAuthoritative: true };
  }
  if (!field.requiresTransliteration) {
    return { value: field.sourceText, isAuthoritative: true };
  }
  if (field.finalText !== null) {
    return { value: field.finalText, isAuthoritative: true };
  }
  return { value: '', isAuthoritative: false };
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
    // Fallback if records were constructed without sourceColumns
    baseHeaders = [
      'id', 'type', 'title', 'container_title', 'authors', 'editors', 'translators',
      'year', 'publisher', 'place', 'volume', 'issue', 'page_start', 'page_end',
      'doi', 'url', 'isbn', 'issn', 'language', 'notes'
    ];
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

    // Build base source cells preserving original header order and verbatim values
    const baseRowValues: string[] = [];
    if (r.sourceColumns && r.sourceColumns.length > 0) {
      const colMap = new Map(r.sourceColumns.map((c) => [c.header, c.value]));
      for (const h of baseHeaders) {
        baseRowValues.push(colMap.get(h) ?? '');
      }
    } else {
      baseRowValues.push(
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
      );
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

  const eligibleRecords: ProcessedBibliographyRecord[] = [];

  for (const pr of batch.records) {
    const reasons: string[] = [];

    if (pr.readiness !== 'READY') {
      if (pr.readiness === 'INVALID') {
        reasons.push(...pr.invalidReasons);
      } else {
        reasons.push(`Record has ${pr.reviewIssueCount} unresolved review issues.`);
      }
    }

    // Verify authoritative final values for all transformable fields
    for (const [fieldPath, field] of Object.entries(pr.fields)) {
      if (field.requiresTransliteration && field.finalText === null) {
        reasons.push(`Field "${fieldPath}" is unauthoritative or unresolved for final export.`);
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
      eligibleRecords.push(pr);
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
  for (const pr of eligibleRecords) {
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

  for (const pr of eligibleRecords) {
    const r = pr.record;
    exportedRecordIds.push(r.id);

    const titleAuth = getAuthoritativeFinalFieldValue(pr.fields['title'], r.title);
    const containerTitleAuth = r.containerTitle
      ? getAuthoritativeFinalFieldValue(pr.fields['containerTitle'], r.containerTitle)
      : { value: '', isAuthoritative: true };
    const publisherAuth = r.publisher
      ? getAuthoritativeFinalFieldValue(pr.fields['publisher'], r.publisher)
      : { value: '', isAuthoritative: true };
    const placeAuth = r.place
      ? getAuthoritativeFinalFieldValue(pr.fields['place'], r.place)
      : { value: '', isAuthoritative: true };

    const authorValues = r.authors.map((a, i) =>
      getAuthoritativeFinalFieldValue(pr.fields[`authors.${i}.literal`], a.literal).value
    );
    const editorValues = r.editors.map((e, i) =>
      getAuthoritativeFinalFieldValue(pr.fields[`editors.${i}.literal`], e.literal).value
    );
    const translatorValues = r.translators.map((t, i) =>
      getAuthoritativeFinalFieldValue(pr.fields[`translators.${i}.literal`], t.literal).value
    );

    const row = [
      r.id,
      r.type,
      titleAuth.value,
      containerTitleAuth.value,
      authorValues.join(' | '),
      editorValues.join(' | '),
      translatorValues.join(' | '),
      r.year ?? '',
      publisherAuth.value,
      placeAuth.value,
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
