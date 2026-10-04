import { z } from 'zod';
import { containsArabicScript } from '../domain/bibliography/scriptDetection';
import {
  BibliographyValidationCase,
  BibliographyValidationCorpus,
  CorpusManifest,
  SingleValidationCorpus,
  ScholarlyValidationCase
} from './types';

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

export const ValidationSourceSchema = z.object({
  kind: ValidationProvenanceKindSchema,
  citation: z.string().min(1, 'Citation must not be empty'),
  locator: z.string().optional(),
  note: z.string().optional()
});

export const ValidationProvenanceSchema = z.object({
  sources: z.array(ValidationSourceSchema).min(1, 'At least one provenance source is required'),
  reviewNote: z.string().optional()
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

function validateCanonicalString(val: string, ctx: z.RefinementCtx, path: (string | number)[], id: string) {
  if (val.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Case "${id}" contains an empty canonical string.`,
      path
    });
    return;
  }
  if (val.trim() !== val) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Case "${id}" canonical string "${val}" contains accidental leading or trailing whitespace.`,
      path
    });
  }
  if (containsArabicScript(val)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Case "${id}" specifies a canonical containing Persian/Arabic script instead of Latin IJMES transliteration: "${val}".`,
      path
    });
  }
}

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
  const hasCanonical = data.expected.canonical !== undefined;
  const hasAllowed = data.expected.allowedCanonicals !== undefined && data.expected.allowedCanonicals.length > 0;

  // 1. FINAL requires canonical or allowedCanonicals (not both)
  if (data.expected.disposition === 'FINAL') {
    if (!hasCanonical && !hasAllowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" has disposition "FINAL" but does not specify a canonical or allowedCanonicals.`,
        path: ['expected']
      });
    }

    if (hasCanonical && hasAllowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" specifies both canonical and allowedCanonicals. Specify only one.`,
        path: ['expected']
      });
    }

    if (data.expected.canonical !== undefined) {
      validateCanonicalString(data.expected.canonical, ctx, ['expected', 'canonical'], data.id);
    }

    if (data.expected.allowedCanonicals !== undefined) {
      const seen = new Set<string>();
      for (let i = 0; i < data.expected.allowedCanonicals.length; i++) {
        const can = data.expected.allowedCanonicals[i];
        validateCanonicalString(can, ctx, ['expected', 'allowedCanonicals', i], data.id);
        if (seen.has(can)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Case "${data.id}" contains duplicate allowedCanonical "${can}".`,
            path: ['expected', 'allowedCanonicals', i]
          });
        }
        seen.add(can);
      }
    }
  }

  // 2. REVIEW_REQUIRED or UNRESOLVED must not have authoritative canonical or allowedCanonicals unless explicitly documented in reviewNote
  if (data.expected.disposition !== 'FINAL') {
    const hasNote = Boolean(data.provenance.reviewNote || data.provenance.sources.some((s) => Boolean(s.note)));
    if (hasCanonical && !hasNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" has disposition "${data.expected.disposition}" but provides an authoritative canonical without an explanatory reviewNote or source note.`,
        path: ['expected', 'canonical']
      });
    }
    if (hasAllowed && !hasNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" has disposition "${data.expected.disposition}" but provides allowedCanonicals without an explanatory reviewNote or source note.`,
        path: ['expected', 'allowedCanonicals']
      });
    }
  }
});

export const CorpusTierSchema = z.enum(['PILOT', 'REAL_DISSERTATION']);
export const ReleaseTargetSchema = z.enum(['PILOT', 'RC']);
export const CorpusReviewStatusSchema = z.enum(['SOURCE_BACKED_FIXTURE', 'HUMAN_REVIEWED']);

