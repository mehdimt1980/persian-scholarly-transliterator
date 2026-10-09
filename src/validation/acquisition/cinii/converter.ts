import { normalizePersian } from '../../../domain/normalization';
import type { CiniiEvidenceRecord, Phase8cCandidate } from './types';

export function toPhase8cReviewCandidates(records: CiniiEvidenceRecord[]): Phase8cCandidate[] {
  return records.filter((record) => record.persianTitle && record.languageEvidence.assessment === 'POSITIVE_PERSIAN_EVIDENCE').map((record) => ({ candidateId: `phase8c-candidate-${record.recordId}`, sourceText: record.persianTitle!, normalizedInput: normalizePersian(record.persianTitle!).normalizedInput, reviewStatus: 'REVIEW_PENDING', authority: 'NON_AUTHORITATIVE_BIBLIOGRAPHIC_EVIDENCE', sourceProvider: record.sourceProvider, sourceRecordId: record.sourceRecordId, sourceUrl: record.sourceUrl, observedRomanizations: record.observedRomanizations.map((item) => ({ value: item.value, role: 'BIBLIOGRAPHIC_EVIDENCE_NOT_REFERENCE', probableScheme: 'UNKNOWN' })), provenanceHash: record.contentHash }));
}
