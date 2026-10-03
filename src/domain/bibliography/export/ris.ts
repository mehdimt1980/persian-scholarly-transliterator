import { BibliographyDiagnostic, ProcessedBibliographyBatch, ProcessedBibliographyRecord } from '../types';
import { validateRecordForFinalExport } from './validateRecord';
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

export function exportToRis(
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

  for (const { pr, authoritativeValues } of eligibleRecords) {
    const r = pr.record;
    exportedRecordIds.push(r.id);

    const lines: string[] = [];
    lines.push(`TY  - ${mapRecordTypeToRis(r.type)}`);

    const title = authoritativeValues['title'];
    if (title) {
      lines.push(`TI  - ${sanitizeRisValue(title, r.id, 'title', diagnostics)}`);
    }

    if (r.containerTitle) {
      const containerTitle = authoritativeValues['containerTitle'];
      if (containerTitle) {
        lines.push(`T2  - ${sanitizeRisValue(containerTitle, r.id, 'containerTitle', diagnostics)}`);
      }
    }

    // Authors
    r.authors.forEach((_, idx) => {
      const authorText = authoritativeValues[`authors.${idx}.literal`];
      if (authorText) {
        lines.push(`AU  - ${sanitizeRisValue(authorText, r.id, `authors.${idx}`, diagnostics)}`);
      }
    });

    // Editors
    r.editors.forEach((_, idx) => {
      const editorText = authoritativeValues[`editors.${idx}.literal`];
      if (editorText) {
        lines.push(`ED  - ${sanitizeRisValue(editorText, r.id, `editors.${idx}`, diagnostics)}`);
      }
    });

    if (r.year) {
      lines.push(`PY  - ${sanitizeRisValue(r.year, r.id, 'year', diagnostics)}`);
    }

    if (r.publisher) {
      const pub = authoritativeValues['publisher'];
      if (pub) {
        lines.push(`PB  - ${sanitizeRisValue(pub, r.id, 'publisher', diagnostics)}`);
      }
    }

    if (r.place) {
      const place = authoritativeValues['place'];
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

    // Standard numbers: preserve BOTH isbn and issn if present
    if (r.isbn) {
      lines.push(`SN  - ${sanitizeRisValue(r.isbn, r.id, 'isbn', diagnostics)}`);
    }
    if (r.issn) {
      lines.push(`SN  - ${sanitizeRisValue(r.issn, r.id, 'issn', diagnostics)}`);
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
