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

  let readyCount = 0;
  let reviewRequiredCount = 0;
  let invalidCount = 0;

  for (const record of records) {
    const processed = processBibliographyRecord(record, reviewDecisions, lexicon);
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
