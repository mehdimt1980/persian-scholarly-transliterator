import { BibliographyExportReport, ScholarlyExportMode } from '../export/types';
import { BibliographyDiagnostic, ProcessedBibliographyBatch, ProcessedBibliographyRecord } from '../types';

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

function getFinalOrSource(record: ProcessedBibliographyRecord, fieldPath: string, fallback: string | undefined): string {
  const field = record.fields[fieldPath];
  if (field && field.finalText !== null) {
    return field.finalText;
  }
  return fallback ?? '';
}

function getFinalCreatorList(record: ProcessedBibliographyRecord, prefix: 'authors' | 'editors' | 'translators', originalList: Array<{ literal: string }>): string {
  return originalList
    .map((c, idx) => {
      const fieldPath = `${prefix}.${idx}.literal`;
      const field = record.fields[fieldPath];
      if (field && field.finalText !== null) {
        return field.finalText;
      }
      return c.literal;
    })
    .join(' | ');
}

export function exportReviewCsv(batch: ProcessedBibliographyBatch): BibliographyExportReport {
  const diagnostics: BibliographyDiagnostic[] = [];
  const exportedRecordIds: string[] = [];

  // Collect all unique passthrough headers
  const passthroughHeaderSet = new Set<string>();
  for (const pr of batch.records) {
    for (const k of Object.keys(pr.record.passthrough)) {
      passthroughHeaderSet.add(k);
    }
  }
  const passthroughHeaders = Array.from(passthroughHeaderSet).sort();

  const headers = [
    'id',
    'type',
    'title',
    'translit_title',
    'container_title',
    'translit_container_title',
    'authors',
    'translit_authors',
    'editors',
    'translit_editors',
    'translators',
    'translit_translators',
    'year',
    'publisher',
    'translit_publisher',
    'place',
    'translit_place',
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
    'record_status',
    'review_issue_count',
    ...passthroughHeaders
  ];

  const lines: string[] = [headers.map(escapeCsvField).join(',')];

  for (const pr of batch.records) {
    const r = pr.record;
    exportedRecordIds.push(r.id);

    const translitTitle = pr.fields['title']?.finalText ?? '';
    const translitContainer = pr.fields['containerTitle']?.finalText ?? '';
    const translitPublisher = pr.fields['publisher']?.finalText ?? '';
    const translitPlace = pr.fields['place']?.finalText ?? '';

    const translitAuthors = r.authors
      .map((_, i) => pr.fields[`authors.${i}.literal`]?.finalText ?? '')
      .filter((s) => s.length > 0)
      .join(' | ');

    const translitEditors = r.editors
      .map((_, i) => pr.fields[`editors.${i}.literal`]?.finalText ?? '')
      .filter((s) => s.length > 0)
      .join(' | ');

    const translitTranslators = r.translators
      .map((_, i) => pr.fields[`translators.${i}.literal`]?.finalText ?? '')
      .filter((s) => s.length > 0)
      .join(' | ');

    const row = [
      r.id,
      r.type,
      r.title,
      translitTitle,
      r.containerTitle ?? '',
      translitContainer,
      r.authors.map((a) => a.literal).join(' | '),
      translitAuthors,
      r.editors.map((e) => e.literal).join(' | '),
      translitEditors,
      r.translators.map((t) => t.literal).join(' | '),
      translitTranslators,
      r.year ?? '',
      r.publisher ?? '',
      translitPublisher,
      r.place ?? '',
      translitPlace,
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
      pr.readiness,
      String(pr.reviewIssueCount),
      ...passthroughHeaders.map((k) => r.passthrough[k] ?? '')
    ];

    lines.push(row.map(escapeCsvField).join(','));
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
    if (pr.readiness !== 'READY') {
      const reasons: string[] = [];
      if (pr.readiness === 'INVALID') {
        reasons.push(...pr.invalidReasons);
      } else {
        reasons.push(`Record has ${pr.reviewIssueCount} unresolved review issues.`);
      }

      if (mode === 'STRICT_ALL') {
        diagnostics.push({
          recordId: pr.record.id,
          row: pr.record.sourceRowIndex,
          severity: 'ERROR',
          code: 'UNREADY_RECORD_BLOCKS_STRICT_EXPORT',
          message: `Record "${pr.record.id}" is ${pr.readiness}: ${reasons.join('; ')}`
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

    const title = getFinalOrSource(pr, 'title', r.title);
    const containerTitle = r.containerTitle ? getFinalOrSource(pr, 'containerTitle', r.containerTitle) : '';
    const publisher = r.publisher ? getFinalOrSource(pr, 'publisher', r.publisher) : '';
    const place = r.place ? getFinalOrSource(pr, 'place', r.place) : '';
    const authors = getFinalCreatorList(pr, 'authors', r.authors);
    const editors = getFinalCreatorList(pr, 'editors', r.editors);
    const translators = getFinalCreatorList(pr, 'translators', r.translators);

    const row = [
      r.id,
      r.type,
      title,
      containerTitle,
      authors,
      editors,
      translators,
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
