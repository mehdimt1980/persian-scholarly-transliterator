import { normalizePersian } from '../../domain/normalization';
import { LexicalEvidenceIndex } from '../../validation/lexical-evidence/index';
import type { EvidenceProvider, EvidenceRetrievalResult, LexicalCandidateCategory } from '../../validation/lexical-evidence/types';
import type { EvidenceRepository } from './types';
export async function searchActiveEvidence(repository: EvidenceRepository, query: string, options: { category?: LexicalCandidateCategory; provider?: EvidenceProvider; reviewedOnly?: boolean; limit?: number } = {}): Promise<EvidenceRetrievalResult> { const limit = options.limit ?? 25; if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Evidence query limit must be 1..100'); const state = await repository.readState(); if (!state.activeSnapshotId) return new LexicalEvidenceIndex([]).search(query, options); const normalized = normalizePersian(query).normalizedInput; const bounded = [...state.candidates.values()].filter((item) => item.snapshotId === state.activeSnapshotId && (item.candidate.originalPersianForm === query || item.candidate.normalizedSearchForm === normalized) && (!options.category || item.candidate.category === options.category) && (!options.provider || item.candidate.providerEvidence?.some((evidence) => evidence.provider === options.provider))).slice(0, limit).map((item) => item.candidate); return new LexicalEvidenceIndex(bounded).search(query, options); }

export interface PersistedEvidenceReader {
  activeCandidates(query: string, normalized: string, options: { category?: LexicalCandidateCategory; provider?: EvidenceProvider; limit: number }): Promise<ReturnType<LexicalEvidenceIndex['all']>>;
}

export async function searchPersistedEvidence(reader: PersistedEvidenceReader, query: string, options: { category?: LexicalCandidateCategory; provider?: EvidenceProvider; reviewedOnly?: boolean; limit?: number } = {}): Promise<EvidenceRetrievalResult> {
  const limit = options.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Evidence query limit must be 1..100');
  const normalized = normalizePersian(query).normalizedInput;
  const candidates = await reader.activeCandidates(query, normalized, { category: options.category, provider: options.provider, limit });
  return new LexicalEvidenceIndex(candidates).search(query, options);
}
