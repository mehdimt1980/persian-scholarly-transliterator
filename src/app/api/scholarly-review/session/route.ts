import { NextRequest,NextResponse } from 'next/server';
import { REVIEW_COOKIE,reviewSecret,constantTimePasswordMatch,issueReviewSession,isReviewAuthenticated,requireSameOrigin } from '../../../../server/review/reviewAuth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store, private'};
export async function GET(req:NextRequest){
  return NextResponse.json({authenticated:isReviewAuthenticated(req),configured:Boolean(reviewSecret())},{headers});
}
export async function POST(req:NextRequest){
  const secret=reviewSecret();
  if(!secret)return NextResponse.json({error:'Review access has not been configured by the site administrator.'},{status:503,headers});
  if(!requireSameOrigin(req))return NextResponse.json({error:'Invalid request origin'},{status:403,headers});
  if(Number(req.headers.get('content-length')??0)>2048)return NextResponse.json({error:'Request too large'},{status:413,headers});
  let password:unknown;
  try{password=(await req.json() as {password?:unknown}).password;}catch{
    return NextResponse.json({error:'Invalid request'},{status:400,headers});
  }
  if(typeof password!=='string'||password.length>512||!constantTimePasswordMatch(password,secret))
    return NextResponse.json({error:'Invalid review passphrase'},{status:401,headers});
  const res=NextResponse.json({authenticated:true},{headers});
  res.cookies.set(REVIEW_COOKIE,issueReviewSession(secret),{
    httpOnly:true,secure:process.env.NODE_ENV!=='development',sameSite:'strict',
    path:'/',maxAge:12*60*60,
  });
  return res;
}
export async function DELETE(req:NextRequest){
  if(!requireSameOrigin(req))return NextResponse.json({error:'Invalid request origin'},{status:403,headers});
  const res=NextResponse.json({authenticated:false},{headers});
  res.cookies.set(REVIEW_COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV!=='development',
    sameSite:'strict',path:'/',maxAge:0});
  return res;
}
