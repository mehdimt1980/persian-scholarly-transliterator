import { z } from 'zod';
import {
  AcquisitionCategory,
  AcquisitionCorpusData,
  AcquisitionManifest,
  AcquisitionSource,
  AcquisitionSourceKind,
  EntityMetadata,
  EvidenceRole,
  ExternalCorpusCandidate,
  IndependenceClass,
  ProposedProfile,
  RomanizationSystem,
  WorkMetadata
} from './types';

export const AcquisitionCategorySchema = z.enum([
  'TERM',
  'LEGAL_TERM',
  'RELIGIOUS_TERM',
  'PERSON',
  'PLACE',
  'INSTITUTION',
  'BOOK_TITLE',
  'ARTICLE_TITLE',
  'COMPOUND',
  'MORPHOLOGY',
  'IZAFAT',
  'AMBIGUITY',
  'MIXED_SCRIPT',
  'OTHER'
]);

export const ProposedProfileSchema = z.enum([
  'ijmes_full',
  'ijmes_title'
]);

export const AcquisitionSourceKindSchema = z.enum([
  'CAMBRIDGE_IJMES',
  'ENCYCLOPAEDIA_IRANICA',
  'OPENALEX',
  'CROSSREF',
  'LIBRARY_CATALOG',
  'AUTHORITY_FILE',
  'ACADEMIC_DICTIONARY',
  'PEER_REVIEWED_PUBLICATION',
  'CRITICAL_EDITION',
  'OTHER_SCHOLARLY'
]);

export const EvidenceRoleSchema = z.enum([
  'SOURCE_TEXT',
  'IDENTITY',
  'READING',
  'BIBLIOGRAPHIC_METADATA',
  'RENDERING_POLICY'
]);

export const RomanizationSystemSchema = z.enum([
  'IRANICA',
  'ALA_LC',
  'IJMES',
  'PUBLISHER_SUPPLIED',
  'UNKNOWN'
]);

export const IndependenceClassSchema = z.enum([
  'FULLY_EXTERNAL',
  'EXTERNAL_SOURCE_PROJECT_TOPIC_OVERLAP',
  'REJECT_CIRCULAR'
]);

