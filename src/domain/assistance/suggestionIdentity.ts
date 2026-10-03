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
  let payloadStr = '';
  if (proposal.kind === 'EXISTING_LEXICAL_READING') {
    payloadStr = `EXISTING_LEXICAL_READING:${proposal.alternativeId}:${proposal.canonical ?? ''}`;
  } else if (proposal.kind === 'MANUAL_CANONICAL') {
    payloadStr = `MANUAL_CANONICAL:${proposal.canonical}`;
  } else if (proposal.kind === 'IZAFAT_DECISION') {
    payloadStr = `IZAFAT_DECISION:${proposal.relationDecision}`;
  } else if (proposal.kind === 'MORPHOLOGY_BRANCH') {
    payloadStr = `MORPHOLOGY_BRANCH:${proposal.morphologyBranch}`;
  }

  const rawIdentity = `${issueId}:${provider}:${model}:${promptVersion}:${payloadStr}`;
  return `sugg:${computeDeterministicFingerprint(rawIdentity)}`;
}

export function computeRequestFingerprint(
  request: AssistedResolverRequest,
  provider: string,
  model: string
): string {
  const altsKey = request.availableAlternatives
    .map((a) => `${a.id}:${a.canonical ?? ''}:${a.label}:${a.source ?? ''}`)
    .sort()
    .join(';');

  const allowedActionsKey = request.allowedActions.slice().sort().join(';');

  const vowelsKey = request.orthographicEvidence.explicitVowels
    .map((v) => `${v.mark}:${v.vowel}:${v.afterBaseIndex}:${v.normalizedTokenOffset}:${v.relationOnly}:${v.ruleId}`)
    .sort()
    .join(';');

  const unsupportedMarksKey = request.orthographicEvidence.unsupportedMarks
    .map((m) => `${m.mark}:${m.afterBaseIndex}:${m.normalizedTokenOffset}:${m.ruleId}`)
    .sort()
    .join(';');

  const zwnjKey = request.orthographicEvidence.zwnjBoundaries.slice().sort((a, b) => a - b).join(',');
  const izafatMarkKey = request.orthographicEvidence.explicitIzafat ?? 'none';

  const orthographyKey = `vowels=[${vowelsKey}]|unsupported=[${unsupportedMarksKey}]|izafat=[${izafatMarkKey}]|zwnj=[${zwnjKey}]`;

  const morphKey = request.morphologyEvidence
    ? `segmented=${request.morphologyEvidence.isSegmented}|stem=${request.morphologyEvidence.stem ?? ''}|morphemes=[${request.morphologyEvidence.morphemes.slice().sort().join(',')}]|warnings=[${request.morphologyEvidence.warnings.slice().sort().join(',')}]`
    : 'none';

  const relKey = request.relationEvidence
    ? `src=${request.relationEvidence.source}|tgt=${request.relationEvidence.target}|type=${request.relationEvidence.relationType}|kinds=[${request.relationEvidence.evidenceKinds.slice().sort().join(',')}]`
    : 'none';

  const catalogKey = request.evidenceCatalog
    .map((e) => `${e.id}:${e.kind}:${e.label}`)
    .sort()
    .join(';');

  const allowedRefsKey = request.allowedEvidenceRefs.slice().sort().join(';');
  const lexicalSourcesKey = request.lexicalSourceMetadata.slice().sort().join(';');

  const contextKey = `${request.localContext.before.join(' ')}|[${request.localContext.target}]|${request.localContext.after.join(' ')}|full=[${request.localContext.fullWindow}]`;

  const raw = [
    request.issueId,
    request.issueType,
    request.normalizedSurface,
    contextKey,
    altsKey,
    allowedActionsKey,
    orthographyKey,
    morphKey,
    relKey,
    catalogKey,
    allowedRefsKey,
    lexicalSourcesKey,
    request.promptVersion,
    request.profile,
    provider,
    model
  ].join('::');

  return computeDeterministicFingerprint(raw);
}
