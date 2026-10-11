import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepareAuthorityPublication,
  type AuthorityPublicationRequest, type PublicationAuthorization, type VerifiedPublicationAuthorization } from './authorityPublication';
import { NeonReviewSourceVerifier } from './sourceVerification';
import { NeonAuthorityRepository } from './neonAuthorityRepository';

const args=process.argv.slice(2);
const value=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const required=(name:string)=>{const v=value(name);if(!v)throw new Error(`Missing ${name}`);return resolve(v);};
const parse=async<T>(path:string):Promise<T>=>JSON.parse(await readFile(path,'utf8')) as T;

async function main(){
  const request=await parse<AuthorityPublicationRequest>(required('--request'));
  const sourceUrl=process.env.PHASE8R_SOURCE_DATABASE_URL??'';
  const authorityUrl=process.env.PHASE8R_AUTHORITY_DATABASE_URL??'';
  const expectedHost=process.env.PHASE8R_DATABASE_HOST??'';
  const sourceFingerprint=process.env.PHASE8R_SOURCE_DATABASE_FINGERPRINT??'';
  const authorityFingerprint=process.env.PHASE8R_AUTHORITY_DATABASE_FINGERPRINT??'';
  const namespace=process.env.PHASE8R_AUTHORITY_NAMESPACE??'';
  const source=new NeonReviewSourceVerifier(sourceUrl,{expectedHost,
    expectedDatabaseFingerprint:sourceFingerprint,expectedNamespace:process.env.EVIDENCE_STORAGE_NAMESPACE??''});
  const repository=new NeonAuthorityRepository(authorityUrl,{namespace,expectedHost,
    expectedDatabaseFingerprint:authorityFingerprint,administrator:process.env.EVIDENCE_ADMIN_MODE==='true',
    allowWrites:process.env.PHASE8R_AUTHORITY_ALLOW_WRITES==='true',
    isolation:process.env.EVIDENCE_DATABASE_ISOLATION==='ISOLATED_SCHEMA'?'ISOLATED_SCHEMA':'ISOLATED_NEON_BRANCH',
    expectedAuthorizationSha256:process.env.PHASE8R_PUBLICATION_AUTHORIZATION_SHA256??'',
    expectedAdministratorRef:process.env.PHASE8R_PUBLICATION_ADMIN_REF??''});
  const [review,snapshot]=await Promise.all([source.verify(request),repository.readActiveSnapshot()]);
  const preview=prepareAuthorityPublication(review,request,review.activeSnapshotId,snapshot.entries);
  if(!args.includes('--publish')){
    process.stdout.write(JSON.stringify({mode:'PREVIEW_ONLY_NO_PUBLICATION',preview},null,2)+'\n');return;
  }
  const authPath=required('--authorization');const raw=await readFile(authPath,'utf8');
  const expected=process.env.PHASE8R_PUBLICATION_AUTHORIZATION_SHA256;
  const actual=createHash('sha256').update(raw).digest('hex');
  if(!expected||expected!==actual)throw new Error('Publication authorization file is not independently approved');
  const parsed=JSON.parse(raw) as PublicationAuthorization;
  const authorization:VerifiedPublicationAuthorization={...parsed,
    verification:{kind:'INDEPENDENT_ADMIN_FILE_HASH',sha256:actual}};
  if(process.env.PHASE8R_PUBLICATION_ADMIN_REF!==authorization.administratorRef)
    throw new Error('Publication administrator binding mismatch');
  // publish() repeats the source-currentness checks inside the serializable, advisory-locked transaction.
  const published=await repository.publish(preview,authorization,review,new Date().toISOString());
  const out=required('--out');await writeFile(out,JSON.stringify(published,null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify({mode:'DATABASE_PUBLICATION_COMMITTED_RUNTIME_EXPORT_CREATED',
    snapshotId:published.snapshotId,output:out},null,2)+'\n');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Authority command failed');process.exitCode=1;});
