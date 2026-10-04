import { z } from 'zod';
import { containsArabicScript } from '../domain/bibliography/scriptDetection';
import { ScholarlyValidationCase, SingleValidationCorpus, BibliographyValidationCase, BibliographyValidationCorpus } from './types';

export const ScholarlyCategorySchema = z.enum([
  'TERM',
  'PERSON',
  'PLACE',
  'BOOK_TITLE',
  'ARTICLE_TITLE',
  'INSTITUTION',
  'LEGAL_TERM',
  'RELIGIOUS_TERM',
  'COMPOUND',
  'MORPHOLOGY',
  'IZAFAT',
  'AMBIGUITY',
  'MIXED_SCRIPT',
  'OTHER'
]);

export const ValidationExpectedDispositionSchema = z.enum([
  'FINAL',
  'REVIEW_REQUIRED',
  'UNRESOLVED'
]);

export const ValidationProvenanceKindSchema = z.enum([
  'IJMES_GUIDE',
  'SCHOLARLY_DICTIONARY',
  'ENCYCLOPEDIA',
  'ACADEMIC_SOURCE',
  'DISSERTATION_REVIEW',
  'PROJECT_REVIEW'
]);

export const ValidationProvenanceSchema = z.object({
  kind: ValidationProvenanceKindSchema,
  citation: z.string().min(1, 'Citation must not be empty'),
  locator: z.string().optional(),
  note: z.string().optional()
});

export const ReviewIssueTypeSchema = z.enum([
  'LEXICAL_AMBIGUITY',
  'UNKNOWN_TOKEN',
  'IZAFAT_CANDIDATE',
  'MORPHOLOGY_AMBIGUITY',
  'UNSUPPORTED_ALLOMORPH',
  'INSUFFICIENT_VOCALIZATION',
  'UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE'
]);

export const ScholarlyValidationCaseSchema = z.object({
  id: z.string().min(1, 'Case ID must not be empty'),
  input: z.string().min(1, 'Input must not be empty'),
  profile: z.enum(['ijmes_full', 'ijmes_title']),
  category: ScholarlyCategorySchema,
  expected: z.object({
    disposition: ValidationExpectedDispositionSchema,
    canonical: z.string().optional(),
    allowedCanonicals: z.array(z.string()).optional(),
    requiredIssueTypes: z.array(ReviewIssueTypeSchema).optional(),
    forbiddenIssueTypes: z.array(ReviewIssueTypeSchema).optional()
  }),
  provenance: ValidationProvenanceSchema,
  tags: z.array(z.string()).optional()
}).superRefine((data, ctx) => {
  // 1. FINAL requires canonical or allowedCanonicals
  if (data.expected.disposition === 'FINAL') {
    const hasCanonical = Boolean(data.expected.canonical && data.expected.canonical.trim().length > 0);
    const hasAllowed = Boolean(data.expected.allowedCanonicals && data.expected.allowedCanonicals.length > 0);
    if (!hasCanonical && !hasAllowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" has disposition "FINAL" but does not specify a canonical or allowedCanonicals.`,
        path: ['expected']
      });
    }
    // Check that canonical does not contain Arabic/Persian script
    if (data.expected.canonical && containsArabicScript(data.expected.canonical)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" specifies a canonical containing Persian/Arabic script instead of Latin IJMES transliteration: "${data.expected.canonical}".`,
        path: ['expected', 'canonical']
      });
    }
    if (data.expected.allowedCanonicals) {
      for (let i = 0; i < data.expected.allowedCanonicals.length; i++) {
        const can = data.expected.allowedCanonicals[i];
        if (containsArabicScript(can)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Case "${data.id}" specifies allowedCanonical containing Persian/Arabic script: "${can}".`,
            path: ['expected', 'allowedCanonicals', i]
          });
        }
      }
    }
  }

  // 2. REVIEW_REQUIRED or UNRESOLVED must not have authoritative canonical unless explicitly permitted with a note
  if (data.expected.disposition !== 'FINAL') {
    if (data.expected.canonical && !data.provenance.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" is ${data.expected.disposition} but provides an authoritative canonical without an explanatory provenance note.`,
        path: ['expected', 'canonical']
      });
    }
  }
});

export const CorpusMetadataSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  reviewedAt: z.string().optional(),
  reviewer: z.string().optional()
});

export const SingleValidationCorpusSchema = z.object({
  metadata: CorpusMetadataSchema,
  cases: z.array(ScholarlyValidationCaseSchema)
}).superRefine((data, ctx) => {
  // Check duplicate IDs
  const seenIds = new Set<string>();
  for (let i = 0; i < data.cases.length; i++) {
    const c = data.cases[i];
    if (seenIds.has(c.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate case ID "${c.id}" found at index ${i}.`,
        path: ['cases', i, 'id']
      });
    }
    seenIds.add(c.id);
  }
});

export function validateSingleCorpus(data: unknown): SingleValidationCorpus {
  return SingleValidationCorpusSchema.parse(data) as SingleValidationCorpus;
}

export function validateSingleCase(data: unknown): ScholarlyValidationCase {
  return ScholarlyValidationCaseSchema.parse(data) as ScholarlyValidationCase;
}

export const BibliographyValidationCaseSchema = z.object({
  id: z.string().min(1),
  record: z.any(),
  reviewDecisions: z.array(z.any()).optional(),
  expected: z.object({
    readiness: z.enum(['READY', 'REVIEW_REQUIRED', 'INVALID']),
    fields: z.record(
      z.object({
        finalText: z.string().optional(),
        disposition: z.enum(['FINAL', 'REVIEW_REQUIRED', 'UNRESOLVED', 'PASSTHROUGH'])
      })
    ).optional()
  }),
  provenance: ValidationProvenanceSchema,
  tags: z.array(z.string()).optional()
});

export const BibliographyValidationCorpusSchema = z.object({
  metadata: CorpusMetadataSchema,
  cases: z.array(BibliographyValidationCaseSchema)
}).superRefine((data, ctx) => {
  const seenIds = new Set<string>();
  for (let i = 0; i < data.cases.length; i++) {
    const c = data.cases[i];
    if (seenIds.has(c.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate bibliography case ID "${c.id}" found at index ${i}.`,
        path: ['cases', i, 'id']
      });
    }
    seenIds.add(c.id);
  }
});

export function validateBibliographyCorpus(data: unknown): BibliographyValidationCorpus {
  return BibliographyValidationCorpusSchema.parse(data) as BibliographyValidationCorpus;
}
