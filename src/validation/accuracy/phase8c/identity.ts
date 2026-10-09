import crypto from 'node:crypto';
import type { AccuracyCase, AccuracyCorpus, AccuracyManifest, EvaluationSplit } from './types';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}

export function stableJson(value: unknown): string { return JSON.stringify(stable(value)); }
export function sha256(value: unknown): string { return crypto.createHash('sha256').update(stableJson(value), 'utf8').digest('hex'); }
export function deterministicSplit(duplicateGroupId: string): EvaluationSplit { return parseInt(sha256(`phase8c-split-v1:${duplicateGroupId}`).slice(0, 8), 16) % 5 === 0 ? 'LOCKED_EVALUATION' : 'DEVELOPMENT_DIAGNOSTIC'; }
export function corpusSha256(corpus: AccuracyCorpus): string { return sha256({ ...corpus, cases: [...corpus.cases].sort((a, b) => a.id.localeCompare(b.id)) }); }

export function buildManifest(corpus: AccuracyCorpus): AccuracyManifest {
  const splitCounts = { DEVELOPMENT_DIAGNOSTIC: 0, LOCKED_EVALUATION: 0 };
  for (const item of corpus.cases) splitCounts[item.split] += 1;
  return { schemaVersion: 'phase8c-manifest-schema-v1', datasetVersion: corpus.datasetVersion, selectionAlgorithm: 'independent-curation-v1', splitAlgorithm: 'sha256-grouped-phase8c-v1', canonicalization: 'stable-key-order-json-v1', corpusSha256: corpusSha256(corpus), caseCount: corpus.cases.length, reviewedCaseCount: corpus.cases.filter(isScorable).length, splitCounts, sourceIds: corpus.cases.map((item) => item.provenance.sourceId).sort() };
}

export function isScorable(item: AccuracyCase): boolean { return Boolean(item.reference) && (item.review.status === 'INDEPENDENTLY_REVIEWED' || item.review.status === 'ADJUDICATED'); }
export function leakageViolations(cases: AccuracyCase[]): string[] {
  const groups = new Map<string, Set<EvaluationSplit>>();
  for (const item of cases) { const set = groups.get(item.duplicateGroupId) ?? new Set<EvaluationSplit>(); set.add(item.split); groups.set(item.duplicateGroupId, set); }
  return [...groups].filter(([, splits]) => splits.size > 1).map(([group]) => group).sort();
}
