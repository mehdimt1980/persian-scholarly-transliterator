import {NextRequest,NextResponse} from 'next/server';
import {isReviewAuthenticated,requireSameOrigin} from '../../../../server/review/reviewAuth';
import {saveReviewDecision,type SaveReviewInput} from '../../../../server/review/reviewStore';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
  const headers={'Cache-Control':'private, no-store'};
  if(!isReviewAuthenticated(req))return NextResponse.json({error:'Authentication required'},{status:401,headers});
  if(!requireSameOrigin(req))return NextResponse.json({error:'Invalid request origin'},{status:403,headers});
  if(Number(req.headers.get('content-length')??0)>12000)return NextResponse.json({error:'Decision too large'},{status:413,headers});
  try{
    const body=await req.json() as SaveReviewInput;
    const event=await saveReviewDecision(body);
    return NextResponse.json({saved:true,event},{status:201,headers});
  }catch(error){
    // Return safe validation feedback, but no database internals or credentials.
    const message=error instanceof Error?error.message:'Invalid decision';
    if(/^(BSB scholarly review rejected|Invalid review|Stale|Unknown|Reviewer|Invalid draft)/u.test(message))
      return NextResponse.json({error:message},{status:400,headers});
    console.error('Phase8O decision rejected:',message);
    return NextResponse.json({error:'Review submission failed; no authority was published.'},{status:409,headers});
  }
}