export const CorpusMetadataSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  tier: CorpusTierSchema,
  reviewStatus: CorpusReviewStatusSchema,
  reviewer: z.string().optional(),
  reviewedAt: z.string().optional(),
  reviewNote: z.string().optional()
}).superRefine((data, ctx) => {
  if (data.reviewStatus === 'HUMAN_REVIEWED') {
    if (!data.reviewer || data.reviewer.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus marked "HUMAN_REVIEWED" requires a non-empty reviewer field.`,
        path: ['reviewer']
      });
    }
    if (!data.reviewedAt || data.reviewedAt.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus marked "HUMAN_REVIEWED" requires a non-empty reviewedAt field.`,
        path: ['reviewedAt']
      });
    }
  }
});

export const CorpusManifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  tier: CorpusTierSchema,
  reviewStatus: CorpusReviewStatusSchema,
  reviewer: z.string().optional(),
  reviewedAt: z.string().optional(),
  reviewNote: z.string().optional(),
  single: z.string().optional(),
  bibliography: z.string().optional()
}).superRefine((data, ctx) => {
  if (!data.single && !data.bibliography) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Manifest must declare at least one corpus file (single or bibliography).'
    });
  }
  if (data.reviewStatus === 'HUMAN_REVIEWED') {
    if (!data.reviewer || data.reviewer.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Manifest marked "HUMAN_REVIEWED" requires a non-empty reviewer field.`,
        path: ['reviewer']
      });
    }
    if (!data.reviewedAt || data.reviewedAt.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Manifest marked "HUMAN_REVIEWED" requires a non-empty reviewedAt field.`,
        path: ['reviewedAt']
      });
    }
  }
});

export const SingleValidationCorpusSchema = z.object({
  metadata: CorpusMetadataSchema,
  cases: z.array(ScholarlyValidationCaseSchema)
}).superRefine((data, ctx) => {
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

export function validateCorpusManifest(data: unknown): CorpusManifest {
  return CorpusManifestSchema.parse(data) as CorpusManifest;
}

export function validateReleaseTarget(target: unknown): 'PILOT' | 'RC' {
  return ReleaseTargetSchema.parse(target);
}

// Exact production BibliographyFieldPath validation:
// title | containerTitle | authors.<n>.literal | editors.<n>.literal | translators.<n>.literal | publisher | place
export function isValidBibliographyFieldPath(fieldPath: string): boolean {
  if (
    fieldPath === 'title' ||
    fieldPath === 'containerTitle' ||
    fieldPath === 'publisher' ||
    fieldPath === 'place'
  ) {
    return true;
  }

  const creatorMatch = fieldPath.match(/^(authors|editors|translators)\.(\d+)\.literal$/);
  if (creatorMatch) {
    return true;
  }

  return false;
}

// Strict concrete bibliography fixture schemas
export const BibliographyCreatorSchema = z.object({
  literal: z.string().min(1),
  given: z.string().optional(),
  family: z.string().optional()
});

export const BibliographySourceCellSchema = z.object({
  header: z.string(),
  value: z.string()
});

export const BibliographyRecordSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['BOOK', 'JOURNAL_ARTICLE', 'BOOK_CHAPTER', 'THESIS', 'OTHER']),
  title: z.string(),
  containerTitle: z.string().optional(),
  authors: z.array(BibliographyCreatorSchema),
  editors: z.array(BibliographyCreatorSchema),
  translators: z.array(BibliographyCreatorSchema),
  year: z.string().optional(),
  publisher: z.string().optional(),
  place: z.string().optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  pageStart: z.string().optional(),
  pageEnd: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  isbn: z.string().optional(),
  issn: z.string().optional(),
  language: z.string().optional(),
  notes: z.string().optional(),
  sourceRowIndex: z.number().int().nonnegative(),
  sourceColumns: z.array(BibliographySourceCellSchema),
  passthrough: z.record(z.string())
});

export const AssistanceDecisionMetadataSchema = z.object({
  suggestionId: z.string().min(1, 'suggestionId must not be empty'),
  provider: z.string().min(1, 'provider must not be empty'),
  model: z.string().min(1, 'model must not be empty'),
  promptVersion: z.string().min(1, 'promptVersion must not be empty'),
  requestFingerprint: z.string().min(1, 'requestFingerprint must not be empty')
});

