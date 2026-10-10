import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

export const REVIEW_COOKIE='ps-transliterator-review-session';
const SESSION_SECONDS=12*60*60;
const hash=(value:string)=>createHash('sha256').update(value).digest();

export function reviewSecret():string|null{
  const secret=process.env.PHASE8O_REVIEW_ACCESS_SECRET;
  return secret&&secret.length>=32?secret:null;
}
export function constantTimePasswordMatch(supplied:string,secret:string):boolean{
  const left=hash(supplied),right=hash(secret);
  return timingSafeEqual(left,right);
}
function mac(secret:string,data:string):string{
  return createHmac('sha256',secret).update(data).digest('hex');
}
export function issueReviewSession(secret:string,now=Date.now()):string{
  const exp=Math.floor(now/1000)+SESSION_SECONDS;
  const data='v1.'+exp;
  return data+'.'+mac(secret,data);
}
export function verifyReviewSession(session:string|undefined,secret:string,now=Date.now()):boolean{
  if(!session||session.length>200)return false;
  const match=/^v1\.(\d{10})\.([0-9a-f]{64})$/u.exec(session);
  if(!match)return false;
  const expires=Number(match[1]),current=Math.floor(now/1000);
  if(!Number.isSafeInteger(expires)||expires<=current||expires>current+SESSION_SECONDS)return false;
  const expected=mac(secret,'v1.'+match[1]);
  return timingSafeEqual(Buffer.from(match[2],'hex'),Buffer.from(expected,'hex'));
}
export function isReviewAuthenticated(req:NextRequest):boolean{
  const secret=reviewSecret();
  return Boolean(secret&&verifyReviewSession(req.cookies.get(REVIEW_COOKIE)?.value,secret));
}
export function requireSameOrigin(req:NextRequest):boolean{
  const origin=req.headers.get('origin');
  if(!origin)return false;
  try{
    const parsed=new URL(origin);
    const host=req.headers.get('host');
    return !!host&&parsed.host.toLowerCase()===host.toLowerCase()
      &&(parsed.protocol==='https:'||(parsed.protocol==='http:'&&host.startsWith('localhost')));
  }catch{return false;}
}
