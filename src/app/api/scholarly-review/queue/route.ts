import {NextRequest,NextResponse} from 'next/server';
import {isReviewAuthenticated} from '../../../../server/review/reviewAuth';
import {loadReviewQueue} from '../../../../server/review/reviewStore';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
  const headers={'Cache-Control':'private, no-store'};
  if(!isReviewAuthenticated(req))return NextResponse.json({error:'Authentication required'},{status:401,headers});
  try{return NextResponse.json(await loadReviewQueue(),{headers});}
  catch(error){console.error('Phase8O queue unavailable:',error instanceof Error?error.message:'Unknown');
    return NextResponse.json({error:'Review Staging unavailable or not yet initialized.'},{status:503,headers});}
}
