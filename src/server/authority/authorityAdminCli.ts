import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PublishedAuthoritySnapshot } from '../../domain/authority/types';
import { assertAuthorityManifest } from './manifest';
import { authorizePublication, prepareAuthorityPublication,
  type AcceptedReviewRecord, type AuthorityPublicationRequest, type PublicationAuthorization } from './authorityPublication';

const args=process.argv.slice(2);
const value=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const required=(name:string)=>{const v=value(name);if(!v)throw new Error(`Missing ${name}`);return resolve(v);};
const parse=async<T>(path:string):Promise<T>=>JSON.parse(await readFile(path,'utf8')) as T;

async function main(){
  const review=await parse<AcceptedReviewRecord>(required('--review-event'));
  const request=await parse<AuthorityPublicationRequest>(required('--request'));
  const snapshot=await parse<PublishedAuthoritySnapshot>(required('--snapshot'));
  assertAuthorityManifest(snapshot);
  const preview=prepareAuthorityPublication(review,request,request.expectedSourceSnapshotId,snapshot.entries);
  if(!args.includes('--publish')){
    process.stdout.write(JSON.stringify({mode:'PREVIEW_ONLY_NO_PUBLICATION',preview},null,2)+'\n');return;
  }
  const authPath=required('--authorization');const raw=await readFile(authPath,'utf8');
  const expected=process.env.PHASE8R_PUBLICATION_AUTHORIZATION_SHA256;
  const actual=createHash('sha256').update(raw).digest('hex');
  if(!expected||expected!==actual)throw new Error('Publication authorization file is not independently approved');
  const authorization=JSON.parse(raw) as PublicationAuthorization;
  if(process.env.PHASE8R_PUBLICATION_ADMIN_REF!==authorization.administratorRef)
    throw new Error('Publication administrator binding mismatch');
  const result=authorizePublication(preview,authorization,new Date().toISOString(),snapshot);
  if(!result.event){process.stdout.write(JSON.stringify({mode:'IDEMPOTENT_ALREADY_PUBLISHED',snapshotId:snapshot.snapshotId},null,2)+'\n');return;}
  const out=required('--out');await writeFile(out,JSON.stringify(result.snapshot,null,2)+'\n',{flag:'wx'});
  const eventOut=value('--event-out');if(eventOut)await writeFile(resolve(eventOut),JSON.stringify(result.event,null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify({mode:'AUTHORIZED_PUBLICATION_ARTIFACT_CREATED',snapshotId:result.snapshot.snapshotId,
    eventId:result.event.eventId,output:out},null,2)+'\n');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Authority command failed');process.exitCode=1;});
