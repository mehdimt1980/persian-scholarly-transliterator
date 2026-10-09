import { normalizePersian } from '../../domain/normalization';
import { lexicalCandidateSchema } from './schema';
import type { EvidenceRetrievalResult, LexicalCandidate, LexicalCandidateCategory } from './types';

export class LexicalEvidenceIndex {
  constructor(private readonly candidates: readonly LexicalCandidate[], private readonly verifiedReviewCandidateIds: ReadonlySet<string> = new Set()) {}
  private hasVerifiedReview(candidate: LexicalCandidate): boolean { return lexicalCandidateSchema.safeParse(candidate).success && candidate.reviewStatus === 'REVIEWED' && candidate.authorityStatus === 'HUMAN_REVIEWED' && candidate.evidenceStatus === 'REVIEWED' && Boolean(candidate.reviewEvidence) && this.verifiedReviewCandidateIds.has(candidate.candidateId); }
  search(query: string, options: { category?: LexicalCandidateCategory; reviewedOnly?: boolean } = {}): EvidenceRetrievalResult {
    const normalizedQuery = normalizePersian(query).normalizedInput;
    const matches = this.candidates.filter((candidate) => (candidate.originalPersianForm === query || candidate.normalizedSearchForm === normalizedQuery) && (!options.category || candidate.category === options.category) && (!options.reviewedOnly || this.hasVerifiedReview(candidate)));
    const citations = [...new Map(matches.flatMap((candidate) => candidate.fieldProvenance).map((citation) => [`${citation.sourceRecordId}:${citation.sourceField}:${citation.observedForm}`, citation])).values()];
    const status = matches.length === 0 ? 'INSUFFICIENT_EVIDENCE' as const : matches.some((candidate) => candidate.evidenceStatus === 'CONFLICTING') ? 'CONFLICTING' as const : matches.every((candidate) => this.hasVerifiedReview(candidate)) ? 'REVIEWED' as const : 'CANDIDATE' as const;
    return { query, normalizedQuery, status, matches: [...matches], citations };
  }
  all(category?: LexicalCandidateCategory): LexicalCandidate[] { return this.candidates.filter((candidate) => !category || candidate.category === category); }
}
