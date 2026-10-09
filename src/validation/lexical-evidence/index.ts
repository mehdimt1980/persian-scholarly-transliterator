import { normalizePersian } from '../../domain/normalization';
import type { EvidenceRetrievalResult, LexicalCandidate, LexicalCandidateCategory } from './types';

export class LexicalEvidenceIndex {
  constructor(private readonly candidates: readonly LexicalCandidate[]) {}
  search(query: string, options: { category?: LexicalCandidateCategory; reviewedOnly?: boolean } = {}): EvidenceRetrievalResult {
    const normalizedQuery = normalizePersian(query).normalizedInput;
    const matches = this.candidates.filter((candidate) => (candidate.originalPersianForm === query || candidate.normalizedSearchForm === normalizedQuery) && (!options.category || candidate.category === options.category) && (!options.reviewedOnly || candidate.reviewStatus === 'REVIEWED'));
    const citations = [...new Map(matches.flatMap((candidate) => candidate.fieldProvenance).map((citation) => [`${citation.sourceRecordId}:${citation.sourceField}:${citation.observedForm}`, citation])).values()];
    const status = matches.length === 0 ? 'INSUFFICIENT_EVIDENCE' as const : matches.some((candidate) => candidate.evidenceStatus === 'CONFLICTING') ? 'CONFLICTING' as const : matches.every((candidate) => candidate.reviewStatus === 'REVIEWED') ? 'REVIEWED' as const : 'CANDIDATE' as const;
    return { query, normalizedQuery, status, matches: [...matches], citations };
  }
  all(category?: LexicalCandidateCategory): LexicalCandidate[] { return this.candidates.filter((candidate) => !category || candidate.category === category); }
}
