import { NextResponse } from 'next/server';
import { isOpenAiConfigured } from '../../../../server/assistance/configuration';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    configured: isOpenAiConfigured(),
    phraseResolver: true,
    automaticPhraseFallback: true
  });
}
