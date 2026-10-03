import { BibliographyDiagnostic, ProcessedBibliographyBatch, ProcessedBibliographyRecord } from '../types';
import { BibliographyExportReport, ScholarlyExportMode } from './types';

function escapeBibTeXValue(str: string): string {
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

function sanitizeCitationKey(rawId: string): string {
  const sanitized = rawId.replace(/[^a-zA-Z0-9_\-:]/g, '_');
  if (sanitized.startsWith('record:') || sanitized.startsWith('pst_')) {
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

function getFinalOrSource(record: ProcessedBibliographyRecord, fieldPath: string, fallback: string | undefined): string {
  const field = record.fields[fieldPath];
  if (field && field.finalText !== null) {
    return field.finalText;
  }
  return fallback ?? '';
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
    const key = sanitizeCitationKey(r.id);

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

    const title = getFinalOrSource(pr, 'title', r.title);
    if (title) {
      lines.push(`  title = {${escapeBibTeXValue(title)}}`);
    }

    // Authors joined by " and "
    const authorNames = r.authors
      .map((_, idx) => getFinalOrSource(pr, `authors.${idx}.literal`, r.authors[idx].literal))
      .filter((name) => name.length > 0);
    if (authorNames.length > 0) {
      lines.push(`  author = {${authorNames.map(escapeBibTeXValue).join(' and ')}}`);
    }

    // Editors joined by " and "
    const editorNames = r.editors
      .map((_, idx) => getFinalOrSource(pr, `editors.${idx}.literal`, r.editors[idx].literal))
      .filter((name) => name.length > 0);
    if (editorNames.length > 0) {
      lines.push(`  editor = {${editorNames.map(escapeBibTeXValue).join(' and ')}}`);
    }

    if (r.containerTitle) {
      const container = getFinalOrSource(pr, 'containerTitle', r.containerTitle);
      if (container) {
        if (r.type === 'JOURNAL_ARTICLE') {
          lines.push(`  journal = {${escapeBibTeXValue(container)}}`);
        } else {
          lines.push(`  booktitle = {${escapeBibTeXValue(container)}}`);
        }
      }
    }

    if (r.year) {
      lines.push(`  year = {${escapeBibTeXValue(r.year)}}`);
    }

    if (r.publisher) {
      const pub = getFinalOrSource(pr, 'publisher', r.publisher);
      if (pub) {
        lines.push(`  publisher = {${escapeBibTeXValue(pub)}}`);
      }
    }

    if (r.place) {
      const place = getFinalOrSource(pr, 'place', r.place);
      if (place) {
        lines.push(`  address = {${escapeBibTeXValue(place)}}`);
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
