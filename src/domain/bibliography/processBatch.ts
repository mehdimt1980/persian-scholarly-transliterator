import { LexiconRepository } from '../lexicon/repository';
import { processBibliographyRecord } from './processRecord';
import {
  BibliographyBatchSummary,
  BibliographyDiagnostic,
  BibliographyRecord,
  BibliographyReviewDecision,
  ProcessedBibliographyBatch,
  ProcessedBibliographyRecord
} from './types';

export function processBibliographyBatch(
  records: BibliographyRecord[],
  reviewDecisions: BibliographyReviewDecision[] = [],
  lexicon?: LexiconRepository
): ProcessedBibliographyBatch {
  const processedRecords: ProcessedBibliographyRecord[] = [];
  const diagnostics: BibliographyDiagnostic[] = [];

  // 1. Detect duplicate record IDs across batch
  const idCounts = new Map<string, number>();
  for (const r of records) {
    idCounts.set(r.id, (idCounts.get(r.id) ?? 0) + 1);
  }

  const duplicateIds = new Set<string>();
  for (const [id, count] of idCounts.entries()) {
    if (count > 1) {
      duplicateIds.add(id);
      diagnostics.push({
        recordId: id,
        severity: 'ERROR',
        code: 'DUPLICATE_RECORD_ID',
        message: `Duplicate record ID "${id}" detected across batch. Duplicate records are marked INVALID.`
      });
    }
  }

  let readyCount = 0;
  let reviewRequiredCount = 0;
  let invalidCount = 0;

  for (const record of records) {
    const isDuplicate = duplicateIds.has(record.id);

    // If duplicate ID, do not apply any review decisions to prevent authority leakage
    const decisionsToApply = isDuplicate ? [] : reviewDecisions;
    const processed = processBibliographyRecord(record, decisionsToApply, lexicon);

    if (isDuplicate) {
      processed.readiness = 'INVALID';
      processed.invalidReasons.push(`Duplicate record ID "${record.id}" detected across batch.`);
    }

    processedRecords.push(processed);

    if (processed.readiness === 'READY') {
      readyCount++;
    } else if (processed.readiness === 'REVIEW_REQUIRED') {
      reviewRequiredCount++;
    } else if (processed.readiness === 'INVALID') {
      invalidCount++;
      for (const reason of processed.invalidReasons) {
        diagnostics.push({
          recordId: record.id,
          row: record.sourceRowIndex,
          severity: 'ERROR',
          code: 'INVALID_RECORD',
          message: reason
        });
      }
    }
  }

  const summary: BibliographyBatchSummary = {
    total: records.length,
    ready: readyCount,
    reviewRequired: reviewRequiredCount,
    invalid: invalidCount
  };

  return {
    records: processedRecords,
    summary,
    diagnostics
  };
}
