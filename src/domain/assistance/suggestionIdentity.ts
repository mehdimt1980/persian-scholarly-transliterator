import { AssistedCandidateProposal, AssistedResolverRequest } from './types';

export function computeDeterministicFingerprint(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function generateSuggestionId(
  issueId: string,
  provider: string,
  model: string,
  promptVersion: string,
  proposal: AssistedCandidateProposal
): string {
  const specificPayload = [
    proposal.kind,
    proposal.alternativeId ?? '',
    proposal.canonical ?? '',
    proposal.relationDecision ?? '',
    proposal.morphologyBranch ?? ''
  ].join('|');

  const rawIdentity = `${issueId}:${provider}:${model}:${promptVersion}:${specificPayload}`;
  return `sugg:${computeDeterministicFingerprint(rawIdentity)}`;
}

export function computeRequestFingerprint(
  request: AssistedResolverRequest,
  provider: string,
  model: string
): string {
  const altsKey = request.availableAlternatives
    .map((a) => `${a.id}:${a.canonical ?? ''}`)
    .sort()
    .join(';');

  const evidenceKey = request.allowedEvidenceRefs.slice().sort().join(';');
  const contextKey = `${request.localContext.before.join(' ')}|[${request.localContext.target}]|${request.localContext.after.join(' ')}`;

  const raw = [
    request.issueId,
    request.issueType,
    request.normalizedSurface,
    contextKey,
    altsKey,
    evidenceKey,
    request.promptVersion,
    request.profile,
    provider,
    model
  ].join('::');

  return computeDeterministicFingerprint(raw);
}
