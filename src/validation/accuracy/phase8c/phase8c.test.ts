import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateAccuracy, canonicalNormalization, containsSecretMaterial } from './evaluator';
import { buildManifest, deterministicSplit, leakageViolations, stableJson } from './identity';
import { assertLiveBudget, parseLiveOptions, runLive } from './liveCli';
import { validatePhase8cCorpus } from './offlineCli';
import { accuracyCaseSchema, accuracyCorpusSchema } from './schema';
import { proportion } from './statistics';
import type { AccuracyCorpus, AccuracyManifest, AccuracyPrediction } from './types';

const assets = path.join(process.cwd(), 'validation', 'accuracy', 'phase8c');
const corpus = JSON.parse(fs.readFileSync(path.join(assets, 'corpus.v1.json'), 'utf8')) as AccuracyCorpus;
const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'manifest.v1.json'), 'utf8')) as AccuracyManifest;
const fixture = JSON.parse(fs.readFileSync(path.join(assets, 'offline-fixture.v1.json'), 'utf8')) as { corpus: AccuracyCorpus; predictions: AccuracyPrediction[] };

describe('Phase 8C corpus integrity and authority', () => {
  it('preserves schema, source references, normalization, manifest identity, and exact source IDs', () => {
    expect(accuracyCorpusSchema.parse(corpus)).toEqual(corpus);
    expect(validatePhase8cCorpus(corpus, manifest)).toEqual([]);
    expect(buildManifest(corpus)).toEqual(manifest);
    expect(manifest.sourceIds).toEqual(['phase8c-user-observation-a', 'phase8c-user-observation-b']);
  });

  it('uses stable group splits and detects duplicate leakage', () => {
    expect(deterministicSplit('user-observed-sedaye-pa')).toBe('DEVELOPMENT_DIAGNOSTIC');
    expect(deterministicSplit('user-observed-sedaye-pa')).toBe(deterministicSplit('user-observed-sedaye-pa'));
    expect(leakageViolations([{ ...corpus.cases[0], split: 'DEVELOPMENT_DIAGNOSTIC' }, { ...corpus.cases[1], split: 'LOCKED_EVALUATION' }])).toEqual(['user-observed-sedaye-pa']);
  });

  it('requires references for reviewed cases and forbids them for unreviewed cases', () => {
    expect(accuracyCaseSchema.safeParse({ ...corpus.cases[0], review: { status: 'INDEPENDENTLY_REVIEWED', reviewerId: 'r', reviewedAt: '2026-01-01' } }).success).toBe(false);
    expect(accuracyCaseSchema.safeParse({ ...fixture.corpus.cases[0], review: { status: 'UNREVIEWED' } }).success).toBe(false);
  });

  it('keeps diagnostic observations explicitly non-gold', () => {
    expect(corpus.cases.every((item) => item.reference === null && item.review.status === 'UNREVIEWED')).toBe(true);
    expect(corpus.cases.every((item) => item.diagnosticObservation?.disclaimer.includes('not adjudicated'))).toBe(true);
  });
});

