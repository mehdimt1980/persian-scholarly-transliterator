import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transliterate } from '../../domain/engine';
import { buildResolverRequest } from '../../domain/assistance';
import { getAssistedResolverConfig, isOpenAiConfigured } from './configuration';
import { OpenAiAssistedResolverProvider } from './openaiProvider';

const requestSchema = z.object({
  input: z.string().max(10000),
  profile: z.enum(['ijmes_full', 'ijmes_citation_title']).default('ijmes_full'),
  reviewDecisions: z.array(z.object({
    issueId: z.string(),
    action: z.enum(['SELECT_LEXICAL_READING', 'MANUAL_CANONICAL_OVERRIDE', 'ACCEPT_IZAFAT', 'REJECT_IZAFAT', 'SELECT_MORPHOLOGY']),
    selectedAlternativeId: z.string().optional(),
    manualCanonicalTransliteration: z.string().optional(),
    note: z.string().optional()
  })).default([]),
  issueId: z.string().min(1)
});

export async function handleAssistRequest(
  req: NextRequest,
  customProvider?: OpenAiAssistedResolverProvider
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

  const parseResult = requestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'INVALID_REQUEST',
        message: 'The request body is malformed or invalid.'
      },
      { status: 400 }
    );
  }

  const { input, profile, reviewDecisions, issueId } = parseResult.data;

  // 1. Server-side authoritative state recomputation
  const transliteration = transliterate(input, profile, reviewDecisions);

  // 2. Authoritative issue check
  const resolverRequest = buildResolverRequest(transliteration, issueId);
  if (!resolverRequest) {
    return NextResponse.json(
      {
        error: 'STALE_ISSUE',
        message: 'The requested review issue does not exist in the current authoritative transliteration state.'
      },
      { status: 400 }
    );
  }

  // 3. Provider availability check
  if (!customProvider && !isOpenAiConfigured()) {
    return NextResponse.json(
      {
        error: 'ASSISTANCE_UNAVAILABLE',
        message: 'Assisted resolver is currently unavailable (OPENAI_API_KEY and ASSISTED_RESOLVER_MODEL are required).'
      },
      { status: 503 }
    );
  }

  // 4. Query provider
  try {
    const provider = customProvider ?? (() => {
      const config = getAssistedResolverConfig();
      return new OpenAiAssistedResolverProvider(config.apiKey, config.model, config.timeoutMs);
    })();

    const resolution = await provider.resolve(resolverRequest);
    return NextResponse.json({ resolution });
  } catch (err: unknown) {
    const errName = err instanceof Error ? err.name : '';
    const errMessage = err instanceof Error ? err.message : '';

    if (errName === 'AbortError' || errMessage.toLowerCase().includes('timeout') || errMessage.toLowerCase().includes('abort')) {
      return NextResponse.json(
        {
          error: 'ASSISTANCE_TIMEOUT',
          message: 'The assisted resolution provider timed out.'
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: 'ASSISTANCE_PROVIDER_ERROR',
        message: 'An error occurred during assisted candidate resolution.'
      },
      { status: 502 }
    );
  }
}
