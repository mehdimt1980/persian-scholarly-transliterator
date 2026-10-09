import { renderScholarlyCanonical } from '../../../domain/presentation/render';
import { isScorable } from './identity';
import { accuracyCorpusSchema, accuracyPredictionSchema } from './schema';
import { proportion } from './statistics';
import type { AccuracyPrediction, ErrorCategory, EvaluationInput, EvaluationReport, FeatureKind, ValidatorGroundTruth, ValidatorMatrix } from './types';

const FEATURE_KINDS: FeatureKind[] = ['SHORT_VOWEL', 'LONG_VOWEL', 'CONSONANT', 'IZAFAT_PRESENCE', 'IZAFAT_REALIZATION', 'MORPHOLOGICAL_SUFFIX', 'COMPOUND_BOUNDARY', 'PROPER_NAME', 'HAMZA', 'AYN'];
const ERROR_CATEGORIES: ErrorCategory[] = ['LEXICAL_READING_ERROR', 'SHORT_VOWEL_ERROR', 'LONG_VOWEL_ERROR', 'CONSONANT_MAPPING_ERROR', 'IZAFAT_DETECTION_ERROR', 'IZAFAT_RENDERING_ERROR', 'MORPHOLOGY_ERROR', 'COMPOUND_BOUNDARY_ERROR', 'PROPER_NAME_ERROR', 'HAMZA_AYN_ERROR', 'IJMES_PRESENTATION_ERROR', 'TOKEN_ALIGNMENT_ERROR', 'MODEL_UNCERTAINTY', 'VALIDATOR_FALSE_NEGATIVE', 'VALIDATOR_FALSE_POSITIVE', 'REFERENCE_DISPUTE', 'OTHER'];
const LAYERS = ['STRUCTURAL', 'DETERMINISTIC_CONSISTENCY', 'IJMES_POLICY', 'LINGUISTIC_REVIEW'] as const;

export function canonicalNormalization(value: string): string { return value.normalize('NFC').trim().replace(/\s+/gu, ' '); }

function emptyMatrix(): ValidatorMatrix { return { outcome: 'NOT_MEASURABLE', trueDetectedErrors: 0, missedErrors: 0, falseWarnings: 0, correctUnflagged: 0, uncertain: 0, signalCounts: { BLOCK: 0, REVIEW_REQUIRED: 0, INFO: 0 }, precision: proportion(0, 0), recall: proportion(0, 0) }; }
function truthFor(layer: typeof LAYERS[number], truth: ValidatorGroundTruth): boolean | null {
  if (layer === 'STRUCTURAL') return truth.structuralError;
  if (layer === 'DETERMINISTIC_CONSISTENCY') return truth.deterministicConsistencyError;
  if (layer === 'LINGUISTIC_REVIEW') return truth.linguisticReviewRequired;
  return truth.policySeverity === null ? null : truth.policySeverity !== 'NONE';
}

function validatedPredictions(input: EvaluationInput): AccuracyPrediction[] {
  accuracyCorpusSchema.parse(input.corpus);
  const predictions = input.predictions.map((prediction) => accuracyPredictionSchema.parse(prediction) as AccuracyPrediction);
  const corpusIds = new Set(input.corpus.cases.map((item) => item.id));
  const seen = new Set<string>();
  for (const prediction of predictions) {
    if (seen.has(prediction.caseId)) throw new Error(`Duplicate prediction case ID: ${prediction.caseId}`);
    if (!corpusIds.has(prediction.caseId)) throw new Error(`Prediction references unknown case ID: ${prediction.caseId}`);
    seen.add(prediction.caseId);
    const item = input.corpus.cases.find((candidate) => candidate.id === prediction.caseId)!;
    const featureIds = new Set(item.reference?.features.map((feature) => feature.id) ?? []);
    const seenFeatures = new Set<string>();
    for (const feature of prediction.predictedFeatures) {
      if (seenFeatures.has(feature.referenceFeatureId)) throw new Error(`Duplicate predicted feature ID for ${prediction.caseId}: ${feature.referenceFeatureId}`);
      if (!featureIds.has(feature.referenceFeatureId)) throw new Error(`Unknown reference feature ID for ${prediction.caseId}: ${feature.referenceFeatureId}`);
      seenFeatures.add(feature.referenceFeatureId);
    }
  }
  return predictions;
}

