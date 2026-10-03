import { z } from 'zod';
import { validateManualTransliteration } from '../review/validation';
import { generateSuggestionId, computeRequestFingerprint } from './suggestionIdentity';
import { AssistedCandidate, AssistedResolution, AssistedResolverRequest } from './types';

export const rawCandidateSchema = z.object({
  kind: z.enum(['EXISTING_LEXICAL_READING', 'MANUAL_CANONICAL', 'IZAFAT_DECISION', 'MORPHOLOGY_BRANCH']),
  canonical: z.string().optional(),
  alternativeId: z.string().optional(),
  relationDecision: z.enum(['ACCEPT_IZAFAT', 'REJECT_IZAFAT']).optional(),
  morphologyBranch: z.enum(['WHOLE_WORD', 'PRODUCTIVE_SEGMENTATION']).optional(),
  rank: z.number().int().min(1).max(5),
  modelConfidence: z.number().min(0.0).max(1.0).optional(),
  rationale: z.string().min(1).max(1000),
  basis: z.enum(['EXISTING_EVIDENCE', 'CONTEXTUAL_INFERENCE', 'MODEL_INFERENCE']),
  evidenceRefs: z.array(z.string()).default([])
});

export const rawProviderResponseSchema = z.object({
  issueId: z.string().min(1),
  candidates: z.array(rawCandidateSchema).max(5),
  warnings: z.array(z.string()).optional()
});

export interface ValidationResult {
  valid: boolean;
  resolution?: AssistedResolution;
  errors: string[];
}

export function validateProviderResolution(
  raw: unknown,
  request: AssistedResolverRequest,
  provider: string,
  model: string
): ValidationResult {
  const errors: string[] = [];

  // 1. Zod structural parsing
  const parseResult = rawProviderResponseSchema.safeParse(raw);
  if (!parseResult.success) {
    return {
      valid: false,
      errors: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
    };
  }

  const payload = parseResult.data;

  // 2. Issue ID exact match
  if (payload.issueId !== request.issueId) {
    errors.push(`Provider returned suggestions for issueId "${payload.issueId}", expected "${request.issueId}".`);
  }

  // 3. Rank uniqueness check
  const seenRanks = new Set<number>();
  for (const c of payload.candidates) {
    if (seenRanks.has(c.rank)) {
      errors.push(`Duplicate rank ${c.rank} detected in candidate list.`);
    }
    seenRanks.add(c.rank);
  }

  // 4. Issue-type-specific candidate constraints and safety
  const validatedCandidates: AssistedCandidate[] = [];
  const allowedAltIds = new Set(request.availableAlternatives.map((a) => a.id));
  const allowedAltCanonicals = new Set(request.availableAlternatives.map((a) => a.canonical).filter(Boolean));
  const allowedEvidenceSet = new Set(request.allowedEvidenceRefs);

  for (const c of payload.candidates) {
    // Evidence refs authorization check
    for (const ref of c.evidenceRefs) {
      if (!allowedEvidenceSet.has(ref)) {
        errors.push(`Candidate with rank ${c.rank} references unauthorized evidenceRef "${ref}".`);
      }
    }

    if (request.issueType === 'LEXICAL_AMBIGUITY') {
      if (c.kind === 'EXISTING_LEXICAL_READING') {
        const matchingAltId = c.alternativeId ?? c.canonical;
        if (!matchingAltId || (!allowedAltIds.has(matchingAltId) && !allowedAltCanonicals.has(matchingAltId))) {
          errors.push(`LEXICAL_AMBIGUITY candidate must choose from existing alternatives. "${matchingAltId}" is not allowed.`);
        }
      } else if (c.kind === 'MANUAL_CANONICAL') {
        // Only permitted if manual canonical is allowed for this issue
        const validation = validateManualTransliteration(c.canonical);
        if (!validation.valid) {
          errors.push(`Manual canonical transliteration "${c.canonical}" failed safety validation: ${validation.error}`);
        }
      } else {
        errors.push(`Candidate kind "${c.kind}" is not permitted for issue type LEXICAL_AMBIGUITY.`);
      }
    } else if (request.issueType === 'UNKNOWN_TOKEN' || request.issueType === 'UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE' || request.issueType === 'UNSUPPORTED_ALLOMORPH') {
      if (c.kind !== 'MANUAL_CANONICAL') {
        errors.push(`Issue type "${request.issueType}" only accepts MANUAL_CANONICAL suggestions, got "${c.kind}".`);
      } else {
        const validation = validateManualTransliteration(c.canonical);
        if (!validation.valid) {
          errors.push(`Manual canonical transliteration "${c.canonical}" failed safety validation: ${validation.error}`);
        }
      }
    } else if (request.issueType === 'INSUFFICIENT_VOCALIZATION') {
      if (c.kind === 'EXISTING_LEXICAL_READING') {
        const matchingAltId = c.alternativeId ?? c.canonical;
        if (!matchingAltId || (!allowedAltIds.has(matchingAltId) && !allowedAltCanonicals.has(matchingAltId))) {
          errors.push(`INSUFFICIENT_VOCALIZATION existing reading candidate "${matchingAltId}" is not in available alternatives.`);
        }
      } else if (c.kind === 'MANUAL_CANONICAL') {
        const validation = validateManualTransliteration(c.canonical);
        if (!validation.valid) {
          errors.push(`Manual canonical transliteration "${c.canonical}" failed safety validation: ${validation.error}`);
        }
      } else {
        errors.push(`Candidate kind "${c.kind}" is not permitted for INSUFFICIENT_VOCALIZATION.`);
      }
    } else if (request.issueType === 'IZAFAT_CANDIDATE') {
      if (c.kind !== 'IZAFAT_DECISION' || (c.relationDecision !== 'ACCEPT_IZAFAT' && c.relationDecision !== 'REJECT_IZAFAT')) {
        errors.push(`IZAFAT_CANDIDATE issue requires IZAFAT_DECISION with ACCEPT_IZAFAT or REJECT_IZAFAT.`);
      }
    } else if (request.issueType === 'MORPHOLOGY_AMBIGUITY') {
      if (c.kind !== 'MORPHOLOGY_BRANCH' || (c.morphologyBranch !== 'WHOLE_WORD' && c.morphologyBranch !== 'PRODUCTIVE_SEGMENTATION')) {
        errors.push(`MORPHOLOGY_AMBIGUITY issue requires MORPHOLOGY_BRANCH with WHOLE_WORD or PRODUCTIVE_SEGMENTATION.`);
      }
    }

    if (errors.length === 0) {
      const id = generateSuggestionId(request.issueId, provider, model, request.promptVersion, c);
      validatedCandidates.push({
        id,
        kind: c.kind,
        canonical: c.canonical,
        alternativeId: c.alternativeId,
        relationDecision: c.relationDecision,
        morphologyBranch: c.morphologyBranch,
        rank: c.rank,
        modelConfidence: c.modelConfidence,
        rationale: c.rationale,
        basis: c.basis,
        evidenceRefs: c.evidenceRefs
      });
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }

  // Sort candidates deterministically by rank
  validatedCandidates.sort((a, b) => a.rank - b.rank);

  const requestFingerprint = computeRequestFingerprint(request, provider, model);

  return {
    valid: true,
    resolution: {
      issueId: request.issueId,
      candidates: validatedCandidates,
      provider,
      model,
      promptVersion: request.promptVersion,
      requestFingerprint,
      warnings: payload.warnings ?? []
    },
    errors: []
  };
}
