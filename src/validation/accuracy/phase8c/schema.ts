import { z } from 'zod';
import { PHASE8C_DATASET_VERSION } from './types';

const referenceStatus = z.enum(['UNREVIEWED', 'REVIEW_PENDING', 'INDEPENDENTLY_REVIEWED', 'ADJUDICATION_REQUIRED', 'ADJUDICATED']);
const split = z.enum(['DEVELOPMENT_DIAGNOSTIC', 'LOCKED_EVALUATION']);
const stratum = z.enum(['BOOK_OR_ARTICLE_TITLE', 'PERSONAL_OR_GEOGRAPHICAL_NAME', 'TECHNICAL_OR_HISTORICAL_TERM', 'IZAFAT_OR_MORPHOLOGY', 'AMBIGUOUS_OR_DIFFICULT']);
const category = z.enum(['BOOK_OR_ARTICLE_TITLE', 'PERSONAL_NAME', 'PLACE_NAME', 'TECHNICAL_TERM', 'GENERAL_SCHOLARLY_TEXT']);
const featureKind = z.enum(['SHORT_VOWEL', 'LONG_VOWEL', 'CONSONANT', 'IZAFAT_PRESENCE', 'IZAFAT_REALIZATION', 'MORPHOLOGICAL_SUFFIX', 'COMPOUND_BOUNDARY', 'PROPER_NAME', 'HAMZA', 'AYN']);
const errorCategory = z.enum(['LEXICAL_READING_ERROR', 'SHORT_VOWEL_ERROR', 'LONG_VOWEL_ERROR', 'CONSONANT_MAPPING_ERROR', 'IZAFAT_DETECTION_ERROR', 'IZAFAT_RENDERING_ERROR', 'MORPHOLOGY_ERROR', 'COMPOUND_BOUNDARY_ERROR', 'PROPER_NAME_ERROR', 'HAMZA_AYN_ERROR', 'IJMES_PRESENTATION_ERROR', 'TOKEN_ALIGNMENT_ERROR', 'MODEL_UNCERTAINTY', 'VALIDATOR_FALSE_NEGATIVE', 'VALIDATOR_FALSE_POSITIVE', 'REFERENCE_DISPUTE', 'OTHER']);
const severity = z.enum(['BLOCK', 'REVIEW_REQUIRED', 'INFO']);
const validatorTruth = z.object({
  structuralError: z.boolean().nullable(), deterministicConsistencyError: z.boolean().nullable(), policySeverity: severity.or(z.literal('NONE')).nullable(), linguisticReviewRequired: z.boolean().nullable(),
  status: z.enum(['INDEPENDENTLY_REVIEWED', 'ADJUDICATED']), reviewerId: z.string().min(1), reviewedAt: z.string().min(1), citation: z.string().min(1), adjudicationNotes: z.string().optional()
}).strict();

const reference = z.object({
  primaryCanonical: z.string().min(1), acceptedAlternatives: z.array(z.string().min(1)),
  tokens: z.array(z.object({ tokenIndex: z.number().int().nonnegative(), surface: z.string().min(1), canonical: z.string().min(1), morphology: z.array(z.string()).optional() }).strict()),
  features: z.array(z.object({ id: z.string().min(1), kind: featureKind, scope: z.enum(['PHRASE', 'TOKEN', 'RELATION']), tokenIndexes: z.array(z.number().int().nonnegative()), expected: z.string().min(1) }).strict()),
  izafatRelations: z.array(z.object({ sourceTokenIndex: z.number().int().nonnegative(), targetTokenIndex: z.number().int().nonnegative(), realization: z.enum(['-i', '-yi']) }).strict()),
  properNameConventions: z.array(z.string()), ijmesConsiderations: z.array(z.string()), citations: z.array(z.string().min(1)), validatorGroundTruth: validatorTruth.nullable(), adjudicationNotes: z.string().optional()
}).strict();

