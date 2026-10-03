import { NextRequest, NextResponse } from 'next/server';
import { handleAssistRequest } from '../../../server/assistance/handleAssistRequest';

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleAssistRequest(req);
}
