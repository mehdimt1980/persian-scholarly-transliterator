import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transliterate } from '../../../domain/engine';
import { buildResolverRequest } from '../../../domain/assistance';
import { getAssistedResolverConfig, isOpenAiConfigured } from '../../../server/assistance/configuration';
import { OpenAiAssistedResolverProvider } from '../../../server/assistance/openaiProvider';

const requestSchema = z.object({
  input: z.string().max(10000),
  profile: z.enum(['ijmes_full', 'ijmes_title']).default('ijmes_full'),
  reviewDecisions: z.array(z.object({
    issueId: z.string(),
    action: z.enum(['SELECT_LEXICAL_READING', 'MANUAL_CANONICAL_OVERRIDE', 'ACCEPT_IZAFAT', 'REJECT_IZAFAT', 'SELECT_MORPHOLOGY']),
    selectedAlternativeId: z.string().optional(),
    manualCanonicalTransliteration: z.string().optional(),
    note: z.string().optional()
  })).default([]),
  issueId: z.string().min(1)
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parseResult = requestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.errors },
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
        { error: `Target review issue "${issueId}" is stale or does not exist in the current authoritative transliteration state.` },
        { status: 400 }
      );
    }

    // 3. Provider availability check
    if (!isOpenAiConfigured()) {
      return NextResponse.json(
        { error: 'Assisted resolver is currently unavailable on this server (OPENAI_API_KEY is not configured).' },
        { status: 503 }
      );
    }

    // 4. Query provider
    const config = getAssistedResolverConfig();
    const provider = new OpenAiAssistedResolverProvider(config.apiKey, config.model, config.timeoutMs);
    const resolution = await provider.resolve(resolverRequest);

    return NextResponse.json({ resolution });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred during assisted resolution.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
