import { describe, expect, it } from 'vitest';
import { transliterate } from '../engine';
import {
  buildPhraseResolverRequest,
  checkAcceptedPhraseApplicability,
  computePhraseRequestFingerprint,
  createAcceptedPhraseDecision,
  validatePhraseProviderResolution
} from './index';

function unresolvedPhrase() {
  return transliterate('واژه دیگر', 'ijmes_title');
}

describe('context-aware phrase assistance', () => {
  it('builds a whole-phrase request from authoritative deterministic state', () => {
    const result = unresolvedPhrase();
    const request = buildPhraseResolverRequest(result);

    expect(request.originalInput).toBe('واژه دیگر');
    expect(request.normalizedInput).toBe(result.normalizedInput);
    expect(request.contextKind).toBe('BOOK_OR_ARTICLE_TITLE');
    expect(request.tokenEvidence.length).toBeGreaterThanOrEqual(2);
    expect(request.reviewIssues.length).toBe(result.reviewIssues.length);
    expect(request.reviewIssues.length).toBeGreaterThan(0);
    expect(request.deterministicCopyable).toBe(false);
  });

  it('keeps scholarly canonical and rendered output separate in a valid proposal', () => {
    const request = buildPhraseResolverRequest(unresolvedPhrase());
    const raw = {
      disposition: 'PROPOSED' as const,
      scholarlyCanonical: 'alpha beta',
      renderedOutput: 'Alpha Beta',
      confidence: 0.78,
      basis: 'CONTEXTUAL_INFERENCE' as const,
      rationale: 'Synthetic mechanics-only phrase proposal.',
      assumptions: ['Synthetic test assumption.'],
      tokenReadings: request.tokenEvidence.slice(0, 2).map((token, index) => ({
        surface: token.surface,
        canonical: index === 0 ? 'alpha' : 'beta',
        note: 'Synthetic mechanics-only token reading.'
      })),
      warnings: []
    };

    const validation = validatePhraseProviderResolution(raw, request, 'fake-provider', 'fake-model');
    expect(validation.valid).toBe(true);
    expect(validation.resolution?.scholarlyCanonical).toBe('alpha beta');
    expect(validation.resolution?.renderedOutput).toBe('Alpha Beta');
    expect(validation.resolution?.requestFingerprint).toBe(
      computePhraseRequestFingerprint(request, 'fake-provider', 'fake-model')
    );
  });

  it('rejects Persian/Arabic script in proposed Latin outputs', () => {
    const request = buildPhraseResolverRequest(unresolvedPhrase());
    const validation = validatePhraseProviderResolution(
      {
        disposition: 'PROPOSED',
        scholarlyCanonical: 'واژه alpha',
        renderedOutput: 'Alpha Beta',
        confidence: 0.5,
        basis: 'MODEL_INFERENCE',
        rationale: 'Synthetic invalid proposal.',
        assumptions: [],
        tokenReadings: [],
        warnings: []
      },
      request,
      'fake-provider',
      'fake-model'
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('Persian or Arabic script');
  });

  it('requires REVIEW_REQUIRED to remain non-authoritative', () => {
    const request = buildPhraseResolverRequest(unresolvedPhrase());
    const validation = validatePhraseProviderResolution(
      {
        disposition: 'REVIEW_REQUIRED',
        scholarlyCanonical: null,
        renderedOutput: null,
        confidence: 0.42,
        basis: 'CONTEXTUAL_INFERENCE',
        rationale: 'Context does not safely select one reading.',
        assumptions: ['Multiple materially different readings remain plausible.'],
        tokenReadings: [],
        warnings: []
      },
      request,
      'fake-provider',
      'fake-model'
    );

    expect(validation.valid).toBe(true);
    expect(validation.resolution?.scholarlyCanonical).toBeNull();
    expect(validation.resolution?.renderedOutput).toBeNull();
  });

  it('rejects token-reading surfaces not present in the authoritative request', () => {
    const request = buildPhraseResolverRequest(unresolvedPhrase());
    const validation = validatePhraseProviderResolution(
      {
        disposition: 'PROPOSED',
        scholarlyCanonical: 'alpha beta',
        renderedOutput: 'Alpha Beta',
        confidence: 0.7,
        basis: 'MODEL_INFERENCE',
        rationale: 'Synthetic invalid token mapping.',
        assumptions: [],
        tokenReadings: [
          {
            surface: 'غایب',
            canonical: 'gamma',
            note: 'Not present in request.'
          }
        ],
        warnings: []
      },
      request,
      'fake-provider',
      'fake-model'
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('not present in the authoritative request');
  });

  it('creates explicit human acceptance provenance and invalidates it when the request changes', () => {
    const result = unresolvedPhrase();
    const request = buildPhraseResolverRequest(result);
    const validation = validatePhraseProviderResolution(
      {
        disposition: 'PROPOSED',
        scholarlyCanonical: 'alpha beta',
        renderedOutput: 'Alpha Beta',
        confidence: 0.8,
        basis: 'MIXED',
        rationale: 'Synthetic proposal for acceptance mechanics.',
        assumptions: [],
        tokenReadings: [],
        warnings: []
      },
      request,
      'fake-provider',
      'fake-model'
    );

    expect(validation.valid).toBe(true);
    const resolution = validation.resolution!;
    const decision = createAcceptedPhraseDecision(
      resolution,
      result,
      'alpha beta',
      'Alpha Beta',
      '2026-10-05T00:00:00.000Z'
    );

    expect(decision.acceptance).toBe('HUMAN_ACCEPTED_AI_SUGGESTION');
    expect(checkAcceptedPhraseApplicability(decision, result).applicable).toBe(true);

    const changed = transliterate('واژه سوم', 'ijmes_title');
    const applicability = checkAcceptedPhraseApplicability(decision, changed);
    expect(applicability.applicable).toBe(false);
    expect(applicability.reason).toBe('REQUEST_CHANGED');
  });

  it('records edited AI output as human-edited provenance', () => {
    const result = unresolvedPhrase();
    const request = buildPhraseResolverRequest(result);
    const validation = validatePhraseProviderResolution(
      {
        disposition: 'PROPOSED',
        scholarlyCanonical: 'alpha beta',
        renderedOutput: 'Alpha Beta',
        confidence: 0.8,
        basis: 'MODEL_INFERENCE',
        rationale: 'Synthetic proposal.',
        assumptions: [],
        tokenReadings: [],
        warnings: []
      },
      request,
      'fake-provider',
      'fake-model'
    );

    const decision = createAcceptedPhraseDecision(
      validation.resolution!,
      result,
      'alpha beta revised',
      'Alpha Beta Revised',
      '2026-10-05T00:00:00.000Z'
    );

    expect(decision.acceptance).toBe('HUMAN_EDITED_AI_SUGGESTION');
  });
});
