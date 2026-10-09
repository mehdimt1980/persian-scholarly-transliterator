import fs from 'node:fs';
import path from 'node:path';
import { normalizePersian } from '../../../domain/normalization';
import { evaluateAccuracy } from './evaluator';
import { buildManifest, deterministicSplit, leakageViolations, stableJson } from './identity';
import { accuracyCorpusSchema, accuracyManifestSchema } from './schema';
import type { AccuracyCorpus, AccuracyManifest, AccuracyPrediction } from './types';

const root = process.cwd();
const asset = (...segments: string[]) => path.join(root, 'validation', 'accuracy', 'phase8c', ...segments);
const reportPath = path.join(root, 'src', 'validation', 'reports', 'phase8c-offline-framework-summary.json');

function loadJson<T>(file: string): T { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; }

export function validatePhase8cCorpus(corpusInput: unknown, manifestInput: unknown): string[] {
  const errors: string[] = [];
  const parsed = accuracyCorpusSchema.safeParse(corpusInput);
  const parsedManifest = accuracyManifestSchema.safeParse(manifestInput);
  if (!parsed.success) errors.push(...parsed.error.errors.map((error) => `${error.path.join('.')}: ${error.message}`));
  if (!parsedManifest.success) errors.push(...parsedManifest.error.errors.map((error) => `manifest.${error.path.join('.')}: ${error.message}`));
  if (!parsed.success || !parsedManifest.success) return errors;
  const corpus = parsed.data as AccuracyCorpus;
  const manifest = parsedManifest.data as AccuracyManifest;
  const ids = corpus.cases.map((item) => item.id);
  if (new Set(ids).size !== ids.length) errors.push('Case IDs must be unique.');
  for (const item of corpus.cases) {
    if (normalizePersian(item.originalPersian).normalizedInput !== item.normalizedInput) errors.push(`${item.id}: normalizedInput does not match normalizePersian.`);
    if (deterministicSplit(item.duplicateGroupId) !== item.split) errors.push(`${item.id}: split does not match deterministic group split.`);
  }
  for (const group of leakageViolations(corpus.cases)) errors.push(`Duplicate group crosses evaluation splits: ${group}`);
  const expected = buildManifest(corpus);
  if (stableJson(expected) !== stableJson(manifest)) errors.push(`Manifest mismatch. Expected corpus SHA-256 ${expected.corpusSha256}.`);
  return errors;
}

export function runOfflineEvaluation(): ReturnType<typeof evaluateAccuracy> {
  const corpus = loadJson<AccuracyCorpus>(asset('corpus.v1.json'));
  const manifest = loadJson<AccuracyManifest>(asset('manifest.v1.json'));
  const errors = validatePhase8cCorpus(corpus, manifest);
  if (errors.length) throw new Error(`Phase 8C corpus integrity failed:\n${errors.join('\n')}`);

  const fixture = loadJson<{ fixtureLabel: string; corpus: AccuracyCorpus; predictions: AccuracyPrediction[] }>(asset('offline-fixture.v1.json'));
  if (!fixture.fixtureLabel.startsWith('SYNTHETIC')) throw new Error('Offline fixture must be explicitly labeled synthetic.');
  const fixtureValidation = accuracyCorpusSchema.safeParse(fixture.corpus);
  if (!fixtureValidation.success) throw new Error(fixtureValidation.error.message);
  const report = evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: fixture.predictions });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

function main(): void {
  const report = runOfflineEvaluation();
  console.log('=== Phase 8C Offline Evaluation Framework ===');
  console.log('Mode: SYNTHETIC/MOCKED — NOT REAL MODEL ACCURACY');
  console.log(`Authentic pilot: 2 cases; independently reviewed: 0`);
  console.log(`Synthetic evaluator cases: ${report.totalCases}; scored: ${report.reviewedCases}`);
  console.log(`Report: ${path.relative(root, reportPath)}`);
}

if (require.main === module) main();