export const AcquisitionSourceSchema = z.object({
  kind: AcquisitionSourceKindSchema,
  title: z.string().min(1, 'Source title must not be empty'),
  url: z.string().url('Source URL must be a valid URL string').optional(),
  citation: z.string().min(1).optional(),
  locator: z.string().optional(),
  externalId: z.string().optional(),
  accessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'accessedAt must be YYYY-MM-DD'),
  evidenceRole: EvidenceRoleSchema,
  observedRomanization: z.string().optional(),
  romanizationSystem: RomanizationSystemSchema.optional()
}).superRefine((data, ctx) => {
  // Require structured citation if URL is omitted
  if (!data.url && (!data.citation || data.citation.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'AcquisitionSource requires either an absolute URL or a structured citation.'
    });
  }

  // Reject generic placeholders
  const lowerTitle = data.title.toLowerCase();
  if (
    lowerTitle === 'google' ||
    lowerTitle === 'web search' ||
    lowerTitle === 'some dictionary' ||
    lowerTitle === 'scholarly source'
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid generic source title "${data.title}". Must be an independently verifiable source.`
    });
  }

  // Special Iranica Rule (Section 28):
  // If kind === 'ENCYCLOPAEDIA_IRANICA' and observedRomanization exists, require romanizationSystem = 'IRANICA'
  if (data.kind === 'ENCYCLOPAEDIA_IRANICA' && data.observedRomanization && data.observedRomanization.trim() !== '') {
    if (!data.romanizationSystem) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Encyclopaedia Iranica source with observedRomanization must declare romanizationSystem (default: IRANICA).'
      });
    }
  }

  // Special Cambridge IJMES Rule (Section 29):
  // Normally evidenceRole should be RENDERING_POLICY
  if (data.kind === 'CAMBRIDGE_IJMES' && data.evidenceRole === 'SOURCE_TEXT') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'CAMBRIDGE_IJMES source should normally have evidenceRole RENDERING_POLICY, not SOURCE_TEXT for bulk vocabulary.'
    });
  }
});

export const WorkMetadataSchema = z.object({
  authorDisplay: z.string().optional(),
  publicationYear: z.number().int().optional(),
  doi: z.string().optional(),
  openAlexId: z.string().optional(),
  catalogId: z.string().optional()
});

export const EntityMetadataSchema = z.object({
  authorityId: z.string().optional(),
  englishLabel: z.string().optional(),
  entityType: z.enum(['PERSON', 'PLACE', 'INSTITUTION']).optional()
});

export const ExternalCorpusCandidateSchema = z.object({
  id: z.string().min(1, 'Candidate ID must not be empty'),
  sourceText: z.string().min(1, 'sourceText must not be empty'),
  proposedProfile: ProposedProfileSchema,
  category: AcquisitionCategorySchema,
  reviewStatus: z.literal('PENDING_HUMAN_REVIEW', {
    errorMap: () => ({ message: 'Acquisition candidates must have reviewStatus: PENDING_HUMAN_REVIEW' })
  }),
  independenceClass: IndependenceClassSchema,
  sources: z.array(AcquisitionSourceSchema).min(1, 'At least one independent acquisition source is required'),
  tags: z.array(z.string()).optional(),
  acquisitionNotes: z.string().optional(),
  workMetadata: WorkMetadataSchema.optional(),
  entityMetadata: EntityMetadataSchema.optional()
}).strict().superRefine((data: any, ctx) => {
  // Reject any expected answer fields
  if (
    'expected' in data ||
    'canonical' in data ||
    'allowedCanonicals' in data ||
    'finalText' in data ||
    'disposition' in data ||
    'requiredIssueTypes' in data ||
    'forbiddenIssueTypes' in data
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Candidate "${data.id}" contains expected output fields. Acquisition candidates must NOT contain gold transliterations or expected answers.`
    });
  }

  // Check source text whitespace
  if (data.sourceText.trim() !== data.sourceText) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Candidate "${data.id}" sourceText "${data.sourceText}" contains accidental leading or trailing whitespace.`
    });
  }

  // Circular checks (Section 4 & 19):
  // Check citations or URLs for user dissertation or project fixtures
  const textToCheck = [
    data.id,
    data.sourceText,
    data.acquisitionNotes || '',
    ...data.sources.map((s: AcquisitionSource) => `${s.title} ${s.citation || ''} ${s.url || ''}`)
  ].join(' ').toLowerCase();

  if (
    textToCheck.includes('divine law and human legislation') ||
    textToCheck.includes('pilot.single') ||
    textToCheck.includes('pilot.bibliography')
  ) {
    if (data.independenceClass !== 'REJECT_CIRCULAR') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Candidate "${data.id}" references project dissertation/pilot data and must be classified as REJECT_CIRCULAR.`
      });
    }
  }
});

export const AcquisitionManifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  status: z.literal('PENDING_HUMAN_REVIEW', {
    errorMap: () => ({ message: 'Acquisition manifest status must be PENDING_HUMAN_REVIEW' })
  }),
  sourcePolicy: z.literal('INDEPENDENT_EXTERNAL'),
  candidateFile: z.string().min(1),
  acquiredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'acquiredAt must be YYYY-MM-DD'),
  description: z.string().min(1)
}).strict().superRefine((data: any, ctx) => {
  if (data.status === 'HUMAN_REVIEWED' || data.status === 'RC_READY' || (data as any).tier === 'REAL_DISSERTATION') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Acquisition manifest cannot claim HUMAN_REVIEWED, RC_READY, or REAL_DISSERTATION tier.'
    });
  }
});

export const ExternalCandidatesFileSchema = z.object({
  manifest: AcquisitionManifestSchema,
  candidates: z.array(ExternalCorpusCandidateSchema)
});

export function validateCandidate(data: unknown): ExternalCorpusCandidate {
  return ExternalCorpusCandidateSchema.parse(data) as ExternalCorpusCandidate;
}

export function validateAcquisitionManifest(data: unknown): AcquisitionManifest {
  return AcquisitionManifestSchema.parse(data) as AcquisitionManifest;
}

export function validateAcquisitionCorpusData(data: unknown): AcquisitionCorpusData {
  return ExternalCandidatesFileSchema.parse(data) as AcquisitionCorpusData;
}
