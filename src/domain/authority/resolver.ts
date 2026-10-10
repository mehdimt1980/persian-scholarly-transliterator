import { RULES } from '../provenance';
import type { NormalizationResult, ProfileId, ReviewDecision, TransliterationResult } from '../types';
import { findPublishedAuthority } from './snapshot';
import type { AuthorityContext, PublishedAuthoritySnapshot } from './types';

export function resolveWithPublishedAuthority(originalInput: string, normalization: NormalizationResult,
  profile: ProfileId, context: AuthorityContext, snapshot: PublishedAuthoritySnapshot,
  reviewDecisions: ReviewDecision[] = []): TransliterationResult | null {
  const entry = findPublishedAuthority(snapshot, originalInput, profile, context, reviewDecisions);
  if (!entry) return null;
  const authority = {
    kind: 'PUBLISHED_SCHOLARLY_AUTHORITY' as const,
    entryId: entry.entryId, snapshotId: snapshot.snapshotId, version: entry.version,
    reviewEventId: entry.provenance.reviewEventId, publicationEventId: entry.provenance.publicationEventId,
    reviewerRef: entry.provenance.reviewerRef, reviewedAt: entry.provenance.reviewedAt,
    publishedAt: entry.provenance.publishedAt
  };
  const warning = `Resolved from published scholarly authority ${entry.entryId}, version ${entry.version}.`;
  const automatic = {
    status: 'LEXICON_RESOLVED' as const, canonicalTransliteration: entry.canonical,
    rendered: entry.canonical, confidence: 1, appliedRules: [RULES.lexicalResolution],
    lexicalSources: [`Review ${entry.provenance.reviewEventId}; source ${entry.provenance.sourceVersionId}`],
    warnings: [warning], alternatives: []
  };
  return {
    originalInput, normalizedInput: normalization.normalizedInput,
    normalizationChanges: normalization.changes, profile, output: entry.canonical, copyable: true,
    status: 'LEXICON_RESOLVED', analyses: [], morphology: [], relations: [], reviewIssues: [],
    appliedDecisions: [], staleDecisions: [], reviewReasons: [], warnings: [warning], authority,
    tokens: [{ normalizedSurface: normalization.normalizedInput, tokenType: 'persian-word',
      canonicalTransliteration: entry.canonical, rendered: entry.canonical, status: 'LEXICON_RESOLVED',
      automaticStatus: 'LEXICON_RESOLVED', automaticCanonical: entry.canonical, confidence: 1,
      appliedRules: [RULES.lexicalResolution], lexicalSources: automatic.lexicalSources,
      warnings: [warning], alternatives: [], normalizedStart: 0,
      normalizedEnd: normalization.normalizedInput.length, automatic, authority }]
  };
}
