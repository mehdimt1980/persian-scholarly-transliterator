import { describe, expect, it, vi } from 'vitest';
import { transliterate } from '../../domain/engine';
import { buildPhraseResolverRequest } from '../../domain/assistance';
import { OpenAiPhraseResolverProvider } from './openaiPhraseProvider';

describe('OpenAiPhraseResolverProvider', () => {
  it('uses Responses API structured output with store=false and validates the returned phrase proposal', async () => {
    const deterministic = transliterate('واژه دیگر', 'ijmes_citation_title');
    const request = buildPhraseResolverRequest(deterministic);

    let counter = 0;
    const tokenReadings = request.tokenEvidence
      .filter((token) => token.tokenType === 'persian-word')
      .map((token) => {
        counter += 1;
        return {
          tokenIndex: token.index,
          surface: token.surface,
          canonical: token.canonicalTransliteration ?? `alpha${counter}`,
          note: 'Synthetic provider-wiring token reading.'
        };
      });

    const raw = {
      disposition: 'PROPOSED',
      scholarlyCanonical: tokenReadings.map((reading) => reading.canonical).join(' '),
      renderedOutput: 'Alpha Beta',
      confidence: 0.74,
      basis: 'CONTEXTUAL_INFERENCE',
      rationale: 'Synthetic provider wiring test.',
      assumptions: [],
      tokenReadings,
      warnings: []
    };

    const create = vi.fn().mockResolvedValue({
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify(raw)
            }
          ]
        }
      ]
    });

    const provider = new OpenAiPhraseResolverProvider('test-key', 'test-model', 5000);
    (provider as unknown as { client: { responses: { create: typeof create } } }).client = {
      responses: { create }
    };

    const resolution = await provider.resolve(request);

    expect(resolution.scholarlyCanonical).toBe('alpha1 alpha2');
    expect(resolution.renderedOutput).toBe('Alpha1 Alpha2');
    expect(resolution.provider).toBe('openai');
    expect(resolution.model).toBe('test-model');

    expect(create).toHaveBeenCalledTimes(1);
    const [apiRequest] = create.mock.calls[0];
    expect(apiRequest.model).toBe('test-model');
    expect(apiRequest.store).toBe(false);
    expect(apiRequest.input[0].role).toBe('system');
    expect(apiRequest.input[1].role).toBe('user');
    expect(apiRequest.text?.format).toBeDefined();
    expect(apiRequest.tools).toBeUndefined();
  });
});
