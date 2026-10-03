import { z } from 'zod';
import { validateManualTransliteration } from '../review/validation';
import { generateSuggestionId, computeRequestFingerprint } from './suggestionIdentity';
import {
  AssistedCandidate,
  AssistedResolution,
  AssistedResolverRequest,
  ExistingLexicalReadingProposal,
  ManualCanonicalProposal,
  IzafatDecisionProposal,
  MorphologyBranchProposal
} from './types';

export const existingLexicalReadingProposalSchema = z.object({
  kind: z.literal('EXISTING_LEXICAL_READING'),
  alternativeId: z.string().min(1),
  canonical: z.string().nullable().optional(),
  rank: z.number().int().min(1).max(5),
  modelConfidence: z.number().min(0.0).max(1.0).nullable().optional(),
  rationale: z.string().min(1).max(1000),
  basis: z.enum(['EXISTING_EVIDENCE', 'CONTEXTUAL_INFERENCE', 'MODEL_INFERENCE']),
  evidenceRefs: z.array(z.string())
}).strict();

export const manualCanonicalProposalSchema = z.object({
  kind: z.literal('MANUAL_CANONICAL'),
  canonical: z.string().min(1),
  rank: z.number().int().min(1).max(5),
  modelConfidence: z.number().min(0.0).max(1.0).nullable().optional(),
  rationale: z.string().min(1).max(1000),
  basis: z.enum(['EXISTING_EVIDENCE', 'CONTEXTUAL_INFERENCE', 'MODEL_INFERENCE']),
  evidenceRefs: z.array(z.string())
}).strict();

export const izafatDecisionProposalSchema = z.object({
  kind: z.literal('IZAFAT_DECISION'),
  relationDecision: z.enum(['ACCEPT_IZAFAT', 'REJECT_IZAFAT']),
  rank: z.number().int().min(1).max(5),
  modelConfidence: z.number().min(0.0).max(1.0).nullable().optional(),
  rationale: z.string().min(1).max(1000),
  basis: z.enum(['EXISTING_EVIDENCE', 'CONTEXTUAL_INFERENCE', 'MODEL_INFERENCE']),
  evidenceRefs: z.array(z.string())
}).strict();

export const morphologyBranchProposalSchema = z.object({
  kind: z.literal('MORPHOLOGY_BRANCH'),
  morphologyBranch: z.enum(['WHOLE_WORD', 'PRODUCTIVE_SEGMENTATION']),
  rank: z.number().int().min(1).max(5),
  modelConfidence: z.number().min(0.0).max(1.0).nullable().optional(),
  rationale: z.string().min(1).max(1000),
  basis: z.enum(['EXISTING_EVIDENCE', 'CONTEXTUAL_INFERENCE', 'MODEL_INFERENCE']),
  evidenceRefs: z.array(z.string())
}).strict();

export const rawCandidateSchema = z.discriminatedUnion('kind', [
  existingLexicalReadingProposalSchema,
  manualCanonicalProposalSchema,
  izafatDecisionProposalSchema,
  morphologyBranchProposalSchema
]);

