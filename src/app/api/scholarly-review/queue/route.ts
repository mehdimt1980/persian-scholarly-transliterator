import {NextRequest,NextResponse} from 'next/server';
import {isReviewAuthenticated} from '../../../../server/review/reviewAuth';
import {loadReviewQueue} from '../../../../server/review/reviewStore';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
  const headers={'Cache-Control':'private, no-store'};
  if(!isReviewAuthenticated(req))return NextResponse.json({error:'Authentication required'},{status:401,headers});
  try{
    const params=req.nextUrl.searchParams;
    const page=Number(params.get('page')??1),pageSize=Number(params.get('pageSize')??25);
    const group=(params.get('group')??'ALL') as import('../../../../server/review/reviewStore').ReviewQuery['group'];
    const status=(params.get('status')??'ALL') as import('../../../../server/review/reviewStore').ReviewQuery['status'];
    const search=params.get('search')??'';
    if(params.get('page')==='')throw new Error('Invalid pagination');
    return NextResponse.json(await loadReviewQueue({page,pageSize,group,status,search}),{headers});
  }
  catch(error){console.error('Phase8O queue unavailable:',error instanceof Error?error.message:'Unknown');
    return NextResponse.json({error:'Review Staging unavailable or not yet initialized.'},{status:503,headers});}
}
