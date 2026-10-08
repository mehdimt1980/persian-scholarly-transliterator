import { z } from 'zod';
import { renderCanonicalForProfile } from '../profiles';
import { validateManualTransliteration } from '../review/validation';
import { computePhraseRequestFingerprint } from './phraseIdentity';
import type {
  PhraseResolution,
  PhraseResolverRequest,
  RawPhraseResolutionPayload
} from './phraseTypes';

const phraseTokenReadingSchema = z.object({
  tokenIndex: z.number().int().min(0),
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
    if (!payload.scholarlyCanonical) {
      errors.push('PROPOSED phrase resolution requires scholarlyCanonical.');
    } else {
      scholarlyCanonical = validateLatinTransliteration(
        payload.scholarlyCanonical,
        'scholarlyCanonical',
        errors
      );
      if (scholarlyCanonical) {
        renderedOutput = renderCanonicalForProfile(scholarlyCanonical, request.profile);
      }
    }
  } else if (payload.disposition === 'REVIEW_REQUIRED') {
    if (payload.scholarlyCanonical !== null) {
      scholarlyCanonical = validateLatinTransliteration(
        payload.scholarlyCanonical,
        'scholarlyCanonical',
        errors
      );
      if (scholarlyCanonical) {
        renderedOutput = renderCanonicalForProfile(scholarlyCanonical, request.profile);
      }
    }
  }

  const authoritativePersianTokens = new Map(
    request.tokenEvidence
      .filter((token) => token.tokenType === 'persian-word')
      .map((token) => [token.index, token] as const)
  );
  const seenIndexes = new Set<number>();

  const tokenReadings = payload.tokenReadings.map((reading, index) => {
    const matchingToken = authoritativePersianTokens.get(reading.tokenIndex);
    if (!matchingToken) {
      errors.push(
        `tokenReadings.${index}.tokenIndex does not reference a Persian-word token in the authoritative request.`
      );
    } else if (matchingToken.surface !== reading.surface) {
      errors.push(
        `tokenReadings.${index}.surface does not match authoritative token ${reading.tokenIndex}.`
      );
    }

    if (seenIndexes.has(reading.tokenIndex)) {
      errors.push(`Duplicate token reading for tokenIndex ${reading.tokenIndex}.`);
    }
    seenIndexes.add(reading.tokenIndex);

    const canonical = validateLatinTransliteration(
      reading.canonical,
      `tokenReadings.${index}.canonical`,
      errors
    );

    if (
      matchingToken?.canonicalTransliteration &&
      canonical &&
      canonical !== matchingToken.canonicalTransliteration
    ) {
      errors.push(
        `tokenReadings.${index}.canonical conflicts with deterministic canonical evidence for token ${reading.tokenIndex}.`
      );
    }

    return {
      tokenIndex: reading.tokenIndex,
      surface: reading.surface,
      canonical: canonical ?? reading.canonical,
      note: reading.note.trim()
    };
  });

  if (payload.disposition === 'PROPOSED') {
    const missingIndexes = [...authoritativePersianTokens.keys()].filter((index) => !seenIndexes.has(index));
    if (missingIndexes.length > 0) {
      errors.push(
        `PROPOSED phrase resolution must explain every Persian-word token; missing tokenIndexes: ${missingIndexes.join(', ')}.`
      );
    }
  }

  if (
    payload.disposition === 'REVIEW_REQUIRED' &&
    payload.assumptions.length === 0 &&
    (payload.warnings ?? []).length === 0
  ) {
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
