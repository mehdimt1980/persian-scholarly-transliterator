import { BibliographyDiagnostic, ProcessedBibliographyBatch, ProcessedBibliographyRecord } from '../types';
import { BibliographyExportReport, ScholarlyExportMode } from './types';

function sanitizeRisValue(
  val: string,
  recordId: string,
  field: string,
  diagnostics: BibliographyDiagnostic[]
): string {
  if (val.includes('\n') || val.includes('\r')) {
    diagnostics.push({
      recordId,
      field,
      severity: 'INFO',
      code: 'RIS_LINEBREAK_NORMALIZED',
      message: `Internal line breaks in field "${field}" were normalized to spaces for RIS serialization.`
    });
    return val.replace(/[\r\n]+/g, ' ').trim();
  }
  return val.trim();
}

function mapRecordTypeToRis(type: string): string {
  switch (type) {
    case 'BOOK':
      return 'BOOK';
    case 'JOURNAL_ARTICLE':
      return 'JOUR';
    case 'BOOK_CHAPTER':
      return 'CHAP';
    case 'THESIS':
      return 'THES';
    default:
      return 'GEN';
  }
}

function getFinalOrSource(record: ProcessedBibliographyRecord, fieldPath: string, fallback: string | undefined): string {
  const field = record.fields[fieldPath];
  if (field && field.finalText !== null) {
    return field.finalText;
  }
  return fallback ?? '';
}

export function exportToRis(
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
      format: 'RIS',
      mode,
      success: false,
      content: '',
      filename: 'bibliography.ris',
      mimeType: 'application/x-research-info-systems;charset=utf-8',
      exportedRecordIds: [],
      skippedRecordIds: batch.records.map((r) => r.record.id),
      skipReasons,
      diagnostics
    };
  }

  const risBlocks: string[] = [];

  for (const pr of eligibleRecords) {
    const r = pr.record;
    exportedRecordIds.push(r.id);

    const lines: string[] = [];
    lines.push(`TY  - ${mapRecordTypeToRis(r.type)}`);

    const title = getFinalOrSource(pr, 'title', r.title);
    if (title) {
      lines.push(`TI  - ${sanitizeRisValue(title, r.id, 'title', diagnostics)}`);
    }

    if (r.containerTitle) {
      const containerTitle = getFinalOrSource(pr, 'containerTitle', r.containerTitle);
      if (containerTitle) {
        lines.push(`T2  - ${sanitizeRisValue(containerTitle, r.id, 'containerTitle', diagnostics)}`);
      }
    }

    // Authors
    r.authors.forEach((_, idx) => {
      const authorText = getFinalOrSource(pr, `authors.${idx}.literal`, r.authors[idx].literal);
      if (authorText) {
        lines.push(`AU  - ${sanitizeRisValue(authorText, r.id, `authors.${idx}`, diagnostics)}`);
      }
    });

    // Editors
    r.editors.forEach((_, idx) => {
      const editorText = getFinalOrSource(pr, `editors.${idx}.literal`, r.editors[idx].literal);
      if (editorText) {
        lines.push(`ED  - ${sanitizeRisValue(editorText, r.id, `editors.${idx}`, diagnostics)}`);
      }
    });

    if (r.year) {
      lines.push(`PY  - ${sanitizeRisValue(r.year, r.id, 'year', diagnostics)}`);
    }

    if (r.publisher) {
      const pub = getFinalOrSource(pr, 'publisher', r.publisher);
      if (pub) {
        lines.push(`PB  - ${sanitizeRisValue(pub, r.id, 'publisher', diagnostics)}`);
      }
    }

    if (r.place) {
      const place = getFinalOrSource(pr, 'place', r.place);
      if (place) {
        lines.push(`CY  - ${sanitizeRisValue(place, r.id, 'place', diagnostics)}`);
      }
    }

    if (r.volume) {
      lines.push(`VL  - ${sanitizeRisValue(r.volume, r.id, 'volume', diagnostics)}`);
    }

    if (r.issue) {
      lines.push(`IS  - ${sanitizeRisValue(r.issue, r.id, 'issue', diagnostics)}`);
    }

    if (r.pageStart) {
      lines.push(`SP  - ${sanitizeRisValue(r.pageStart, r.id, 'pageStart', diagnostics)}`);
    }

    if (r.pageEnd) {
      lines.push(`EP  - ${sanitizeRisValue(r.pageEnd, r.id, 'pageEnd', diagnostics)}`);
    }

    if (r.doi) {
      lines.push(`DO  - ${sanitizeRisValue(r.doi, r.id, 'doi', diagnostics)}`);
    }

    if (r.url) {
      lines.push(`UR  - ${sanitizeRisValue(r.url, r.id, 'url', diagnostics)}`);
    }

    const standardNumber = r.isbn || r.issn;
    if (standardNumber) {
      lines.push(`SN  - ${sanitizeRisValue(standardNumber, r.id, 'isbn/issn', diagnostics)}`);
    }

    if (r.notes) {
      lines.push(`N1  - ${sanitizeRisValue(r.notes, r.id, 'notes', diagnostics)}`);
    }

    lines.push('ER  - ');
    risBlocks.push(lines.join('\r\n'));
  }

  const content = risBlocks.length > 0 ? risBlocks.join('\r\n\r\n') + '\r\n' : '';

  return {
    format: 'RIS',
    mode,
    success: true,
    content,
    filename: 'bibliography.ris',
    mimeType: 'application/x-research-info-systems;charset=utf-8',
    exportedRecordIds,
    skippedRecordIds,
    skipReasons,
    diagnostics
  };
}