describe('Phase 8C evaluator', () => {
  it('supports exact and accepted-alternative readings with correct denominators', () => {
    const report = evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: fixture.predictions });
    expect(report.totalCases).toBe(3);
    expect(report.reviewedCases).toBe(2);
    expect(report.caseFlow).toMatchObject({ unreviewedExcluded: 1, eligibleReferenceCases: 2, successfullyEvaluated: 2 });
    expect(report.exclusions).toHaveLength(1);
    expect(report.predictionFailures).toHaveLength(0);
    expect(report.phrase.exact).toMatchObject({ numerator: 1, denominator: 2, percent: 50 });
    expect(report.phrase.acceptedAlternative).toMatchObject({ numerator: 2, denominator: 2, percent: 100 });
    expect(report.tokens).toMatchObject({ eligibleReferenceTokens: 4, correct: 4, incorrect: 0, unalignable: 0 });
    expect(report.tokens.conditionalAccuracy).toMatchObject({ numerator: 4, denominator: 4 });
    expect(report.tokens.endToEndSuccess).toMatchObject({ numerator: 4, denominator: 4 });
    expect(report.features.IZAFAT_REALIZATION.correct).toBe(1);
    expect(report.features.SHORT_VOWEL.correct).toBe(1);
  });

  it('separates NFC normalization from case differences and preserves meaningful marks', () => {
    expect(canonicalNormalization('  a\u0304  b ')).toBe('ā b');
    expect(canonicalNormalization('ā')).not.toBe(canonicalNormalization('a'));
    const changed = structuredClone(fixture.predictions);
    changed[0].canonicalProposal = 'NAMŪNA-YI YAK';
    const report = evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: changed });
    expect(report.phrase.exact.numerator).toBe(0);
    expect(report.phrase.caseOnlyDifference).toBe(1);
  });

  it('retains missing predictions and unalignable tokens in denominators', () => {
    const report = evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: [fixture.predictions[0]] });
    expect(report.caseFlow.missingPredictions).toBe(1);
    expect(report.predictionFailures).toEqual([{ caseId: 'p8c-synthetic-alternative', kind: 'MISSING_PREDICTION', reason: 'No prediction was supplied.' }]);
    expect(report.exclusions).toHaveLength(1);
    expect(report.phrase.exact.denominator).toBe(2);
    expect(report.tokens.conditionalAccuracy).toMatchObject({ numerator: 2, denominator: 2, percent: 100 });
    expect(report.tokens.endToEndSuccess).toMatchObject({ numerator: 2, denominator: 4, percent: 50 });
    expect(report.tokens.unsuccessfulFromMissingOrFailedPredictions).toBe(2);
    const bad = structuredClone(fixture.predictions);
    bad[0].tokenReadings[0].surface = 'different';
    const tokenReport = evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: bad });
    expect(tokenReport.tokens.unalignable).toBe(1);
    expect(tokenReport.tokens.conditionalAccuracy.denominator).toBe(3);
    expect(tokenReport.tokens.endToEndSuccess.denominator).toBe(4);
    expect(tokenReport.caseFlow.unalignablePredictions).toBe(1);
  });

  it('accounts for provider failures and timeouts as scored-case failures', () => {
    const failed = structuredClone(fixture.predictions);
    failed[1] = { ...failed[1], responseClassification: 'TIMEOUT', validationPassed: false, validationErrors: ['timeout'], canonicalProposal: null, renderedFull: null, renderedIjmesPublication: null, tokenReadings: [] };
    const report = evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: failed });
    expect(report.caseFlow).toMatchObject({ timeouts: 1, successfullyEvaluated: 1 });
    expect(report.phrase.acceptedAlternative.denominator).toBe(2);
    expect(report.correctionProxy.completeReanalysisCases).toBe(1);
  });

  it('classifies error taxonomy and validator precision/recall by layer', () => {
    const changed = structuredClone(fixture.predictions);
    const changedCorpus = structuredClone(fixture.corpus);
    changed[0].errorCategories = ['SHORT_VOWEL_ERROR', 'VALIDATOR_FALSE_NEGATIVE'];
    changedCorpus.cases[0].reference!.validatorGroundTruth!.structuralError = true;
    changed[1].validatorSignals.push({ layer: 'STRUCTURAL', severity: 'BLOCK' });
    const report = evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: changedCorpus, predictions: changed });
    expect(report.errors.SHORT_VOWEL_ERROR).toBe(1);
    expect(report.validator.STRUCTURAL).toMatchObject({ missedErrors: 1, falseWarnings: 1 });
    expect(report.validator.STRUCTURAL.precision.denominator).toBe(1);
    expect(report.validator.STRUCTURAL.recall.denominator).toBe(1);
  });

  it('takes validator truth only from reviewed references and rejects fabricated prediction truth', () => {
    const report = evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: fixture.predictions });
    expect(report.validator.LINGUISTIC_REVIEW).toMatchObject({ outcome: 'MEASURABLE', trueDetectedErrors: 1, correctUnflagged: 1 });
    const fabricated = structuredClone(fixture.predictions) as unknown as Array<Record<string, unknown>>;
    fabricated[0].validatorGroundTruth = { structuralError: true };
    expect(() => evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: fabricated as unknown as AccuracyPrediction[] })).toThrow();
  });

  it('reports missing or disputed validator truth as NOT_MEASURABLE', () => {
    const changedCorpus = structuredClone(fixture.corpus);
    changedCorpus.cases[0].reference!.validatorGroundTruth = null;
    changedCorpus.cases[1].reference!.validatorGroundTruth = null;
    const report = evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: changedCorpus, predictions: fixture.predictions });
    expect(report.validator.STRUCTURAL).toMatchObject({ outcome: 'NOT_MEASURABLE', uncertain: 2 });
    expect(report.validator.STRUCTURAL.precision.percent).toBeNull();
  });

  it('rejects duplicate prediction IDs, unknown cases, and malformed feature labels', () => {
    expect(() => evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: [fixture.predictions[0], fixture.predictions[0]] })).toThrow('Duplicate prediction case ID');
    expect(() => evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: [{ ...fixture.predictions[0], caseId: 'unknown' }] })).toThrow('unknown case ID');
    const malformed = structuredClone(fixture.predictions);
    malformed[0].predictedFeatures[0].referenceFeatureId = 'nonexistent';
    expect(() => evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: malformed })).toThrow('Unknown reference feature ID');
    const malformedTaxonomy = structuredClone(fixture.predictions) as unknown as Array<Record<string, unknown>>;
    malformedTaxonomy[0].errorCategories = ['MADE_UP_ERROR'];
    expect(() => evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: malformedTaxonomy as unknown as AccuracyPrediction[] })).toThrow();
  });

  it('excludes unreviewed cases from all primary and validator denominators', () => {
    const report = evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus, predictions: [] });
    expect(report.caseFlow).toMatchObject({ unreviewedExcluded: 2, eligibleReferenceCases: 0 });
    expect(report.phrase.endToEndSuccess.denominator).toBe(0);
    expect(report.validator.STRUCTURAL).toMatchObject({ outcome: 'NOT_MEASURABLE', uncertain: 0 });
    expect(report.exclusions).toHaveLength(2);
  });

  it('calculates known Wilson intervals and zero-denominator nulls', () => {
    expect(proportion(0, 0)).toEqual({ numerator: 0, denominator: 0, percent: null, wilson95: null });
    const interval = proportion(5, 10).wilson95!;
    expect(interval.low).toBeCloseTo(23.659, 2);
    expect(interval.high).toBeCloseTo(76.341, 2);
  });

  it('is byte-reproducible for repeated offline evaluation', () => {
    const first = evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: fixture.predictions });
    const second = evaluateAccuracy({ runKind: 'OFFLINE_MOCKED', corpus: fixture.corpus, predictions: fixture.predictions });
    expect(stableJson(first)).toBe(stableJson(second));
  });
});

