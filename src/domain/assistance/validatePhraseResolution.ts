import { z } from 'zod';
import { validateManualTransliteration } from '../review/validation';
import { computePhraseRequestFingerprint } from './phraseIdentity';
import type {
  PhraseResolution,
  PhraseResolverRequest,
  RawPhraseResolutionPayload
} from './phraseTypes';

const phraseTokenReadingSchema = z.object({
  surface: z.string().min(1).max(200),
  canonical: z.string().min(1).max(300),
  note: z.string().min(1).max(500)
}).strict();

export const rawPhraseProviderResponseSchema = z.object({
  disposition: z.enum(['PROPOSED', 'REVIEW_REQUIRED']),
  scholarlyCanonical: z.string().min(1).max(2000).nullable(),
  renderedOutput: z.string().min(1).max(2000).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  basis: z.enum(['CONTEXTUAL_INFERENCE', 'MODEL_INFERENCE', 'MIXED']),
  rationale: z.string().min(1).max(1600),
  assumptions: z.array(z.string().min(1).max(500)).max(12),
  tokenReadings: z.array(phraseTokenReadingSchema).max(64),
  warnings: z.array(z.string().min(1).max(500)).max(12).nullable().optional()
}).strict();

export interface PhraseResolutionValidationResult {
  valid: boolean;
  resolution?: PhraseResolution;
  errors: string[];
}

function validateLatinTransliteration(value: string, label: string, errors: string[]): string | null {
  const validation = validateManualTransliteration(value);
  if (!validation.valid || !validation.normalized) {
    errors.push(`${label} failed transliteration safety validation: ${validation.error}`);
    return null;
  }
  return validation.normalized;
}

export function validatePhraseProviderResolution(
  raw: unknown,
  request: PhraseResolverRequest,
  provider: string,
  model: string
): PhraseResolutionValidationResult {
  const parsed = rawPhraseProviderResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.errors.map((error) => `${error.path.join('.')}: ${error.message}`)
    };
  }

  const payload: RawPhraseResolutionPayload = parsed.data;
  const errors: string[] = [];

  let scholarlyCanonical: string | null = null;
  let renderedOutput: string | null = null;

  if (payload.disposition === 'PROPOSED') {
    if (!payload.scholarlyCanonical || !payload.renderedOutput) {
      errors.push('PROPOSED phrase resolution requires both scholarlyCanonical and renderedOutput.');
    } else {
      scholarlyCanonical = validateLatinTransliteration(
        payload.scholarlyCanonical,
        'scholarlyCanonical',
        errors
      );
      renderedOutput = validateLatinTransliteration(
        payload.renderedOutput,
        'renderedOutput',
        errors
      );
    }
  } else {
    if (payload.scholarlyCanonical !== null || payload.renderedOutput !== null) {
      errors.push('REVIEW_REQUIRED phrase resolution must not expose authoritative canonical or rendered output.');
    }
  }

  const allowedSurfaces = new Set(request.tokenEvidence.map((token) => token.surface));
  const seenSurfaces = new Set<string>();
  const tokenReadings = payload.tokenReadings.map((reading, index) => {
    if (!allowedSurfaces.has(reading.surface)) {
      errors.push(`tokenReadings.${index}.surface references a token not present in the authoritative request.`);
    }
    if (seenSurfaces.has(reading.surface)) {
      errors.push(`Duplicate token reading for surface "${reading.surface}".`);
    }
    seenSurfaces.add(reading.surface);

    const canonical = validateLatinTransliteration(
      reading.canonical,
      `tokenReadings.${index}.canonical`,
      errors
    );

    return {
      surface: reading.surface,
      canonical: canonical ?? reading.canonical,
      note: reading.note.trim()
    };
  });

  if (payload.disposition === 'REVIEW_REQUIRED' && payload.assumptions.length === 0 && (payload.warnings ?? []).length === 0) {
    errors.push('REVIEW_REQUIRED phrase resolution must explain the blocking ambiguity through assumptions or warnings.');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }

  return {
    valid: true,
    resolution: {
      disposition: payload.disposition,
      scholarlyCanonical,
      renderedOutput,
      confidence: payload.confidence,
      basis: payload.basis,
      rationale: payload.rationale.trim(),
      assumptions: payload.assumptions.map((item) => item.trim()),
      tokenReadings,
      warnings: (payload.warnings ?? []).map((item) => item.trim()),
      provider,
      model,
      promptVersion: request.promptVersion,
      requestFingerprint: computePhraseRequestFingerprint(request, provider, model)
    },
    errors: []
  };
}
