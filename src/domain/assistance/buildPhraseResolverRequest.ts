import type { ProfileId, TransliterationResult } from '../types';
import type {
  PhraseContextKind,
  PhraseResolverRequest
} from './phraseTypes';

export const CURRENT_PHRASE_RESOLVER_PROMPT_VERSION = 'phrase-resolver-v2';

export function phraseContextKindForProfile(profile: ProfileId): PhraseContextKind {
  return profile === 'ijmes_citation_title' ? 'BOOK_OR_ARTICLE_TITLE' : 'GENERAL_SCHOLARLY_TEXT';
}

export function buildPhraseResolverRequest(
  result: TransliterationResult,
  promptVersion: string = CURRENT_PHRASE_RESOLVER_PROMPT_VERSION
): PhraseResolverRequest {
  const meaningfulTokens = result.tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.tokenType !== 'whitespace');

  return {
    originalInput: result.originalInput,
    normalizedInput: result.normalizedInput,
    profile: result.profile,
    contextKind: phraseContextKindForProfile(result.profile),
    deterministicStatus: result.status,
    deterministicCopyable: result.copyable,
    deterministicOutput: result.output,
    tokenEvidence: meaningfulTokens.map(({ token, index }) => ({
      index,
      surface: token.normalizedSurface,
      tokenType: token.tokenType,
      status: token.status,
      canonicalTransliteration: token.canonicalTransliteration,
      rendered: token.rendered,
      blockingReason: token.blockingReason,
      alternatives: [...token.alternatives],
      lexicalSources: [...token.lexicalSources],
      appliedRuleIds: token.appliedRules.map((rule) => rule.id)
    })),
    reviewIssues: result.reviewIssues.map((issue) => ({
      id: issue.id,
      type: issue.type,
      surface: issue.surface,
      description: issue.description,
      tokenIndexes: [...issue.tokenIndexes],
      allowedActions: [...issue.allowedActions],
      alternatives: issue.alternatives.map((alternative) => ({
        id: alternative.id,
        label: alternative.label,
        canonical: alternative.canonical,
        source: alternative.source
      })),
      evidenceSummary: issue.evidenceSummary
    })),
    morphologyEvidence: result.morphology.map((analysis) => ({
      tokenIndex: analysis.tokenIndex,
      surface: analysis.normalizedSurface,
      status: analysis.status,
      lexicalLookupStem: analysis.lexicalLookupStem,
      hostEnding: analysis.hostEnding,
      morphemes: analysis.morphemes.map(
        (morpheme) => `${morpheme.type}:${morpheme.normalizedSurface}${morpheme.canonicalRendering ? `:${morpheme.canonicalRendering}` : ''}`
      ),
      warnings: [...analysis.warnings]
    })),
    relationEvidence: result.relations.map((relation) => ({
      sourceTokenIndex: relation.sourceTokenIndex,
      targetTokenIndex: relation.targetTokenIndex,
      source: result.tokens[relation.sourceTokenIndex]?.normalizedSurface ?? '',
      target: result.tokens[relation.targetTokenIndex]?.normalizedSurface ?? '',
      type: relation.type,
      status: relation.status,
      disposition: relation.disposition,
      rendering: relation.rendering,
      evidenceKinds: relation.evidence.map((evidence) => evidence.kind),
      warnings: [...relation.warnings]
    })),
    promptVersion
  };
}