export const ReviewDecisionSchema = z.discriminatedUnion('action', [
  z.object({
    issueId: z.string().min(1, 'issueId must not be empty'),
    action: z.literal('SELECT_LEXICAL_READING'),
    selectedAlternativeId: z.string().min(1, 'selectedAlternativeId required for SELECT_LEXICAL_READING'),
    manualCanonicalTransliteration: z.undefined().optional(),
    note: z.string().optional(),
    assistance: AssistanceDecisionMetadataSchema.optional()
  }),
  z.object({
    issueId: z.string().min(1, 'issueId must not be empty'),
    action: z.literal('MANUAL_CANONICAL_OVERRIDE'),
    manualCanonicalTransliteration: z.string().min(1, 'manualCanonicalTransliteration required for MANUAL_CANONICAL_OVERRIDE'),
    selectedAlternativeId: z.undefined().optional(),
    note: z.string().optional(),
    assistance: AssistanceDecisionMetadataSchema.optional()
  }),
  z.object({
    issueId: z.string().min(1, 'issueId must not be empty'),
    action: z.literal('ACCEPT_IZAFAT'),
    selectedAlternativeId: z.undefined().optional(),
    manualCanonicalTransliteration: z.undefined().optional(),
    note: z.string().optional(),
    assistance: AssistanceDecisionMetadataSchema.optional()
  }),
  z.object({
    issueId: z.string().min(1, 'issueId must not be empty'),
    action: z.literal('REJECT_IZAFAT'),
    selectedAlternativeId: z.undefined().optional(),
    manualCanonicalTransliteration: z.undefined().optional(),
    note: z.string().optional(),
    assistance: AssistanceDecisionMetadataSchema.optional()
  }),
  z.object({
    issueId: z.string().min(1, 'issueId must not be empty'),
    action: z.literal('SELECT_MORPHOLOGY'),
    selectedAlternativeId: z.string().min(1, 'selectedAlternativeId required for SELECT_MORPHOLOGY'),
    manualCanonicalTransliteration: z.undefined().optional(),
    note: z.string().optional(),
    assistance: AssistanceDecisionMetadataSchema.optional()
  })
]);

export const BibliographyValidationDecisionFixtureSchema = z.object({
  recordId: z.string().min(1, 'Record ID must not be empty'),
  fieldPath: z.string().superRefine((path, ctx) => {
    if (!isValidBibliographyFieldPath(path)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid bibliography fieldPath "${path}". Must be an exact supported BibliographyFieldPath.`
      });
    }
  }),
  decision: ReviewDecisionSchema
});

export const BibliographyValidationFieldExpectationSchema = z.object({
  finalText: z.string().min(1).optional(),
  disposition: z.enum(['FINAL', 'REVIEW_REQUIRED', 'UNRESOLVED', 'PASSTHROUGH'])
}).superRefine((data, ctx) => {
  if (data.disposition === 'FINAL' || data.disposition === 'PASSTHROUGH') {
    if (!data.finalText || data.finalText.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Field with disposition "${data.disposition}" must specify a non-empty "finalText".`
      });
    }
  }
  if (data.disposition === 'REVIEW_REQUIRED' || data.disposition === 'UNRESOLVED') {
    if (data.finalText !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Field with disposition "${data.disposition}" should not specify "finalText".`
      });
    }
  }
});

export const BibliographyValidationCaseSchema = z.object({
  id: z.string().min(1),
  record: BibliographyRecordSchema,
  reviewDecisions: z.array(BibliographyValidationDecisionFixtureSchema).optional(),
  expected: z.object({
    readiness: z.enum(['READY', 'REVIEW_REQUIRED', 'INVALID']),
    fields: z.record(
      z.string().superRefine((path, ctx) => {
        if (!isValidBibliographyFieldPath(path)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid bibliography expected fieldPath "${path}". Must be an exact supported BibliographyFieldPath.`
          });
        }
      }),
      BibliographyValidationFieldExpectationSchema
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

export function validateBibliographyCase(data: unknown): BibliographyValidationCase {
  return BibliographyValidationCaseSchema.parse(data) as BibliographyValidationCase;
}
