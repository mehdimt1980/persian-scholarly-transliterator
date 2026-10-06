import { LexicalEvidence } from '../types';
import { extractCandidatesFromAlignedEvidence } from './candidateExtractor';
import { alignLexicalEvidence } from './positionalAligner';
import {
  AlignmentResult,
  BatchAlignmentOptions,
  BatchAlignmentResult
} from './types';

/**
 * Orchestrate source-neutral alignment and candidate extraction across a batch of parent evidence records.
 * Truthfully calculates all batch-level telemetry and metrics.
 */
export function processEvidenceAlignmentBatch(
  parentEvidenceList: LexicalEvidence[],
  options?: BatchAlignmentOptions
): BatchAlignmentResult {
  const alignmentResults: AlignmentResult[] = [];
  const derivedEvidence: LexicalEvidence[] = [];
  let unalignedObservationsCount = 0;

  for (const parent of parentEvidenceList) {
    const res = alignLexicalEvidence(parent, options?.alignerOptions);
    alignmentResults.push(res);

    if (res.success) {
      derivedEvidence.push(...res.derivedEvidence);
    } else {
      unalignedObservationsCount++;
    }
  }

  const extraction = extractCandidatesFromAlignedEvidence(
    derivedEvidence,
    options?.candidateOptions
  );

  return {
    parentObservationsCount: parentEvidenceList.length,
    unalignedObservationsCount,
    derivedSegmentsCount: extraction.derivedSegmentsCount,
    eligibleSegmentsCount: extraction.eligibleSegmentsCount,
    contextBoundSegmentsCount: extraction.contextBoundSegmentsCount,
    candidateGroupsCount: extraction.candidateGroupsCount,
    candidates: extraction.candidates,
    derivedEvidence,
    alignmentResults
  };
}
