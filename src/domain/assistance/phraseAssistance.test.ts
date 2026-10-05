import { describe, expect, it } from 'vitest';
import { transliterate } from '../engine';
import {
  buildPhraseResolverRequest,
  checkAcceptedPhraseApplicability,
  computePhraseRequestFingerprint,
  createAcceptedPhraseDecision,
  validatePhraseProviderResolution
} from './index';
import type { PhraseResolverRequest } from './phraseTypes';

function unresolvedPhrase() {
  return transliterate('واژه دیگر', 'ijmes_title');
}

function syntheticReadings(request: PhraseResolverRequest) {
  let unresolvedCounter = 0;
  return request.tokenEvidence
    .filter((token) => token.tokenType === 'persian-word')
    .map((token) => {
      unresolvedCounter += 1;
      return {
        tokenIndex: token.index,
        surface: token.surface,
        canonical: token.canonicalTransliteration ?? `synthetic-${unresolvedCounter}`,
        note: 'Synthetic mechanics-only token reading.'
      };
    });
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
      tokenReadings: syntheticReadings(request),
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
        tokenReadings: syntheticReadings(request),
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

  it('binds token readings to authoritative token indexes rather than surface alone', () => {
    const request = buildPhraseResolverRequest(transliterate('واژه واژه', 'ijmes_title'));
    const readings = syntheticReadings(request);

    expect(readings).toHaveLength(2);
    expect(readings[0].surface).toBe(readings[1].surface);
    expect(readings[0].tokenIndex).not.toBe(readings[1].tokenIndex);

    const validation = validatePhraseProviderResolution(
      {
        disposition: 'PROPOSED',
        scholarlyCanonical: 'alpha alpha',
        renderedOutput: 'Alpha Alpha',
        confidence: 0.7,
        basis: 'MODEL_INFERENCE',
        rationale: 'Synthetic repeated-token mechanics test.',
        assumptions: [],
        tokenReadings: readings,
        warnings: []
      },
      request,
      'fake-provider',
      'fake-model'
    );

    expect(validation.valid).toBe(true);
  });

  it('rejects token-reading indexes or surfaces that do not match authoritative tokens', () => {
    const request = buildPhraseResolverRequest(unresolvedPhrase());
    const readings = syntheticReadings(request);
    readings[0] = {
      ...readings[0],
      surface: 'غایب'
    };

    const validation = validatePhraseProviderResolution(
      {
        disposition: 'PROPOSED',
        scholarlyCanonical: 'alpha beta',
        renderedOutput: 'Alpha Beta',
        confidence: 0.7,
        basis: 'MODEL_INFERENCE',
        rationale: 'Synthetic invalid token mapping.',
        assumptions: [],
        tokenReadings: readings,
        warnings: []
      },
      request,
      'fake-provider',
      'fake-model'
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('does not match authoritative token');
  });

  it('requires a PROPOSED resolution to explain every Persian-word token', () => {
    const request = buildPhraseResolverRequest(unresolvedPhrase());
    const validation = validatePhraseProviderResolution(
      {
        disposition: 'PROPOSED',
        scholarlyCanonical: 'alpha beta',
        renderedOutput: 'Alpha Beta',
        confidence: 0.7,
        basis: 'MODEL_INFERENCE',
        rationale: 'Synthetic incomplete token mapping.',
        assumptions: [],
        tokenReadings: syntheticReadings(request).slice(0, 1),
        warnings: []
      },
      request,
      'fake-provider',
      'fake-model'
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('must explain every Persian-word token');
  });

  it('does not allow phrase assistance to contradict deterministic canonical token evidence', () => {
    const request = buildPhraseResolverRequest(transliterate('کتاب‌ها واژه', 'ijmes_full'));
    const readings = syntheticReadings(request);
    const resolvedIndex = readings.findIndex((reading) => {
      const token = request.tokenEvidence.find((item) => item.index === reading.tokenIndex);
      return Boolean(token?.canonicalTransliteration);
    });
    expect(resolvedIndex).toBeGreaterThanOrEqual(0);
    readings[resolvedIndex] = {
      ...readings[resolvedIndex],
      canonical: 'contradiction'
    };

    const validation = validatePhraseProviderResolution(
      {
        disposition: 'PROPOSED',
        scholarlyCanonical: 'synthetic phrase',
        renderedOutput: 'synthetic phrase',
        confidence: 0.6,
        basis: 'MIXED',
        rationale: 'Synthetic deterministic-conflict test.',
        assumptions: [],
        tokenReadings: readings,
        warnings: []
      },
      request,
      'fake-provider',
      'fake-model'
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('conflicts with deterministic canonical evidence');
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
        tokenReadings: syntheticReadings(request),
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
        tokenReadings: syntheticReadings(request),
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
