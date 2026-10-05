import { NextRequest, NextResponse } from 'next/server';
import { handlePhraseAssistRequest } from '../../../../server/assistance/handlePhraseAssistRequest';

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handlePhraseAssistRequest(req);
}