export const accuracyCaseSchema = z.object({
  id: z.string().regex(/^p8c-[a-z0-9-]+$/), datasetVersion: z.literal(PHASE8C_DATASET_VERSION), originalPersian: z.string().min(1), normalizedInput: z.string().min(1),
  contextKind: z.enum(['BOOK_OR_ARTICLE_TITLE', 'GENERAL_SCHOLARLY_TEXT']), contentCategory: category, stratum, split, duplicateGroupId: z.string().min(1),
  provenance: z.object({ sourceType: z.enum(['USER_OBSERVED_DIAGNOSTIC', 'BIBLIOGRAPHIC_RECORD', 'SCHOLAR_SUPPLIED', 'SYNTHETIC_TEST_FIXTURE']), sourceId: z.string().min(1), citation: z.string().min(1), url: z.string().url().optional(), accessedAt: z.string().optional(), licenseNote: z.string().min(1) }).strict(),
  review: z.object({ status: referenceStatus, reviewerId: z.string().optional(), reviewerRole: z.string().optional(), reviewedAt: z.string().optional(), adjudicatorId: z.string().optional(), adjudicatedAt: z.string().optional(), notes: z.string().optional() }).strict(),
  reference: reference.nullable(),
  diagnosticObservation: z.object({ observedDraft: z.string().min(1), questions: z.array(z.string().min(1)), suspectedErrors: z.array(errorCategory), disclaimer: z.string().min(1) }).strict().optional()
}).strict().superRefine((value, context) => {
  const authoritative = value.review.status === 'INDEPENDENTLY_REVIEWED' || value.review.status === 'ADJUDICATED';
  if (authoritative && !value.reference) context.addIssue({ code: z.ZodIssueCode.custom, path: ['reference'], message: 'Reviewed/adjudicated cases require a reference annotation.' });
  if (!authoritative && value.reference) context.addIssue({ code: z.ZodIssueCode.custom, path: ['reference'], message: 'Non-authoritative review states cannot carry a scored reference.' });
  if (value.review.status === 'INDEPENDENTLY_REVIEWED' && (!value.review.reviewerId || !value.review.reviewedAt)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['review'], message: 'Independent review requires reviewer identity and date.' });
  if (value.review.status === 'ADJUDICATED' && (!value.review.adjudicatorId || !value.review.adjudicatedAt)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['review'], message: 'Adjudication requires adjudicator identity and date.' });
});

export const accuracyCorpusSchema = z.object({ schemaVersion: z.literal('phase8c-corpus-schema-v1'), datasetVersion: z.literal(PHASE8C_DATASET_VERSION), cases: z.array(accuracyCaseSchema) }).strict();

export const accuracyManifestSchema = z.object({
  schemaVersion: z.literal('phase8c-manifest-schema-v1'), datasetVersion: z.literal(PHASE8C_DATASET_VERSION), selectionAlgorithm: z.literal('independent-curation-v1'), splitAlgorithm: z.literal('sha256-grouped-phase8c-v1'), canonicalization: z.literal('stable-key-order-json-v1'), corpusSha256: z.string().regex(/^[a-f0-9]{64}$/u), caseCount: z.number().int().nonnegative(), reviewedCaseCount: z.number().int().nonnegative(), splitCounts: z.object({ DEVELOPMENT_DIAGNOSTIC: z.number().int().nonnegative(), LOCKED_EVALUATION: z.number().int().nonnegative() }).strict(), sourceIds: z.array(z.string().min(1))
}).strict();

export const accuracyPredictionSchema = z.object({
  caseId: z.string().min(1), provider: z.string().min(1), model: z.string().min(1), promptVersion: z.string().min(1), responseClassification: z.enum(['PROPOSED', 'REVIEW_REQUIRED', 'PROVIDER_FAILURE', 'TIMEOUT']), validationPassed: z.boolean(), validationErrors: z.array(z.string()), canonicalProposal: z.string().min(1).nullable(), renderedFull: z.string().min(1).nullable(), renderedIjmesPublication: z.string().min(1).nullable(),
  tokenReadings: z.array(z.object({ tokenIndex: z.number().int().nonnegative(), surface: z.string().min(1), canonical: z.string().min(1) }).strict()), predictedFeatures: z.array(z.object({ referenceFeatureId: z.string().min(1), value: z.string().min(1) }).strict()), warnings: z.array(z.string()), assumptions: z.array(z.string()), errorCategories: z.array(errorCategory), validatorSignals: z.array(z.object({ layer: z.enum(['STRUCTURAL', 'DETERMINISTIC_CONSISTENCY', 'IJMES_POLICY', 'LINGUISTIC_REVIEW']), severity }).strict()), durationMs: z.number().nonnegative(), resolution: z.unknown().optional()
}).strict();
