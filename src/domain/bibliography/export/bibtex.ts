import { BibliographyDiagnostic, ProcessedBibliographyBatch, ProcessedBibliographyRecord } from '../types';
import { getAuthoritativeFinalFieldValue } from '../csv/export';
import { BibliographyExportReport, ScholarlyExportMode } from './types';

export function escapeBibTeXValue(str: string): string {
  // Escape structural BibTeX characters while preserving Unicode diacritics
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/&/g, '\\&')
    .replace(/#/g, '\\#');
}

export function sanitizeBibTeXKey(rawId: string): string {
  const sanitized = rawId.replace(/[^a-zA-Z0-9_]/g, '_');
  if (sanitized.startsWith('pst_')) {
    return sanitized;
  }
  return `pst_${sanitized}`;
}

function mapRecordTypeToBibTeX(type: string): string {
  switch (type) {
    case 'BOOK':
      return 'book';
    case 'JOURNAL_ARTICLE':
      return 'article';
    case 'BOOK_CHAPTER':
      return 'incollection';
    case 'THESIS':
      return 'phdthesis';
    default:
      return 'misc';
  }
}

export function exportToBibTeX(
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
      format: 'BIBTEX',
      mode,
      success: false,
      content: '',
      filename: 'bibliography.bib',
      mimeType: 'application/x-bibtex;charset=utf-8',
      exportedRecordIds: [],
      skippedRecordIds: batch.records.map((r) => r.record.id),
      skipReasons,
      diagnostics
    };
  }

  // Check unique citation keys
  const seenKeys = new Map<string, string>(); // key -> recordId
  const entries: string[] = [];

  for (const pr of eligibleRecords) {
    const r = pr.record;
    const key = sanitizeBibTeXKey(r.id);

    if (seenKeys.has(key)) {
      diagnostics.push({
        recordId: r.id,
        severity: 'ERROR',
        code: 'DUPLICATE_CITATION_KEY',
        message: `Citation key collision detected for key "${key}" between record "${r.id}" and "${seenKeys.get(key)}".`
      });
    } else {
      seenKeys.set(key, r.id);
    }

    exportedRecordIds.push(r.id);

    const entryType = mapRecordTypeToBibTeX(r.type);
    const lines: string[] = [];

    const titleAuth = getAuthoritativeFinalFieldValue(pr.fields['title'], r.title);
    if (titleAuth.value) {
      lines.push(`  title = {${escapeBibTeXValue(titleAuth.value)}}`);
    }

    // Authors joined by " and "
    const authorNames = r.authors
      .map((creator, idx) => getAuthoritativeFinalFieldValue(pr.fields[`authors.${idx}.literal`], creator.literal).value)
      .filter((name) => name.length > 0);
    if (authorNames.length > 0) {
      lines.push(`  author = {${authorNames.map(escapeBibTeXValue).join(' and ')}}`);
    }

    // Editors joined by " and "
    const editorNames = r.editors
      .map((creator, idx) => getAuthoritativeFinalFieldValue(pr.fields[`editors.${idx}.literal`], creator.literal).value)
      .filter((name) => name.length > 0);
    if (editorNames.length > 0) {
      lines.push(`  editor = {${editorNames.map(escapeBibTeXValue).join(' and ')}}`);
    }

    if (r.containerTitle) {
      const containerAuth = getAuthoritativeFinalFieldValue(pr.fields['containerTitle'], r.containerTitle);
      if (containerAuth.value) {
        if (r.type === 'JOURNAL_ARTICLE') {
          lines.push(`  journal = {${escapeBibTeXValue(containerAuth.value)}}`);
        } else {
          lines.push(`  booktitle = {${escapeBibTeXValue(containerAuth.value)}}`);
        }
      }
    }

    if (r.year) {
      lines.push(`  year = {${escapeBibTeXValue(r.year)}}`);
    }

    if (r.publisher) {
      const pubAuth = getAuthoritativeFinalFieldValue(pr.fields['publisher'], r.publisher);
      if (pubAuth.value) {
        lines.push(`  publisher = {${escapeBibTeXValue(pubAuth.value)}}`);
      }
    }

    if (r.place) {
      const placeAuth = getAuthoritativeFinalFieldValue(pr.fields['place'], r.place);
      if (placeAuth.value) {
        lines.push(`  address = {${escapeBibTeXValue(placeAuth.value)}}`);
      }
    }

    if (r.volume) {
      lines.push(`  volume = {${escapeBibTeXValue(r.volume)}}`);
    }

    if (r.issue) {
      lines.push(`  number = {${escapeBibTeXValue(r.issue)}}`);
    }

    if (r.pageStart || r.pageEnd) {
      if (r.pageStart && r.pageEnd) {
        lines.push(`  pages = {${escapeBibTeXValue(r.pageStart)}--${escapeBibTeXValue(r.pageEnd)}}`);
      } else {
        lines.push(`  pages = {${escapeBibTeXValue(r.pageStart ?? r.pageEnd ?? '')}}`);
      }
    }

    if (r.doi) {
      lines.push(`  doi = {${escapeBibTeXValue(r.doi)}}`);
    }

    if (r.url) {
      lines.push(`  url = {${escapeBibTeXValue(r.url)}}`);
    }

    if (r.isbn) {
      lines.push(`  isbn = {${escapeBibTeXValue(r.isbn)}}`);
    }

    if (r.issn) {
      lines.push(`  issn = {${escapeBibTeXValue(r.issn)}}`);
    }

    if (r.notes) {
      lines.push(`  note = {${escapeBibTeXValue(r.notes)}}`);
    }

    const entry = `@${entryType}{${key},\n${lines.join(',\n')}\n}`;
    entries.push(entry);
  }

  if (diagnostics.some((d) => d.severity === 'ERROR')) {
    return {
      format: 'BIBTEX',
      mode,
      success: false,
      content: '',
      filename: 'bibliography.bib',
      mimeType: 'application/x-bibtex;charset=utf-8',
      exportedRecordIds: [],
      skippedRecordIds: batch.records.map((r) => r.record.id),
      skipReasons,
      diagnostics
    };
  }

  const content = entries.length > 0 ? entries.join('\n\n') + '\n' : '';

  return {
    format: 'BIBTEX',
    mode,
    success: true,
    content,
    filename: 'bibliography.bib',
    mimeType: 'application/x-bibtex;charset=utf-8',
    exportedRecordIds,
    skippedRecordIds,
    skipReasons,
    diagnostics
  };
}
