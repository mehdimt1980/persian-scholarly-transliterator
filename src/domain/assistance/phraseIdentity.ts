import type { TransliterationResult } from '../types';
import { buildPhraseResolverRequest } from './buildPhraseResolverRequest';
import { computeDeterministicFingerprint } from './suggestionIdentity';
import type {
  AcceptedPhraseDecision,
  PhraseAssistanceApplicability,
  PhraseResolverRequest
} from './phraseTypes';

function stablePhraseRequestPayload(request: PhraseResolverRequest): string {
  const tokenKey = request.tokenEvidence
    .map((token) => [
      token.index,
      token.surface,
      token.tokenType,
      token.status,
      token.canonicalTransliteration ?? '',
      token.rendered,
      token.blockingReason ?? '',
      token.alternatives.slice().sort().join(','),
      token.lexicalSources.slice().sort().join(','),
      token.appliedRuleIds.slice().sort().join(',')
    ].join('|'))
    .join(';');

  const issueKey = request.reviewIssues
    .map((issue) => [
      issue.id,
      issue.type,
      issue.surface,
      issue.description,
      issue.tokenIndexes.join(','),
      issue.allowedActions.slice().sort().join(','),
      issue.alternatives
        .map((alternative) => `${alternative.id}:${alternative.canonical ?? ''}:${alternative.label}:${alternative.source ?? ''}`)
        .sort()
        .join(','),
      issue.evidenceSummary ?? ''
    ].join('|'))
    .sort()
    .join(';');

  const morphologyKey = request.morphologyEvidence
    .map((item) => [
      item.tokenIndex,
      item.surface,
      item.status,
      item.lexicalLookupStem,
      item.hostEnding,
      item.morphemes.slice().sort().join(','),
      item.warnings.slice().sort().join(',')
    ].join('|'))
    .sort()
    .join(';');

  const relationKey = request.relationEvidence
    .map((item) => [
      item.sourceTokenIndex,
      item.targetTokenIndex,
      item.source,
      item.target,
      item.type,
      item.status,
      item.disposition ?? '',
      item.rendering,
      item.evidenceKinds.slice().sort().join(','),
      item.warnings.slice().sort().join(',')
    ].join('|'))
    .sort()
    .join(';');

  return [
    request.originalInput,
    request.normalizedInput,
    request.profile,
    request.contextKind,
    request.deterministicStatus,
    request.deterministicCopyable ? 'copyable' : 'blocked',
    request.deterministicOutput,
    tokenKey,
    issueKey,
    morphologyKey,
    relationKey,
    request.promptVersion
  ].join('::');
}

export function computePhraseRequestFingerprint(
  request: PhraseResolverRequest,
  provider: string,
  model: string
): string {
  return computeDeterministicFingerprint(
    `${stablePhraseRequestPayload(request)}::${provider}::${model}`
  );
}

export function checkAcceptedPhraseApplicability(
  decision: AcceptedPhraseDecision,
  result: TransliterationResult
): PhraseAssistanceApplicability {
  if (result.copyable || result.reviewIssues.length === 0) {
    return {
      applicable: false,
      reason: 'NO_LONGER_REVIEW_REQUIRED'
    };
  }

  const currentRequest = buildPhraseResolverRequest(result, decision.promptVersion);
  const expectedFingerprint = computePhraseRequestFingerprint(
    currentRequest,
    decision.provider,
    decision.model
  );

  if (expectedFingerprint !== decision.requestFingerprint) {
    return {
      applicable: false,
      reason: 'REQUEST_CHANGED',
      expectedFingerprint
    };
  }

  return {
    applicable: true,
    expectedFingerprint
  };
}
