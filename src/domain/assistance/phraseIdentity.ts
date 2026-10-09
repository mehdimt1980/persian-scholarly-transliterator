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

/**
 * V2 identity describes the scholarly reading request, not how that reading is displayed.
 * Legacy fingerprints remain intact for persisted V1 decisions.
 */
function stableReadingPayloadV2(request: PhraseResolverRequest): string {
  const tokenKey = request.tokenEvidence.map((token) => [
    token.index,
    token.surface,
    token.tokenType,
    token.status,
    token.canonicalTransliteration ?? '',
    token.blockingReason ?? '',
    token.alternatives.slice().sort().join(','),
    token.lexicalSources.slice().sort().join(','),
    token.appliedRuleIds.slice().sort().join(',')
  ].join('|')).join(';');
  const issueKey = request.reviewIssues.map((issue) => [
    issue.id,
    issue.type,
    issue.surface,
    issue.tokenIndexes.join(','),
    issue.allowedActions.slice().sort().join(','),
    issue.alternatives.map((alternative) => `${alternative.id}:${alternative.canonical ?? ''}`).sort().join(',')
  ].join('|')).sort().join(';');
  const morphologyKey = request.morphologyEvidence.map((item) => [
    item.tokenIndex, item.surface, item.status, item.lexicalLookupStem, item.hostEnding,
    item.morphemes.slice().sort().join(','), item.warnings.slice().sort().join(',')
  ].join('|')).sort().join(';');
  const relationKey = request.relationEvidence.map((item) => [
    item.sourceTokenIndex, item.targetTokenIndex, item.type, item.status, item.disposition ?? '',
    item.rendering, item.evidenceKinds.slice().sort().join(','), item.warnings.slice().sort().join(',')
  ].join('|')).sort().join(';');
  return [
    'phrase-reading-identity-v2', request.originalInput, request.normalizedInput,
    request.contextKind, request.deterministicStatus, request.deterministicCopyable ? 'copyable' : 'blocked',
    tokenKey, issueKey, morphologyKey, relationKey, request.promptVersion
  ].join('::');
}

function stableReadingPayloadV3(request: PhraseResolverRequest): string {
  const tokenKey = request.tokenEvidence.map((token) => [
    token.index, token.surface, token.tokenType, token.status,
    token.canonicalTransliteration ?? '', token.blockingReason ?? '',
    token.alternatives.slice().sort().join(','),
    token.lexicalSources.slice().sort().join(','),
    token.appliedRuleIds.slice().sort().join(',')
  ].join('|')).join(';');
  const issueKey = request.reviewIssues.map((issue) => [
    issue.id, issue.type, issue.surface, issue.description,
    issue.tokenIndexes.slice().sort((a, b) => a - b).join(','),
    issue.allowedActions.slice().sort().join(','),
    issue.alternatives.map((alternative) => [
      alternative.id, alternative.canonical ?? '', alternative.label, alternative.source ?? ''
    ].join(':')).sort().join(','),
    issue.evidenceSummary ?? ''
  ].join('|')).sort().join(';');
  const morphologyKey = request.morphologyEvidence.map((item) => [
    item.tokenIndex, item.surface, item.status, item.lexicalLookupStem, item.hostEnding,
    item.morphemes.slice().sort().join(','), item.warnings.slice().sort().join(',')
  ].join('|')).sort().join(';');
  const relationKey = request.relationEvidence.map((item) => [
    item.sourceTokenIndex, item.targetTokenIndex, item.source, item.target,
    item.type, item.status, item.disposition ?? '', item.rendering,
    item.evidenceKinds.slice().sort().join(','), item.warnings.slice().sort().join(',')
  ].join('|')).sort().join(';');
  return [
    'phrase-reading-identity-v3', request.originalInput, request.normalizedInput,
    request.contextKind, request.deterministicStatus, request.deterministicCopyable ? 'copyable' : 'blocked',
    tokenKey, issueKey, morphologyKey, relationKey, request.promptVersion
  ].join('::');
}

export function computePhraseReadingFingerprintV2(
  request: PhraseResolverRequest,
  provider: string,
  model: string
): string {
  return computeDeterministicFingerprint(`${stableReadingPayloadV2(request)}::${provider}::${model}`);
}

export function computePhraseReadingFingerprintV3(
  request: PhraseResolverRequest,
  provider: string,
  model: string
): string {
  return computeDeterministicFingerprint(`${stableReadingPayloadV3(request)}::${provider}::${model}`);
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
  result: TransliterationResult,
  contextKind?: PhraseResolverRequest['contextKind']
): PhraseAssistanceApplicability {
  if (result.copyable || result.reviewIssues.length === 0) {
    return {
      applicable: false,
      reason: 'NO_LONGER_REVIEW_REQUIRED'
    };
  }

  const currentRequest = decision.readingIdentityVersion
    ? buildPhraseResolverRequest(result, decision.promptVersion, contextKind)
    : buildPhraseResolverRequest(result, decision.promptVersion);
  const expectedFingerprint = decision.readingIdentityVersion === '3'
    ? computePhraseReadingFingerprintV3(currentRequest, decision.provider, decision.model)
    : decision.readingIdentityVersion === '2'
      ? computePhraseReadingFingerprintV2(currentRequest, decision.provider, decision.model)
      : computePhraseRequestFingerprint(currentRequest, decision.provider, decision.model);

  const storedFingerprint = decision.readingIdentityVersion
    ? decision.readingFingerprint
    : decision.requestFingerprint;
  if (expectedFingerprint !== storedFingerprint) {
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