export const rawProviderResponseSchema = z.object({
  issueId: z.string().min(1),
  candidates: z.array(rawCandidateSchema).max(5),
  warnings: z.array(z.string()).nullable().optional()
}).strict();

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

  // 1. Zod structural schema parsing (Discriminated union & strict objects)
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

  // 4. Candidate authority, semantic consistency, and safety validation
  const validatedCandidates: AssistedCandidate[] = [];
  const allowedAltMap = new Map(request.availableAlternatives.map((a) => [a.id, a]));
  const allowedEvidenceSet = new Set(request.allowedEvidenceRefs);
  const allowedActionsSet = new Set(request.allowedActions);

  const seenSemanticPayloads = new Set<string>();
  const seenSuggestionIds = new Set<string>();

  for (const c of payload.candidates) {
    // A. Evidence refs authorization check
    for (const ref of c.evidenceRefs) {
      if (!allowedEvidenceSet.has(ref)) {
        errors.push(`Candidate with rank ${c.rank} references unauthorized evidenceRef "${ref}".`);
      }
    }

    // B. Action authorization and kind-specific constraints
    if (c.kind === 'EXISTING_LEXICAL_READING') {
      if (!allowedActionsSet.has('SELECT_LEXICAL_READING')) {
        errors.push(`Action "SELECT_LEXICAL_READING" is not permitted for issue "${request.issueId}".`);
      }

      const matchingAlt = allowedAltMap.get(c.alternativeId);
      if (!matchingAlt) {
        errors.push(`Candidate with rank ${c.rank} references non-existent alternativeId "${c.alternativeId}".`);
      } else {
        // Enforce strict consistency: if canonical is provided, it must equal the alternative's canonical
        if (c.canonical && matchingAlt.canonical && c.canonical !== matchingAlt.canonical) {
          errors.push(
            `Candidate with rank ${c.rank} has contradictory canonical "${c.canonical}" for alternative "${c.alternativeId}" (expected "${matchingAlt.canonical}").`
          );
        }

        const canonical = matchingAlt.canonical ?? (c.canonical || undefined) ?? matchingAlt.label;
        const semanticKey = `EXISTING_LEXICAL_READING:${c.alternativeId}`;
        if (seenSemanticPayloads.has(semanticKey)) {
          errors.push(`Duplicate semantic candidate detected for alternative "${c.alternativeId}".`);
        }
        seenSemanticPayloads.add(semanticKey);

        const id = generateSuggestionId(request.issueId, provider, model, request.promptVersion, c);
        if (seenSuggestionIds.has(id)) {
          errors.push(`Duplicate suggestion ID "${id}" detected.`);
        }
        seenSuggestionIds.add(id);

        validatedCandidates.push({
          id,
          kind: 'EXISTING_LEXICAL_READING',
          alternativeId: c.alternativeId,
          canonical,
          rank: c.rank,
          modelConfidence: c.modelConfidence ?? undefined,
          rationale: c.rationale,
          basis: c.basis,
          evidenceRefs: c.evidenceRefs
        });
      }
    } else if (c.kind === 'MANUAL_CANONICAL') {
      if (!allowedActionsSet.has('MANUAL_CANONICAL_OVERRIDE')) {
        errors.push(`Action "MANUAL_CANONICAL_OVERRIDE" is not permitted for issue "${request.issueId}".`);
      }

      const validation = validateManualTransliteration(c.canonical);
      if (!validation.valid || !validation.normalized) {
        errors.push(`Manual canonical transliteration "${c.canonical}" failed safety validation: ${validation.error}`);
      } else {
        const semanticKey = `MANUAL_CANONICAL:${validation.normalized}`;
        if (seenSemanticPayloads.has(semanticKey)) {
          errors.push(`Duplicate semantic candidate detected for canonical "${validation.normalized}".`);
        }
        seenSemanticPayloads.add(semanticKey);

        const id = generateSuggestionId(request.issueId, provider, model, request.promptVersion, c);
        if (seenSuggestionIds.has(id)) {
          errors.push(`Duplicate suggestion ID "${id}" detected.`);
        }
        seenSuggestionIds.add(id);

        validatedCandidates.push({
          id,
          kind: 'MANUAL_CANONICAL',
          canonical: validation.normalized,
          rank: c.rank,
          modelConfidence: c.modelConfidence ?? undefined,
          rationale: c.rationale,
          basis: c.basis,
          evidenceRefs: c.evidenceRefs
        });
      }
    } else if (c.kind === 'IZAFAT_DECISION') {
      if (!allowedActionsSet.has(c.relationDecision)) {
        errors.push(`Action "${c.relationDecision}" is not permitted for issue "${request.issueId}".`);
      }

      const semanticKey = `IZAFAT_DECISION:${c.relationDecision}`;
      if (seenSemanticPayloads.has(semanticKey)) {
        errors.push(`Duplicate semantic candidate detected for izāfat decision "${c.relationDecision}".`);
      }
      seenSemanticPayloads.add(semanticKey);

      const id = generateSuggestionId(request.issueId, provider, model, request.promptVersion, c);
      if (seenSuggestionIds.has(id)) {
        errors.push(`Duplicate suggestion ID "${id}" detected.`);
      }
      seenSuggestionIds.add(id);

      validatedCandidates.push({
        id,
        kind: 'IZAFAT_DECISION',
        relationDecision: c.relationDecision,
        rank: c.rank,
        modelConfidence: c.modelConfidence ?? undefined,
        rationale: c.rationale,
        basis: c.basis,
        evidenceRefs: c.evidenceRefs
      });
    } else if (c.kind === 'MORPHOLOGY_BRANCH') {
      if (!allowedActionsSet.has('SELECT_MORPHOLOGY')) {
        errors.push(`Action "SELECT_MORPHOLOGY" is not permitted for issue "${request.issueId}".`);
      }

      const matchingAlt = allowedAltMap.get(c.morphologyBranch);
      if (!matchingAlt) {
        errors.push(
          `Morphology branch "${c.morphologyBranch}" is not among available alternatives for issue "${request.issueId}".`
        );
      } else {
        const semanticKey = `MORPHOLOGY_BRANCH:${c.morphologyBranch}`;
        if (seenSemanticPayloads.has(semanticKey)) {
          errors.push(`Duplicate semantic candidate detected for morphology branch "${c.morphologyBranch}".`);
        }
        seenSemanticPayloads.add(semanticKey);

        const id = generateSuggestionId(request.issueId, provider, model, request.promptVersion, c);
        if (seenSuggestionIds.has(id)) {
          errors.push(`Duplicate suggestion ID "${id}" detected.`);
        }
        seenSuggestionIds.add(id);

        validatedCandidates.push({
          id,
          kind: 'MORPHOLOGY_BRANCH',
          morphologyBranch: c.morphologyBranch,
          canonical: matchingAlt.canonical,
          rank: c.rank,
          modelConfidence: c.modelConfidence ?? undefined,
          rationale: c.rationale,
          basis: c.basis,
          evidenceRefs: c.evidenceRefs
        });
      }
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }

  // Deterministically sort candidates by rank
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
      warnings: (payload.warnings || undefined) ?? []
    },
    errors: []
  };
}
