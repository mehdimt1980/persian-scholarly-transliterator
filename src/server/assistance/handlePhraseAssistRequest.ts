import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transliterate } from '../../domain/engine';
import { buildPhraseResolverRequest } from '../../domain/assistance';
import { getAssistedResolverConfig, isOpenAiConfigured } from './configuration';
import { OpenAiPhraseResolverProvider } from './openaiPhraseProvider';
import type { PhraseResolverProvider } from './phraseProvider';

const phraseRequestSchema = z.object({
  input: z.string().min(1).max(10000),
  profile: z.enum(['ijmes_full', 'ijmes_title']).default('ijmes_full'),
  reviewDecisions: z.array(z.object({
    issueId: z.string(),
    action: z.enum([
      'SELECT_LEXICAL_READING',
      'MANUAL_CANONICAL_OVERRIDE',
      'ACCEPT_IZAFAT',
      'REJECT_IZAFAT',
      'SELECT_MORPHOLOGY'
    ]),
    selectedAlternativeId: z.string().optional(),
    manualCanonicalTransliteration: z.string().optional(),
    note: z.string().optional()
  })).default([])
}).strict();

export async function handlePhraseAssistRequest(
  req: NextRequest,
  customProvider?: PhraseResolverProvider
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error: 'INVALID_REQUEST',
        message: 'The request body is not valid JSON.'
      },
      { status: 400 }
    );
  }

  const parsed = phraseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'INVALID_REQUEST',
        message: 'The phrase assistance request is malformed or invalid.'
      },
      { status: 400 }
    );
  }

  const { input, profile, reviewDecisions } = parsed.data;

  // The server always recomputes deterministic state. The client cannot inject
  // token status, review issues, morphology, relations, or evidence into the AI prompt.
  const transliteration = transliterate(input, profile, reviewDecisions);

  if (transliteration.copyable || transliteration.reviewIssues.length === 0) {
    return NextResponse.json(
      {
        error: 'PHRASE_ASSISTANCE_NOT_NEEDED',
        message: 'The current deterministic state does not require phrase-level assistance.'
      },
      { status: 409 }
    );
  }

  const resolverRequest = buildPhraseResolverRequest(transliteration);

  if (!customProvider && !isOpenAiConfigured()) {
    return NextResponse.json(
      {
        error: 'ASSISTANCE_UNAVAILABLE',
        message: 'Phrase assistance is ready but OpenAI credentials are not configured.'
      },
      { status: 503 }
    );
  }

  try {
    const provider = customProvider ?? (() => {
      const config = getAssistedResolverConfig();
      return new OpenAiPhraseResolverProvider(config.apiKey, config.model, config.timeoutMs);
    })();

    const resolution = await provider.resolve(resolverRequest);
    return NextResponse.json({ resolution });
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : '';

    if (
      name === 'AbortError' ||
      message.toLowerCase().includes('timeout') ||
      message.toLowerCase().includes('abort')
    ) {
      return NextResponse.json(
        {
          error: 'ASSISTANCE_TIMEOUT',
          message: 'The phrase assistance provider timed out.'
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: 'ASSISTANCE_PROVIDER_ERROR',
        message: 'An error occurred during context-aware phrase resolution.'
      },
      { status: 502 }
    );
  }
}
