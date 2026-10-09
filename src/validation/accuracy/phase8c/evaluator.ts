import { renderScholarlyCanonical } from '../../../domain/presentation/render';
import { isScorable } from './identity';
import { proportion } from './statistics';
import type { ErrorCategory, EvaluationInput, EvaluationReport, FeatureKind, ValidatorGroundTruth, ValidatorMatrix } from './types';

const FEATURE_KINDS: FeatureKind[] = ['SHORT_VOWEL', 'LONG_VOWEL', 'CONSONANT', 'IZAFAT_PRESENCE', 'IZAFAT_REALIZATION', 'MORPHOLOGICAL_SUFFIX', 'COMPOUND_BOUNDARY', 'PROPER_NAME', 'HAMZA', 'AYN'];
const ERROR_CATEGORIES: ErrorCategory[] = ['LEXICAL_READING_ERROR', 'SHORT_VOWEL_ERROR', 'LONG_VOWEL_ERROR', 'CONSONANT_MAPPING_ERROR', 'IZAFAT_DETECTION_ERROR', 'IZAFAT_RENDERING_ERROR', 'MORPHOLOGY_ERROR', 'COMPOUND_BOUNDARY_ERROR', 'PROPER_NAME_ERROR', 'HAMZA_AYN_ERROR', 'IJMES_PRESENTATION_ERROR', 'TOKEN_ALIGNMENT_ERROR', 'MODEL_UNCERTAINTY', 'VALIDATOR_FALSE_NEGATIVE', 'VALIDATOR_FALSE_POSITIVE', 'REFERENCE_DISPUTE', 'OTHER'];
const LAYERS = ['STRUCTURAL', 'DETERMINISTIC_CONSISTENCY', 'IJMES_POLICY', 'LINGUISTIC_REVIEW'] as const;

export function canonicalNormalization(value: string): string { return value.normalize('NFC').trim().replace(/\s+/gu, ' '); }

function emptyMatrix(): ValidatorMatrix { return { trueDetectedErrors: 0, missedErrors: 0, falseWarnings: 0, correctUnflagged: 0, uncertain: 0, signalCounts: { BLOCK: 0, REVIEW_REQUIRED: 0, INFO: 0 }, precision: proportion(0, 0), recall: proportion(0, 0) }; }
function truthFor(layer: typeof LAYERS[number], truth: ValidatorGroundTruth): boolean | null {
  if (layer === 'STRUCTURAL') return truth.structuralError;
  if (layer === 'DETERMINISTIC_CONSISTENCY') return truth.deterministicConsistencyError;
  if (layer === 'LINGUISTIC_REVIEW') return truth.linguisticReviewRequired;
  return truth.policySeverity === null ? null : truth.policySeverity !== 'NONE';
}

