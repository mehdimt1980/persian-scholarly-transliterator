import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { handlePhraseAssistRequest } from './handlePhraseAssistRequest';
import { FakePhraseResolverProvider } from './phraseProvider';
import type { PhraseResolverRequest } from '../../domain/assistance';

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/assist/phrase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('phrase assistance server boundary', () => {
  it('recomputes authoritative phrase evidence server-side before invoking provider', async () => {
    let seen: PhraseResolverRequest | null = null;
    const provider = new FakePhraseResolverProvider((request) => {
      seen = request;
      return {
        disposition: 'PROPOSED',
        scholarlyCanonical: 'alpha beta',
        renderedOutput: 'Alpha Beta',
        confidence: 0.77,
        basis: 'CONTEXTUAL_INFERENCE',
        rationale: 'Synthetic phrase proposal for server-boundary testing.',
        assumptions: ['Synthetic mechanics-only assumption.'],
        tokenReadings: [],
        warnings: []
      };
    });

    const response = await handlePhraseAssistRequest(
      jsonRequest({
        input: 'واژه دیگر',
        profile: 'ijmes_title',
        reviewDecisions: []
      }),
      provider
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.resolution.scholarlyCanonical).toBe('alpha beta');
    expect(seen).not.toBeNull();
    expect(seen!.originalInput).toBe('واژه دیگر');
    expect(seen!.reviewIssues.length).toBeGreaterThan(0);
    expect(seen!.tokenEvidence.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects client-injected evidence fields through strict request parsing', async () => {
    let providerCalled = false;
    const provider = new FakePhraseResolverProvider(() => {
      providerCalled = true;
      return {
        disposition: 'REVIEW_REQUIRED',
        scholarlyCanonical: null,
        renderedOutput: null,
        confidence: null,
        basis: 'MODEL_INFERENCE',
        rationale: 'Should never be called.',
        assumptions: ['Should never be called.'],
        tokenReadings: [],
        warnings: []
      };
    });

    const response = await handlePhraseAssistRequest(
      jsonRequest({
        input: 'واژه دیگر',
        profile: 'ijmes_title',
        reviewDecisions: [],
        tokenEvidence: [{ surface: 'injected', status: 'DETERMINISTIC' }]
      }),
      provider
    );

    expect(response.status).toBe(400);
    expect(providerCalled).toBe(false);
  });

  it('does not call AI when deterministic output is already authoritative and copyable', async () => {
    let providerCalled = false;
    const provider = new FakePhraseResolverProvider(() => {
      providerCalled = true;
      return {
        disposition: 'PROPOSED',
        scholarlyCanonical: 'should not happen',
        renderedOutput: 'Should Not Happen',
        confidence: 1,
        basis: 'MODEL_INFERENCE',
        rationale: 'Should not be called.',
        assumptions: [],
        tokenReadings: [],
        warnings: []
      };
    });

    const response = await handlePhraseAssistRequest(
      jsonRequest({
        input: 'کتاب‌ها',
        profile: 'ijmes_full',
        reviewDecisions: []
      }),
      provider
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.error).toBe('PHRASE_ASSISTANCE_NOT_NEEDED');
    expect(providerCalled).toBe(false);
  });

  it('sanitizes provider errors instead of returning upstream details', async () => {
    const provider = {
      providerName: 'fake-provider',
      modelName: 'fake-model',
      async resolve() {
        throw new Error('sensitive-provider-detail-sk-123');
      }
    };

    const response = await handlePhraseAssistRequest(
      jsonRequest({
        input: 'واژه دیگر',
        profile: 'ijmes_title',
        reviewDecisions: []
      }),
      provider
    );

    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.error).toBe('ASSISTANCE_PROVIDER_ERROR');
    expect(JSON.stringify(payload)).not.toContain('sensitive-provider-detail-sk-123');
  });
});