export function evaluateAccuracy(input: EvaluationInput): EvaluationReport {
  const parsedPredictions = validatedPredictions(input);
  const predictions = new Map(parsedPredictions.map((item) => [item.caseId, item]));
  const exclusions: EvaluationReport['exclusions'] = [];
  const predictionFailures: EvaluationReport['predictionFailures'] = [];
  const caseFlow = { unreviewedExcluded: 0, eligibleReferenceCases: 0, missingPredictions: 0, providerFailures: 0, timeouts: 0, invalidPredictions: 0, unalignablePredictions: 0, successfullyEvaluated: 0 };
  let exact = 0, alternative = 0, normalized = 0, caseOnly = 0, unicodeOnly = 0;
  let tokenCorrect = 0, tokenIncorrect = 0, tokenUnalignable = 0, tokenAmbiguous = 0, eligibleReferenceTokens = 0, unsuccessfulTokens = 0;
  let fullCorrect = 0, publicationCorrect = 0, phrasesNeedingCorrection = 0, tokensNeedingCorrection = 0, completeReanalysis = 0;
  const features = Object.fromEntries(FEATURE_KINDS.map((kind) => [kind, { correct: 0, incorrect: 0, unevaluable: 0 }])) as EvaluationReport['features'];
  const errors = Object.fromEntries(ERROR_CATEGORIES.map((kind) => [kind, 0])) as EvaluationReport['errors'];
  const validator = Object.fromEntries(LAYERS.map((layer) => [layer, emptyMatrix()])) as EvaluationReport['validator'];

  for (const item of input.corpus.cases) {
    if (!isScorable(item)) {
      caseFlow.unreviewedExcluded += 1;
      exclusions.push({ caseId: item.id, reason: `Reference status ${item.review.status} is not eligible for scholarly scoring.` });
      continue;
    }
    caseFlow.eligibleReferenceCases += 1;
    const reference = item.reference!;
    eligibleReferenceTokens += reference.tokens.length;
    const prediction = predictions.get(item.id);
    let failureKind: EvaluationReport['predictionFailures'][number]['kind'] | null = null;
    let failureReason = '';
    if (!prediction) {
      caseFlow.missingPredictions += 1; failureKind = 'MISSING_PREDICTION'; failureReason = 'No prediction was supplied.';
    } else if (prediction.responseClassification === 'PROVIDER_FAILURE') {
      caseFlow.providerFailures += 1; failureKind = 'PROVIDER_FAILURE'; failureReason = prediction.validationErrors.join('; ') || 'Provider failure.';
    } else if (prediction.responseClassification === 'TIMEOUT') {
      caseFlow.timeouts += 1; failureKind = 'TIMEOUT'; failureReason = prediction.validationErrors.join('; ') || 'Provider timeout.';
    } else if (!prediction.validationPassed || !prediction.canonicalProposal) {
      caseFlow.invalidPredictions += 1; failureKind = 'INVALID_PREDICTION'; failureReason = prediction.validationErrors.join('; ') || 'Prediction has no valid canonical proposal.';
    }
    if (prediction) for (const category of prediction.errorCategories) errors[category] += 1;
    if (failureKind) {
      predictionFailures.push({ caseId: item.id, kind: failureKind, reason: failureReason });
      unsuccessfulTokens += reference.tokens.length;
      phrasesNeedingCorrection += 1; tokensNeedingCorrection += reference.tokens.length; completeReanalysis += 1;
      for (const feature of reference.features) features[feature.kind].unevaluable += 1;
      for (const layer of LAYERS) validator[layer].uncertain += 1;
      continue;
    }
    const canonical = prediction!.canonicalProposal!;
    const accepted = [reference.primaryCanonical, ...reference.acceptedAlternatives];
    if (canonical === reference.primaryCanonical) exact += 1;
    if (accepted.includes(canonical)) alternative += 1;
    if (accepted.some((candidate) => canonicalNormalization(candidate) === canonicalNormalization(canonical))) normalized += 1;
    if (accepted.some((candidate) => canonicalNormalization(candidate).toLocaleLowerCase('en-US') === canonicalNormalization(canonical).toLocaleLowerCase('en-US')) && !accepted.includes(canonical)) caseOnly += 1;
    if (accepted.some((candidate) => candidate.normalize('NFC') === canonical.normalize('NFC')) && !accepted.includes(canonical)) unicodeOnly += 1;
    if (!accepted.includes(canonical)) phrasesNeedingCorrection += 1;

    const predictedTokens = new Map(prediction!.tokenReadings.map((token) => [token.tokenIndex, token]));
    let caseUnalignable = false;
    for (const token of reference.tokens) {
      const predicted = predictedTokens.get(token.tokenIndex);
      if (!predicted || predicted.surface !== token.surface) { tokenUnalignable += 1; tokensNeedingCorrection += 1; caseUnalignable = true; continue; }
      if (predicted.canonical === token.canonical) tokenCorrect += 1; else { tokenIncorrect += 1; tokensNeedingCorrection += 1; }
    }
    if (caseUnalignable) caseFlow.unalignablePredictions += 1;
    else caseFlow.successfullyEvaluated += 1;
    if (prediction!.errorCategories.includes('TOKEN_ALIGNMENT_ERROR')) tokenAmbiguous += 1;
    const predictedFeatures = new Map(prediction!.predictedFeatures.map((feature) => [feature.referenceFeatureId, feature.value]));
    for (const feature of reference.features) {
      const value = predictedFeatures.get(feature.id);
      if (value === undefined) features[feature.kind].unevaluable += 1;
      else if (value === feature.expected) features[feature.kind].correct += 1;
      else features[feature.kind].incorrect += 1;
    }
    const expectedFull = renderScholarlyCanonical(reference.primaryCanonical, { id: 'full_scholarly_v1' }, { contentCategory: item.contentCategory }).output;
    const expectedPublication = renderScholarlyCanonical(reference.primaryCanonical, { id: 'ijmes_publication_v1' }, { contentCategory: item.contentCategory }).output;
    if (prediction!.renderedFull === expectedFull) fullCorrect += 1;
    if (prediction!.renderedIjmesPublication === expectedPublication) publicationCorrect += 1;

    const groundTruth = reference.validatorGroundTruth;
    for (const layer of LAYERS) {
      const matrix = validator[layer];
      for (const signal of prediction!.validatorSignals.filter((signal) => signal.layer === layer)) matrix.signalCounts[signal.severity] += 1;
      const truth = groundTruth ? truthFor(layer, groundTruth) : null;
      if (truth === null) { matrix.uncertain += 1; continue; }
      const flagged = prediction!.validatorSignals.some((signal) => signal.layer === layer && signal.severity !== 'INFO');
      if (truth && flagged) matrix.trueDetectedErrors += 1;
      else if (truth) matrix.missedErrors += 1;
      else if (flagged) matrix.falseWarnings += 1;
      else matrix.correctUnflagged += 1;
    }
  }

  for (const layer of LAYERS) {
    const matrix = validator[layer];
    const measured = matrix.trueDetectedErrors + matrix.missedErrors + matrix.falseWarnings + matrix.correctUnflagged;
    matrix.outcome = measured > 0 ? 'MEASURABLE' : 'NOT_MEASURABLE';
    matrix.precision = proportion(matrix.trueDetectedErrors, matrix.trueDetectedErrors + matrix.falseWarnings);
    matrix.recall = proportion(matrix.trueDetectedErrors, matrix.trueDetectedErrors + matrix.missedErrors);
  }
  const denominator = caseFlow.eligibleReferenceCases;
  const conditionalTokenDenominator = tokenCorrect + tokenIncorrect;
  return { schemaVersion: 'phase8c-evaluation-report-v2', runKind: input.runKind, datasetVersion: input.corpus.datasetVersion, totalCases: input.corpus.cases.length, reviewedCases: denominator, caseFlow,
    phrase: { exact: proportion(exact, denominator), acceptedAlternative: proportion(alternative, denominator), normalizedReference: proportion(normalized, denominator), endToEndSuccess: proportion(alternative, denominator), caseOnlyDifference: caseOnly, unicodeOnlyDifference: unicodeOnly },
    tokens: { eligibleReferenceTokens, correct: tokenCorrect, incorrect: tokenIncorrect, unalignable: tokenUnalignable, unsuccessfulFromMissingOrFailedPredictions: unsuccessfulTokens, alignmentAmbiguity: tokenAmbiguous, conditionalAccuracy: proportion(tokenCorrect, conditionalTokenDenominator), endToEndSuccess: proportion(tokenCorrect, eligibleReferenceTokens) },
    features, presentation: { fullScholarly: proportion(fullCorrect, denominator), ijmesPublication: proportion(publicationCorrect, denominator) }, validator,
    correctionProxy: { phrasesNeedingCorrection, tokensNeedingCorrection, completeReanalysisCases: completeReanalysis, note: 'Automatic reference-distance proxy only; it is not measured human effort or editing time.' }, errors, exclusions, predictionFailures };
}

export function containsSecretMaterial(value: unknown): boolean {
  const text = JSON.stringify(value);
  return /(?:OPENAI_API_KEY|authorization|bearer\s+|sk-[A-Za-z0-9_-]{12,})/iu.test(text);
}
