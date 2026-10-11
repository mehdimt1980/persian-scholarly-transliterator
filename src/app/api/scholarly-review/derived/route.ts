import { NextRequest, NextResponse } from 'next/server';
import { isReviewAuthenticated, requireSameOrigin } from '../../../../server/review/reviewAuth';
import {
  loadDerivedReviewsForCandidate,
  saveDerivedReviewDecision,
  type SaveDerivedReviewInput,
} from '../../../../server/review/derivedReviewStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!isReviewAuthenticated(req)) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
  const candidateId = req.nextUrl.searchParams.get('candidateId');
  if (!candidateId || !/^lex-[a-f0-9]{20}$/u.test(candidateId)) {
    return NextResponse.json({ error: 'Valid candidateId parameter required' }, { status: 400, headers });
  }
  try {
    const items = await loadDerivedReviewsForCandidate(candidateId);
    return NextResponse.json({ items }, { headers });
  } catch (error) {
    console.error('Phase8S derived review queue unavailable:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json({ error: 'Derived review service unavailable.' }, { status: 503, headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!isReviewAuthenticated(req)) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
  if (!requireSameOrigin(req)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers });
  if (Number(req.headers.get('content-length') ?? 0) > 16000) return NextResponse.json({ error: 'Decision too large' }, { status: 413, headers });
  try {
    const body = (await req.json()) as SaveDerivedReviewInput;
    const result = await saveDerivedReviewDecision(body);
    return NextResponse.json({ saved: true, candidate: result.candidate, event: result.event }, { status: 201, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid derived decision';
    if (
      /^(Invalid derived|Running-text|Derivation|Parent|Scholarly|Personal)/u.test(
        message
      )
    ) {
      return NextResponse.json({ error: message }, { status: 400, headers });
    }
    console.error('Phase8S derived review submission rejected:', message);
    return NextResponse.json({ error: 'Derived review submission failed; no authority was published.' }, { status: 409, headers });
  }
}
