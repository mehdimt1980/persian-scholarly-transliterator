import { z } from 'zod';
import { containsArabicScript } from '../../domain/bibliography/scriptDetection';
import {
  ReviewIssueTypeSchema,
  ScholarlyCategorySchema,
  ValidationExpectedDispositionSchema,
  ValidationProvenanceSchema
} from '../schema';
import {
  ScholarlyValidationCaseV2,
  ScholarlyValidationExpectationV2,
  SingleValidationCorpusV2
} from './types';

function validateTransliterationString(
  val: string,
  ctx: z.RefinementCtx,
  path: (string | number)[],
  id: string,
  fieldName: string
): void {
  if (val.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Case "${id}" contains an empty ${fieldName} string.`,
      path
    });
    return;
  }
  if (val.trim() !== val) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Case "${id}" ${fieldName} string "${val}" contains accidental leading or trailing whitespace.`,
      path
    });
  }
  if (containsArabicScript(val)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Case "${id}" specifies a ${fieldName} containing Persian/Arabic script instead of Latin IJMES transliteration: "${val}".`,
      path
    });
  }
}

export const ScholarlyValidationExpectationV2Schema = z.object({
  disposition: ValidationExpectedDispositionSchema,
  scholarlyCanonical: z.string().optional(),
  allowedScholarlyCanonicals: z.array(z.string()).optional(),
  renderedOutput: z.string().optional(),
  allowedRenderedOutputs: z.array(z.string()).optional(),
  requiredIssueTypes: z.array(ReviewIssueTypeSchema).optional(),
  forbiddenIssueTypes: z.array(ReviewIssueTypeSchema).optional()
});

export const ScholarlyValidationCaseV2Schema = z.object({
  id: z.string().min(1, 'Case ID must not be empty'),
  input: z.string().min(1, 'Input must not be empty'),
  profile: z.enum(['ijmes_full', 'ijmes_title']),
  category: ScholarlyCategorySchema,
  expected: ScholarlyValidationExpectationV2Schema,
  provenance: ValidationProvenanceSchema,
  tags: z.array(z.string()).optional()
}).superRefine((data, ctx) => {
  const isFinal = data.expected.disposition === 'FINAL';

  const hasCanonical = data.expected.scholarlyCanonical !== undefined;
  const hasAllowedCanonical =
    data.expected.allowedScholarlyCanonicals !== undefined &&
    data.expected.allowedScholarlyCanonicals.length > 0;

  const hasRendered = data.expected.renderedOutput !== undefined;
  const hasAllowedRendered =
    data.expected.allowedRenderedOutputs !== undefined &&
    data.expected.allowedRenderedOutputs.length > 0;

  if (isFinal) {
    if (!hasCanonical && !hasAllowedCanonical) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" has disposition "FINAL" but does not specify a scholarlyCanonical or allowedScholarlyCanonicals.`,
        path: ['expected']
      });
    }

    if (hasCanonical && hasAllowedCanonical) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" specifies both scholarlyCanonical and allowedScholarlyCanonicals. Specify only one.`,
        path: ['expected']
      });
    }

    if (data.expected.scholarlyCanonical !== undefined) {
      validateTransliterationString(
        data.expected.scholarlyCanonical,
        ctx,
        ['expected', 'scholarlyCanonical'],
        data.id,
        'scholarlyCanonical'
      );
    }

    if (data.expected.allowedScholarlyCanonicals !== undefined) {
      const seen = new Set<string>();
      for (let i = 0; i < data.expected.allowedScholarlyCanonicals.length; i++) {
        const can = data.expected.allowedScholarlyCanonicals[i];
        validateTransliterationString(
          can,
          ctx,
          ['expected', 'allowedScholarlyCanonicals', i],
          data.id,
          'allowedScholarlyCanonicals'
        );
        if (seen.has(can)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Case "${data.id}" contains duplicate allowedScholarlyCanonical "${can}".`,
            path: ['expected', 'allowedScholarlyCanonicals', i]
          });
        }
        seen.add(can);
      }
    }

    if (!hasRendered && !hasAllowedRendered) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" has disposition "FINAL" but does not specify a renderedOutput or allowedRenderedOutputs.`,
        path: ['expected']
      });
    }

    if (hasRendered && hasAllowedRendered) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" specifies both renderedOutput and allowedRenderedOutputs. Specify only one.`,
        path: ['expected']
      });
    }

    if (data.expected.renderedOutput !== undefined) {
      validateTransliterationString(
        data.expected.renderedOutput,
        ctx,
        ['expected', 'renderedOutput'],
        data.id,
        'renderedOutput'
      );
    }

    if (data.expected.allowedRenderedOutputs !== undefined) {
      const seen = new Set<string>();
      for (let i = 0; i < data.expected.allowedRenderedOutputs.length; i++) {
        const ren = data.expected.allowedRenderedOutputs[i];
        validateTransliterationString(
          ren,
          ctx,
          ['expected', 'allowedRenderedOutputs', i],
          data.id,
          'allowedRenderedOutputs'
        );
        if (seen.has(ren)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Case "${data.id}" contains duplicate allowedRenderedOutput "${ren}".`,
            path: ['expected', 'allowedRenderedOutputs', i]
          });
        }
        seen.add(ren);
      }
    }
  } else {
    if (hasCanonical) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" has disposition "${data.expected.disposition}" but specifies an authoritative scholarlyCanonical.`,
        path: ['expected', 'scholarlyCanonical']
      });
    }
    if (hasAllowedCanonical) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" has disposition "${data.expected.disposition}" but specifies allowedScholarlyCanonicals.`,
        path: ['expected', 'allowedScholarlyCanonicals']
      });
    }
    if (hasRendered) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" has disposition "${data.expected.disposition}" but specifies an authoritative renderedOutput.`,
        path: ['expected', 'renderedOutput']
      });
    }
    if (hasAllowedRendered) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Case "${data.id}" has disposition "${data.expected.disposition}" but specifies allowedRenderedOutputs.`,
        path: ['expected', 'allowedRenderedOutputs']
      });
    }
  }
});

export const ValidationV2CorpusMetadataSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  tier: z.enum(['PILOT', 'REAL_DISSERTATION', 'EXTERNAL_BENCHMARK']),
  reviewStatus: z.enum([
    'SOURCE_BACKED_FIXTURE',
    'AI_SPECIALIST_REVIEWED_PENDING_HUMAN',
    'HUMAN_REVIEWED'
  ]),
  reviewer: z.string().optional(),
  reviewedAt: z.string().optional(),
  reviewNote: z.string().optional()
}).superRefine((data, ctx) => {
  if (data.reviewStatus === 'HUMAN_REVIEWED') {
    if (!data.reviewer || data.reviewer.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Corpus reviewStatus is HUMAN_REVIEWED but reviewer field is missing or empty.',
        path: ['reviewer']
      });
    }
    if (!data.reviewedAt || data.reviewedAt.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Corpus reviewStatus is HUMAN_REVIEWED but reviewedAt field is missing or empty.',
        path: ['reviewedAt']
      });
    }
  }

  if (data.reviewStatus === 'AI_SPECIALIST_REVIEWED_PENDING_HUMAN') {
    if (!data.reviewer || data.reviewer.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Corpus reviewStatus is AI_SPECIALIST_REVIEWED_PENDING_HUMAN but reviewer field is missing or empty.',
        path: ['reviewer']
      });
    } else if (!data.reviewer.includes('AI_SPECIALIST')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AI-specialist-reviewed corpus reviewer must explicitly identify AI_SPECIALIST provenance.',
        path: ['reviewer']
      });
    }
    if (!data.reviewedAt || data.reviewedAt.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Corpus reviewStatus is AI_SPECIALIST_REVIEWED_PENDING_HUMAN but reviewedAt field is missing or empty.',
        path: ['reviewedAt']
      });
    }
  }
});

export const SingleValidationCorpusV2Schema = z.object({
  schemaVersion: z.literal(2),
  metadata: ValidationV2CorpusMetadataSchema,
  cases: z.array(ScholarlyValidationCaseV2Schema)
}).superRefine((data, ctx) => {
  const seenIds = new Set<string>();
  data.cases.forEach((c, index) => {
    if (seenIds.has(c.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate case id "${c.id}" at index ${index}`,
        path: ['cases', index, 'id']
      });
    }
    seenIds.add(c.id);
  });
});

export function validateSingleCaseV2(data: unknown): ScholarlyValidationCaseV2 {
  return ScholarlyValidationCaseV2Schema.parse(data);
}

export function validateSingleValidationCorpusV2(data: unknown): SingleValidationCorpusV2 {
  return SingleValidationCorpusV2Schema.parse(data);
}