export function evaluateAccuracy(input: EvaluationInput): EvaluationReport {
  const predictions = new Map(input.predictions.map((item) => [item.caseId, item]));
  const scorable = input.corpus.cases.filter(isScorable);
  const exclusions: EvaluationReport['exclusions'] = [];
  let exact = 0, alternative = 0, normalized = 0, caseOnly = 0, unicodeOnly = 0, failures = 0;
  let tokenCorrect = 0, tokenIncorrect = 0, tokenUnalignable = 0, tokenAmbiguous = 0;
  let fullCorrect = 0, publicationCorrect = 0, phrasesNeedingCorrection = 0, tokensNeedingCorrection = 0, completeReanalysis = 0;
  const features = Object.fromEntries(FEATURE_KINDS.map((kind) => [kind, { correct: 0, incorrect: 0, unevaluable: 0 }])) as EvaluationReport['features'];
  const errors = Object.fromEntries(ERROR_CATEGORIES.map((kind) => [kind, 0])) as EvaluationReport['errors'];
  const validator = Object.fromEntries(LAYERS.map((layer) => [layer, emptyMatrix()])) as EvaluationReport['validator'];

  for (const item of input.corpus.cases) {
    if (!isScorable(item)) { exclusions.push({ caseId: item.id, reason: `Reference status ${item.review.status} is not eligible for primary accuracy.` }); continue; }
    const prediction = predictions.get(item.id);
    if (!prediction || !prediction.canonicalProposal) {
      failures += 1; phrasesNeedingCorrection += 1; completeReanalysis += 1;
      exclusions.push({ caseId: item.id, reason: prediction ? `No canonical proposal (${prediction.responseClassification}); retained as a failure.` : 'Missing prediction; retained as a failure.' });
      continue;
    }
    const reference = item.reference!;
    const accepted = [reference.primaryCanonical, ...reference.acceptedAlternatives];
    if (prediction.canonicalProposal === reference.primaryCanonical) exact += 1;
    if (accepted.includes(prediction.canonicalProposal)) alternative += 1;
    if (accepted.some((candidate) => canonicalNormalization(candidate) === canonicalNormalization(prediction.canonicalProposal!))) normalized += 1;
    if (accepted.some((candidate) => canonicalNormalization(candidate).toLocaleLowerCase('en-US') === canonicalNormalization(prediction.canonicalProposal!).toLocaleLowerCase('en-US')) && !accepted.includes(prediction.canonicalProposal)) caseOnly += 1;
    if (accepted.some((candidate) => candidate.normalize('NFC') === prediction.canonicalProposal!.normalize('NFC')) && !accepted.includes(prediction.canonicalProposal)) unicodeOnly += 1;
    if (!accepted.includes(prediction.canonicalProposal)) { phrasesNeedingCorrection += 1; }

    const predictedTokens = new Map(prediction.tokenReadings.map((token) => [token.tokenIndex, token]));
    for (const token of reference.tokens) {
      const predicted = predictedTokens.get(token.tokenIndex);
      if (!predicted || predicted.surface !== token.surface) { tokenUnalignable += 1; tokensNeedingCorrection += 1; continue; }
      if (predicted.canonical === token.canonical) tokenCorrect += 1; else { tokenIncorrect += 1; tokensNeedingCorrection += 1; }
    }
    if (prediction.errorCategories.includes('TOKEN_ALIGNMENT_ERROR')) tokenAmbiguous += 1;
    const predictedFeatures = new Map(prediction.predictedFeatures.map((feature) => [feature.referenceFeatureId, feature.value]));
    for (const feature of reference.features) {
      const value = predictedFeatures.get(feature.id);
      if (value === undefined) features[feature.kind].unevaluable += 1;
      else if (value === feature.expected) features[feature.kind].correct += 1;
      else features[feature.kind].incorrect += 1;
    }
    const expectedFull = renderScholarlyCanonical(reference.primaryCanonical, { id: 'full_scholarly_v1' }, { contentCategory: item.contentCategory }).output;
    const expectedPublication = renderScholarlyCanonical(reference.primaryCanonical, { id: 'ijmes_publication_v1' }, { contentCategory: item.contentCategory }).output;
    if (prediction.renderedFull === expectedFull) fullCorrect += 1;
    if (prediction.renderedIjmesPublication === expectedPublication) publicationCorrect += 1;
    for (const category of prediction.errorCategories) errors[category] += 1;
  }

  for (const prediction of input.predictions) {
    for (const layer of LAYERS) {
      const matrix = validator[layer];
      for (const signal of prediction.validatorSignals.filter((item) => item.layer === layer)) matrix.signalCounts[signal.severity] += 1;
      const truth = prediction.validatorGroundTruth ? truthFor(layer, prediction.validatorGroundTruth) : null;
      if (truth === null) { matrix.uncertain += 1; continue; }
      const flagged = prediction.validatorSignals.some((signal) => signal.layer === layer && signal.severity !== 'INFO');
      if (truth && flagged) matrix.trueDetectedErrors += 1;
      else if (truth) matrix.missedErrors += 1;
      else if (flagged) matrix.falseWarnings += 1;
      else matrix.correctUnflagged += 1;
    }
  }
  for (const layer of LAYERS) {
    const matrix = validator[layer];
    matrix.precision = proportion(matrix.trueDetectedErrors, matrix.trueDetectedErrors + matrix.falseWarnings);
    matrix.recall = proportion(matrix.trueDetectedErrors, matrix.trueDetectedErrors + matrix.missedErrors);
  }
  const denominator = scorable.length;
  const tokenDenominator = tokenCorrect + tokenIncorrect + tokenUnalignable;
  return { schemaVersion: 'phase8c-evaluation-report-v1', runKind: input.runKind, datasetVersion: input.corpus.datasetVersion, totalCases: input.corpus.cases.length, reviewedCases: denominator, evaluatedCases: denominator - failures, excludedCases: input.corpus.cases.length - denominator, failureCases: failures,
    phrase: { exact: proportion(exact, denominator), acceptedAlternative: proportion(alternative, denominator), normalizedReference: proportion(normalized, denominator), caseOnlyDifference: caseOnly, unicodeOnlyDifference: unicodeOnly },
    tokens: { correct: tokenCorrect, incorrect: tokenIncorrect, unalignable: tokenUnalignable, alignmentAmbiguity: tokenAmbiguous, evaluatedDenominator: tokenDenominator, accuracy: proportion(tokenCorrect, tokenDenominator) },
    features, presentation: { fullScholarly: proportion(fullCorrect, denominator), ijmesPublication: proportion(publicationCorrect, denominator) }, validator,
    correctionProxy: { phrasesNeedingCorrection, tokensNeedingCorrection, completeReanalysisCases: completeReanalysis, note: 'Automatic reference-distance proxy only; it is not measured human effort or editing time.' }, errors, exclusions };
}

export function containsSecretMaterial(value: unknown): boolean {
  const text = JSON.stringify(value);
  return /(?:OPENAI_API_KEY|authorization|bearer\s+|sk-[A-Za-z0-9_-]{12,})/iu.test(text);
}
