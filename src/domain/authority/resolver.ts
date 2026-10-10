import { RULES } from '../provenance';
import type { NormalizationResult, ProfileId, ReviewDecision, TransliterationResult } from '../types';
import { findPublishedAuthority } from './snapshot';
import type { AuthorityContext, PublishedAuthoritySnapshot } from './types';

export function resolveWithPublishedAuthority(originalInput: string, normalization: NormalizationResult,
  profile: ProfileId, context: AuthorityContext, snapshot: PublishedAuthoritySnapshot,
  reviewDecisions: ReviewDecision[] = []): TransliterationResult | null {
  let entry;
  try {
    entry = findPublishedAuthority(snapshot, originalInput, profile, context, reviewDecisions);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'AMBIGUOUS_PUBLISHED_AUTHORITY') throw error;
    const warning = 'Competing published scholarly authorities require human clarification.';
    return {
      originalInput, normalizedInput: normalization.normalizedInput, normalizationChanges: normalization.changes,
      profile, output: `⟦${normalization.normalizedInput}: ambiguous published authority⟧`, copyable: false,
      status: 'AMBIGUOUS', analyses: [], morphology: [], relations: [], reviewIssues: [], appliedDecisions: [],
      staleDecisions: [], reviewReasons: [], warnings: [warning],
      tokens: [{ normalizedSurface: normalization.normalizedInput, tokenType: 'persian-word',
        canonicalTransliteration: null, rendered: `⟦${normalization.normalizedInput}: ambiguous published authority⟧`,
        status: 'AMBIGUOUS', automaticStatus: 'AMBIGUOUS', automaticCanonical: null, confidence: 0,
        appliedRules: [], lexicalSources: [], warnings: [warning], alternatives: [], normalizedStart: 0,
        normalizedEnd: normalization.normalizedInput.length,
        automatic: { status: 'AMBIGUOUS', canonicalTransliteration: null,
          rendered: `⟦${normalization.normalizedInput}: ambiguous published authority⟧`, confidence: 0,
          appliedRules: [], lexicalSources: [], warnings: [warning], alternatives: [],
          blockingReason: 'LEXICAL_AMBIGUITY' }, blockingReason: 'LEXICAL_AMBIGUITY' }]
    };
  }
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
