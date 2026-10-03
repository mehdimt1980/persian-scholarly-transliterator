import { ReviewIssue } from '../review/types';
import { TransliterationResult } from '../types';
import { AssistedResolverRequest, BoundedLocalContext } from './types';

export const CURRENT_RESOLVER_PROMPT_VERSION = 'assisted-resolver-v1';

export function buildResolverRequest(
  result: TransliterationResult,
  issueId: string,
  promptVersion: string = CURRENT_RESOLVER_PROMPT_VERSION
): AssistedResolverRequest | null {
  const issue = result.reviewIssues.find((i) => i.id === issueId);
  if (!issue) {
    return null;
  }

  const primaryTokenIndex = issue.tokenIndexes[0] ?? 0;
  const tokens = result.tokens;

  // 1. Data Minimization: extract bounded window of ±4 tokens surrounding target issue
  const startIdx = Math.max(0, primaryTokenIndex - 4);
  const endIdx = Math.min(tokens.length, primaryTokenIndex + 5);

  const before: string[] = [];
  for (let i = startIdx; i < primaryTokenIndex; i++) {
    before.push(tokens[i].normalizedSurface);
  }

  const target = issue.surface;

  const after: string[] = [];
  for (let i = primaryTokenIndex + 1; i < endIdx; i++) {
    after.push(tokens[i].normalizedSurface);
  }

  const localContext: BoundedLocalContext = {
    before,
    target,
    after,
    fullWindow: [...before, `⟦${target}⟧`, ...after].join(' ')
  };

  // 2. Extract allowed evidence references and source metadata
  const allowedEvidenceRefs = new Set<string>([
    'SOURCE_ORTHOGRAPHY',
    'PERSIAN_GRAMMAR',
    'IJMES_STANDARDS',
    'CONTEXTUAL_EVALUATION'
  ]);

  const lexicalSourceMetadata: string[] = [];
  issue.alternatives.forEach((alt) => {
    allowedEvidenceRefs.add(alt.id);
    if (alt.canonical) allowedEvidenceRefs.add(alt.canonical);
    if (alt.source) {
      allowedEvidenceRefs.add(alt.source);
      lexicalSourceMetadata.push(alt.source);
    }
  });

  const targetToken = tokens[primaryTokenIndex];
  if (targetToken) {
    targetToken.appliedRules.forEach((rule) => {
      allowedEvidenceRefs.add(rule.id);
    });
    targetToken.lexicalSources.forEach((src) => {
      allowedEvidenceRefs.add(src);
      lexicalSourceMetadata.push(src);
    });
  }

  const combiningMarks = targetToken?.appliedRules
    .filter((r) => r.id.startsWith('DIACRITIC') || r.id.startsWith('VOWEL'))
    .map((r) => r.title || r.id) ?? [];

  const unsupportedMarks = targetToken?.warnings
    .filter((w) => w.includes('combining mark') || w.includes('shadda')) ?? [];

  // 3. Extract relation evidence if applicable
  let relationEvidence: AssistedResolverRequest['relationEvidence'] = undefined;
  if (issue.relationIndex !== undefined) {
    const relation = result.relations[issue.relationIndex];
    if (relation) {
      const srcToken = tokens[relation.sourceTokenIndex];
      const tgtToken = tokens[relation.targetTokenIndex];
      relation.evidence.forEach((ev) => {
        allowedEvidenceRefs.add(ev.kind);
        allowedEvidenceRefs.add(ev.rule.id);
        allowedEvidenceRefs.add(ev.source);
      });
      relationEvidence = {
        source: srcToken?.normalizedSurface ?? '',
        target: tgtToken?.normalizedSurface ?? '',
        relationType: relation.type,
        evidenceKinds: relation.evidence.map((e) => e.kind)
      };
    }
  }

  // 4. Extract morphology evidence if applicable
  let morphologyEvidence: AssistedResolverRequest['morphologyEvidence'] = undefined;
  if (issue.morphologyIndex !== undefined) {
    const morph = result.morphology[issue.morphologyIndex];
    if (morph) {
      morph.evidence.forEach((ev) => {
        allowedEvidenceRefs.add(ev.rule.id);
        if (ev.description) allowedEvidenceRefs.add(ev.description);
      });
      morph.warnings.forEach((w) => allowedEvidenceRefs.add(w));
      morphologyEvidence = {
        isSegmented: morph.status === 'CONFIRMED' || morph.status === 'CANDIDATE',
        stem: morph.stemEntry?.surface,
        morphemes: morph.morphemes.map((m) => `${m.type}:${m.normalizedSurface}`),
        warnings: morph.warnings
      };
    }
  }

  return {
    issueId: issue.id,
    issueType: issue.type,
    normalizedSurface: issue.surface,
    localContext,
    availableAlternatives: issue.alternatives,
    orthographicEvidence: {
      combiningMarks,
      unsupportedMarks
    },
    morphologyEvidence,
    relationEvidence,
    lexicalSourceMetadata: Array.from(new Set(lexicalSourceMetadata)),
    profile: result.profile,
    allowedEvidenceRefs: Array.from(allowedEvidenceRefs),
    promptVersion
  };
}
