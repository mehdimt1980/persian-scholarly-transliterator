import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildPhraseResolverRequest } from '../../../domain/assistance';
import { transliterate } from '../../../domain/engine';
import { diagnoseScholarlyCanonical } from '../../../domain/presentation/policyDiagnostics';
import { renderScholarlyCanonical } from '../../../domain/presentation/render';
import { OpenAiPhraseResolverProvider } from '../../../server/assistance/openaiPhraseProvider';
import { containsSecretMaterial } from './evaluator';
import { corpusSha256 } from './identity';
import { accuracyCorpusSchema } from './schema';
import type { AccuracyCorpus, AccuracyPrediction } from './types';

interface LiveOptions { confirmed: boolean; limit: number; maxRequests: number; retries: number; output?: string; }

export function parseLiveOptions(args: string[]): LiveOptions {
  const readInt = (name: string, fallback: number): number => { const index = args.indexOf(name); const value = index < 0 ? fallback : Number(args[index + 1]); if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`); return value; };
  const outputIndex = args.indexOf('--output');
  return { confirmed: args.includes('--confirm-live'), limit: readInt('--limit', 20), maxRequests: readInt('--max-requests', 20), retries: readInt('--retries', 1), output: outputIndex < 0 ? undefined : args[outputIndex + 1] };
}

export function assertLiveBudget(options: LiveOptions, availableCases: number): number {
  if (!options.confirmed) throw new Error('Live evaluation requires --confirm-live.');
  if (options.limit < 1 || options.maxRequests < 1) throw new Error('Live limit and request budget must be at least 1.');
  if (options.limit > options.maxRequests) throw new Error('--limit cannot exceed --max-requests.');
  if (options.retries > 2) throw new Error('--retries cannot exceed 2.');
  return Math.min(options.limit, availableCases);
}

function classifyFailure(error: unknown): AccuracyPrediction['responseClassification'] { return error instanceof Error && /abort|timeout/iu.test(error.message) ? 'TIMEOUT' : 'PROVIDER_FAILURE'; }
function safeGitSha(): string { try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unavailable'; } }

export async function runLive(args: string[]): Promise<void> {
  const options = parseLiveOptions(args);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.ASSISTED_RESOLVER_MODEL?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for live evaluation.');
  if (!model) throw new Error('ASSISTED_RESOLVER_MODEL is required for live evaluation.');
  const corpusPath = path.join(process.cwd(), 'validation', 'accuracy', 'phase8c', 'corpus.v1.json');
  const corpus = accuracyCorpusSchema.parse(JSON.parse(fs.readFileSync(corpusPath, 'utf8'))) as AccuracyCorpus;
  const count = assertLiveBudget(options, corpus.cases.length);
  const selected = corpus.cases.slice(0, count);
  console.log(`LIVE OpenAI evaluation: model=${model}; cases=${count}; maximum requests=${options.maxRequests}; retries=${options.retries}`);
  const provider = new OpenAiPhraseResolverProvider(apiKey, model);
  const predictions: AccuracyPrediction[] = [];
  let attempts = 0;
  for (const item of selected) {
    const deterministic = transliterate(item.originalPersian, item.contextKind === 'BOOK_OR_ARTICLE_TITLE' ? 'ijmes_citation_title' : 'ijmes_full');
    const request = buildPhraseResolverRequest(deterministic, undefined, item.contextKind);
    const started = Date.now();
    let lastError: unknown = new Error('Request budget exhausted before this case could be attempted.');
    for (let retry = 0; retry <= options.retries && attempts < options.maxRequests; retry += 1) {
      attempts += 1;
      try {
        const resolution = await provider.resolve(request);
        const canonical = resolution.scholarlyCanonical;
        const full = canonical ? renderScholarlyCanonical(canonical, { id: 'full_scholarly_v1' }, { contentCategory: item.contentCategory }) : null;
        const publication = canonical ? renderScholarlyCanonical(canonical, { id: 'ijmes_publication_v1' }, { contentCategory: item.contentCategory }) : null;
        const policy = canonical ? diagnoseScholarlyCanonical({ canonical, contentCategory: item.contentCategory }) : null;
        predictions.push({ caseId: item.id, provider: resolution.provider, model: resolution.model, promptVersion: resolution.promptVersion, responseClassification: resolution.disposition, validationPassed: true, validationErrors: [], canonicalProposal: canonical, renderedFull: full?.output ?? null, renderedIjmesPublication: publication?.output ?? null, tokenReadings: resolution.tokenReadings.map(({ tokenIndex, surface, canonical: tokenCanonical }) => ({ tokenIndex, surface, canonical: tokenCanonical })), predictedFeatures: [], warnings: resolution.warnings ?? [], assumptions: resolution.assumptions, errorCategories: resolution.disposition === 'REVIEW_REQUIRED' ? ['MODEL_UNCERTAINTY'] : [], validatorSignals: (policy?.diagnostics ?? []).map((diagnostic) => ({ layer: 'IJMES_POLICY' as const, severity: diagnostic.severity })), durationMs: Date.now() - started, resolution });
        lastError = undefined;
        break;
      } catch (error) { lastError = error; }
    }
    if (lastError) predictions.push({ caseId: item.id, provider: 'openai', model, promptVersion: request.promptVersion, responseClassification: classifyFailure(lastError), validationPassed: false, validationErrors: [lastError instanceof Error ? lastError.message : String(lastError)], canonicalProposal: null, renderedFull: null, renderedIjmesPublication: null, tokenReadings: [], predictedFeatures: [], warnings: [], assumptions: [], errorCategories: ['OTHER'], validatorSignals: [], durationMs: Date.now() - started });
  }
  const timestamp = new Date().toISOString();
  const artifact = { schemaVersion: 'phase8c-live-run-v1', runId: `phase8c-${timestamp.replace(/\W/gu, '')}`, timestamp, gitCommitSha: safeGitSha(), corpusVersion: corpus.datasetVersion, corpusSha256: corpusSha256(corpus), provider: 'openai', model, promptVersion: predictions[0]?.promptVersion ?? 'unavailable', requestIdentityVersion: '3', validationPolicyVersion: 'ijmes-canonical-diagnostics-v1', rendererPolicyVersion: 'phase8b-presentation-profiles-v1', inputCaseIds: selected.map((item) => item.id), attempts, requestBudget: options.maxRequests, usage: 'unavailable', costEstimate: 'unavailable', predictions };
  if (containsSecretMaterial(artifact)) throw new Error('Refusing to write an artifact containing secret-like material.');
  const output = options.output ? path.resolve(options.output) : path.join(process.cwd(), 'validation', 'accuracy', 'phase8c', 'runs', `${artifact.runId}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(`Wrote uncommitted live artifact: ${output}`);
}

if (require.main === module) runLive(process.argv.slice(2)).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