describe('live-run isolation and safety', () => {
  it('does not require secrets for the offline corpus or mocked evaluator', () => {
    expect(containsSecretMaterial({ corpus, fixture })).toBe(false);
  });

  it('requires explicit confirmation and enforces budget/retry limits before calls', () => {
    expect(() => assertLiveBudget(parseLiveOptions(['--limit', '2']), 2)).toThrow('--confirm-live');
    expect(() => assertLiveBudget(parseLiveOptions(['--confirm-live', '--limit', '3', '--max-requests', '2']), 3)).toThrow('cannot exceed');
    expect(() => parseLiveOptions(['--retries', 'x'])).toThrow('non-negative integer');
    expect(() => assertLiveBudget(parseLiveOptions(['--confirm-live', '--retries', '3']), 2)).toThrow('cannot exceed 2');
    expect(assertLiveBudget(parseLiveOptions(['--confirm-live', '--limit', '1', '--max-requests', '1']), 2)).toBe(1);
  });

  it('rejects a manifest mismatch before constructing or invoking a provider', async () => {
    let providerInteractions = 0;
    const invalidManifest = { ...manifest, corpusSha256: '0'.repeat(64) };
    await expect(runLive(['--confirm-live', '--limit', '1', '--max-requests', '1'], {
      environment: { OPENAI_API_KEY: 'test-key', ASSISTED_RESOLVER_MODEL: 'test-model' },
      loadAssets: () => ({ corpus, manifest: invalidManifest }),
      createProvider: () => { providerInteractions += 1; return { resolve: async () => { providerInteractions += 1; throw new Error('must not run'); } }; },
      writeArtifact: () => { throw new Error('must not write'); }
    })).rejects.toThrow('integrity failed before provider construction');
    expect(providerInteractions).toBe(0);
  });

  it('rejects common API-key and authorization material from artifacts', () => {
    expect(containsSecretMaterial({ key: 'sk-abcdefghijklmnop' })).toBe(true);
    expect(containsSecretMaterial({ authorization: 'redacted' })).toBe(true);
  });
});
