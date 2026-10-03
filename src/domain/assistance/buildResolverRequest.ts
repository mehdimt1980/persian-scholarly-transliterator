import { ReviewIssue } from '../review/types';
import { TransliterationResult } from '../types';
import {
  AssistanceEvidenceRef,
  AssistedResolverRequest,
  BoundedLocalContext,
  OrthographicEvidencePayload
} from './types';

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

  const analysisByToken = new Map(result.analyses.map((a) => [a.tokenIndex, a]));
  const morphologyByToken = new Map(result.morphology.map((m) => [m.tokenIndex, m]));

  const primaryTokenIndex = issue.tokenIndexes[0] ?? 0;
  const secondaryTokenIndex = issue.tokenIndexes[1];
  const tokens = result.tokens;

  // 1. Data Minimization: extract bounded window of ±4 meaningful non-whitespace tokens
  const meaningfulTokens = tokens.filter((t) => t.tokenType !== 'whitespace');
  const targetToken = tokens[primaryTokenIndex];
  const relationTargetToken = secondaryTokenIndex !== undefined ? tokens[secondaryTokenIndex] : undefined;

  const targetIdxInMeaningful = meaningfulTokens.findIndex(
    (t) => t.normalizedStart === targetToken?.normalizedStart && t.normalizedEnd === targetToken?.normalizedEnd
  );

  const startMeaningfulIdx = Math.max(0, (targetIdxInMeaningful >= 0 ? targetIdxInMeaningful : 0) - 4);

  const before: string[] = [];
  if (targetIdxInMeaningful >= 0) {
    for (let i = startMeaningfulIdx; i < targetIdxInMeaningful; i++) {
      before.push(meaningfulTokens[i].normalizedSurface);
    }
  }

  const target = issue.surface;

  const after: string[] = [];
  if (relationTargetToken) {
    const relEndIdxInMeaningful = meaningfulTokens.findIndex(
      (t) =>
        t.normalizedStart === relationTargetToken.normalizedStart &&
        t.normalizedEnd === relationTargetToken.normalizedEnd
    );
    const afterStart = relEndIdxInMeaningful >= 0 ? relEndIdxInMeaningful + 1 : targetIdxInMeaningful + 1;
    const endMeaningfulIdx = Math.min(meaningfulTokens.length, afterStart + 4);
    for (let i = afterStart; i < endMeaningfulIdx; i++) {
      after.push(meaningfulTokens[i].normalizedSurface);
    }
  } else if (targetIdxInMeaningful >= 0) {
    const endMeaningfulIdx = Math.min(meaningfulTokens.length, targetIdxInMeaningful + 5);
    for (let i = targetIdxInMeaningful + 1; i < endMeaningfulIdx; i++) {
      after.push(meaningfulTokens[i].normalizedSurface);
    }
  }

  const localContext: BoundedLocalContext = {
    before,
    target,
    after,
    fullWindow: [...before, `⟦${target}⟧`, ...after].join(' ')
  };

  // 2. Structured Evidence Catalog with stable IDs and kinds
  const evidenceCatalogMap = new Map<string, AssistanceEvidenceRef>();

  function registerEvidence(id: string, kind: AssistanceEvidenceRef['kind'], label: string) {
    if (!evidenceCatalogMap.has(id)) {
      evidenceCatalogMap.set(id, { id, kind, label });
    }
  }

  registerEvidence('context:local-window', 'LOCAL_CONTEXT', 'Bounded local window of surrounding tokens');

  const lexicalSourceMetadata: string[] = [];

  // Register alternatives and lexical sources
  issue.alternatives.forEach((alt) => {
    registerEvidence(alt.id, 'REVIEW_ALTERNATIVE', `Alternative reading: ${alt.label} (${alt.canonical ?? ''})`);
    if (alt.source) {
      const srcId = `source:${alt.source}`;
      registerEvidence(srcId, 'LEXICAL_SOURCE', `Lexical source citation: ${alt.source}`);
      lexicalSourceMetadata.push(alt.source);
    }
  });

  // 3. Structured Orthographic Evidence from TokenAnalysis
  const analysis = analysisByToken.get(primaryTokenIndex);
  const orthographicEvidence: OrthographicEvidencePayload = {
    explicitVowels: (analysis?.explicitVowels ?? []).map((v) => ({
      mark: v.mark,
      vowel: v.vowel,
      afterBaseIndex: v.afterBaseIndex,
      normalizedTokenOffset: v.normalizedTokenOffset,
      relationOnly: v.relationOnly,
      ruleId: v.rule.id
    })),
    unsupportedMarks: (analysis?.unsupportedCombiningMarks ?? []).map((m) => ({
      mark: m.mark,
      afterBaseIndex: m.afterBaseIndex,
      normalizedTokenOffset: m.normalizedTokenOffset,
      ruleId: m.rule.id
    })),
    explicitIzafat: analysis?.explicitIzafat ?? null,
    zwnjBoundaries: analysis?.zwnjBoundaries ?? []
  };

  if (analysis) {
    analysis.explicitVowels.forEach((v) => {
      registerEvidence(`rule:${v.rule.id}`, 'RULE', v.rule.title);
      registerEvidence(
        `orthography:vowel:${v.mark.toLowerCase()}:${v.afterBaseIndex}`,
        'ORTHOGRAPHIC_EVIDENCE',
        `Explicit ${v.mark.toLowerCase()} vowel at base index ${v.afterBaseIndex}`
      );
    });

    analysis.unsupportedCombiningMarks.forEach((m) => {
      registerEvidence(`rule:${m.rule.id}`, 'RULE', m.rule.title);
      registerEvidence(
        `orthography:unsupported:${m.mark}`,
        'ORTHOGRAPHIC_EVIDENCE',
        `Unsupported combining mark ${m.mark}`
      );
    });

    if (analysis.explicitIzafat) {
      registerEvidence(
        `orthography:izafat:${analysis.explicitIzafat}`,
        'ORTHOGRAPHIC_EVIDENCE',
        `Explicit izāfat orthography: ${analysis.explicitIzafat}`
      );
    }

    analysis.provenance.forEach((rule) => {
      registerEvidence(`rule:${rule.id}`, 'RULE', rule.title);
    });
  }

  if (targetToken) {
    targetToken.appliedRules.forEach((rule) => {
      registerEvidence(`rule:${rule.id}`, 'RULE', rule.title);
    });
    targetToken.lexicalSources.forEach((src) => {
      const srcId = `source:${src}`;
      registerEvidence(srcId, 'LEXICAL_SOURCE', `Lexical source citation: ${src}`);
      lexicalSourceMetadata.push(src);
    });
  }

  // 4. Extract relation evidence if applicable
  let relationEvidence: AssistedResolverRequest['relationEvidence'] = undefined;
  if (issue.relationIndex !== undefined) {
    const relation = result.relations[issue.relationIndex];
    if (relation) {
      const srcToken = tokens[relation.sourceTokenIndex];
      const tgtToken = tokens[relation.targetTokenIndex];
      relation.evidence.forEach((ev) => {
        registerEvidence(`relation:${ev.kind}`, 'RELATION_EVIDENCE', `Relation evidence: ${ev.kind} (${ev.source})`);
        registerEvidence(`rule:${ev.rule.id}`, 'RULE', ev.rule.title);
      });
      relationEvidence = {
        source: srcToken?.normalizedSurface ?? '',
        target: tgtToken?.normalizedSurface ?? '',
        relationType: relation.type,
        evidenceKinds: relation.evidence.map((e) => e.kind)
      };
    }
  }

  // 5. Extract morphology evidence if applicable (indexed by tokenIndex, NOT positional array index)
  let morphologyEvidence: AssistedResolverRequest['morphologyEvidence'] = undefined;
  const morph = morphologyByToken.get(primaryTokenIndex);
  if (morph) {
    morph.evidence.forEach((ev) => {
      registerEvidence(`rule:${ev.rule.id}`, 'RULE', ev.rule.title);
    });
    registerEvidence(
      `morphology:${morph.status}`,
      'MORPHOLOGY_EVIDENCE',
      `Morphological analysis status: ${morph.status}`
    );
    if (morph.stemEntry) {
      registerEvidence(
        `morphology:stem:${morph.stemEntry.normalized}`,
        'MORPHOLOGY_EVIDENCE',
        `Morphology stem entry: ${morph.stemEntry.normalized}`
      );
    }
    morphologyEvidence = {
      isSegmented: morph.status === 'CONFIRMED' || morph.status === 'CANDIDATE',
      stem: morph.stemEntry?.surface,
      morphemes: morph.morphemes.map((m) => `${m.type}:${m.normalizedSurface}`),
      warnings: morph.warnings
    };
  }

  const evidenceCatalog = Array.from(evidenceCatalogMap.values()).sort((a, b) => a.id.localeCompare(b.id));
  const allowedEvidenceRefs = evidenceCatalog.map((e) => e.id);

  return {
    issueId: issue.id,
    issueType: issue.type,
    normalizedSurface: issue.surface,
    localContext,
    availableAlternatives: issue.alternatives,
    allowedActions: issue.allowedActions,
    orthographicEvidence,
    morphologyEvidence,
    relationEvidence,
    evidenceCatalog,
    allowedEvidenceRefs,
    lexicalSourceMetadata: Array.from(new Set(lexicalSourceMetadata)).sort(),
    profile: result.profile,
    promptVersion
  };
}
