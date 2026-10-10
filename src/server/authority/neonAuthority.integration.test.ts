import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { beforeAll, describe, expect, it } from 'vitest';
import { databaseIdentityFingerprint } from '../evidence-store/guard';
import { parseMarcCollection } from '../../validation/acquisition/bsb/marcxml';
import { adaptBsbRecord } from '../../validation/acquisition/bsb/adapter';
import { computeBsbReviewBasis } from '../evidence-store/bsbScholarlyReview';
import { buildSnapshot } from '../evidence-store/publication';
import { PUBLISHED_AUTHORITY_SNAPSHOT } from '../../data/publishedAuthority';
import { prepareAuthorityPublication, type AuthorityPublicationRequest,
  type VerifiedPublicationAuthorization } from './authorityPublication';
import { NeonReviewSourceVerifier, type VerifiedReviewSource } from './sourceVerification';
import { NeonAuthorityRepository } from './neonAuthorityRepository';

const confirmation=process.env.PHASE8R_TEST_DISPOSABLE_CONFIRMATION;
const enabled=confirmation==='I_CONFIRM_PHASE8R_DISPOSABLE_ISOLATED_DATABASE' &&
  Boolean(process.env.PHASE8R_TEST_ADMIN_DATABASE_URL)&&Boolean(process.env.PHASE8R_TEST_SOURCE_DATABASE_URL)&&
  (process.env.PHASE8R_TEST_NAMESPACE??'').startsWith('phase8r_test_')&&
  /^br-[a-z0-9-]+$/u.test(process.env.PHASE8R_TEST_NEON_BRANCH_ID??'');
const suite=describe.runIf(enabled);
const eventId='88888888-8888-4888-8888-888888888888';
let snapshotId:string,manifest:string;const now='2026-10-10T12:00:00.000Z';
let repository:NeonAuthorityRepository,source:NeonReviewSourceVerifier,request:AuthorityPublicationRequest;
let verified:VerifiedReviewSource,publishedSnapshotId:string,adminFingerprint:string,adminHost:string;
const auth:VerifiedPublicationAuthorization={administratorRef:'phase8r-integration-admin',authorizedAt:now,
  scope:'PHASE8R_AUTHORITY_PUBLICATION',authorizationVersion:'1',
  verification:{kind:'INDEPENDENT_ADMIN_FILE_HASH',sha256:'9'.repeat(64)}};
async function executeScript(sql:{query(text:string,values?:unknown[]):Promise<unknown>},script:string):Promise<void>{
  const statements:string[]=[];let current='',inDollarBlock=false;
  for(let index=0;index<script.length;index+=1){
    if(script.slice(index,index+2)==='$$'){inDollarBlock=!inDollarBlock;current+='$$';index+=1;continue;}
    if(script[index]===';'&&!inDollarBlock){if(current.trim())statements.push(current.trim());current='';}
    else current+=script[index];
  }
  if(current.trim())statements.push(current.trim());
  for(const statement of statements.filter(value=>value!=='BEGIN'&&value!=='COMMIT'))await sql.query(statement);
}

suite('Phase 8R isolated Neon publication integration',()=>{
  beforeAll(async()=>{
    const adminUrl=process.env.PHASE8R_TEST_ADMIN_DATABASE_URL!,sourceUrl=process.env.PHASE8R_TEST_SOURCE_DATABASE_URL!;
    const namespace=process.env.PHASE8R_TEST_NAMESPACE!;
    const admin=neon(adminUrl),reader=neon(sourceUrl);
    // This suite is destructive by design and cannot start without the exact disposable confirmation above.
    for(const sql of [admin,reader]){
      const identity=await sql.query("SELECT current_setting('neon.branch_id',true) AS branch_id") as unknown as Array<{branch_id:string}>;
      if(identity[0]?.branch_id!==process.env.PHASE8R_TEST_NEON_BRANCH_ID)throw new Error('Refusing Phase 8R integration: disposable Neon branch identity mismatch');
    }
    for(const file of ['migrations/evidence/001_phase8g_evidence_store.sql','src/server/review/phase8o_staging_review_ledger.sql','migrations/evidence/002_phase8r_reviewed_authority.sql'])
      await executeScript(admin,fs.readFileSync(path.resolve(process.cwd(),file),'utf8'));
    const identity=async(sql:{query(text:string,values?:unknown[]):Promise<unknown>},url:string)=>{
      const row=(await sql.query('SELECT current_database() AS database,current_user AS user,current_schema() AS schema') as unknown as Record<string,string>[])[0];
      const host=new URL(url).hostname.toLowerCase();
      return {host,fingerprint:databaseIdentityFingerprint({host,database:row.database,user:row.user,schema:row.schema})};
    };
    const adminIdentity=await identity(admin,adminUrl),sourceIdentity=await identity(reader,sourceUrl);
    adminFingerprint=adminIdentity.fingerprint;adminHost=adminIdentity.host;
    const xml=fs.readFileSync(path.resolve(process.cwd(),'validation/acquisition/bsb/authentic-selected-records.v1.xml'),'utf8');
    const candidate=parseMarcCollection(xml).flatMap(adaptBsbRecord)[0],recordId=candidate.sourceRecordIds[0];
    const raw='a'.repeat(64),version=`BSB_SRU_MARCXML:${recordId}:${'b'.repeat(64)}`;
    const built=buildSnapshot([{snapshotId:'',sourceVersionId:version,candidate}],
      'phase8g-snapshot-v1','phase8f-bsb-v1',now);snapshotId=built.snapshot.snapshotId;manifest=built.snapshot.manifestChecksum;
    const basis=computeBsbReviewBasis(snapshotId,manifest,version,candidate);
    const decision={eventId,candidateId:candidate.candidateId,basisSha256:basis,kind:'ACCEPT',
      reviewerRef:'phase8r-integration-reviewer',canonical:'Adab-i Fārsī',profile:'ijmes_full',
      rationale:'Disposable integration review with complete provenance.',reviewedAt:now,
      humanAttestation:'I_PERSONALLY_VERIFIED_THIS_IJMES_FORM'};
    await admin.query(`INSERT INTO evidence_environment_binding(singleton,namespace,runtime,isolation,database_fingerprint,writes_enabled)
      VALUES(true,$1,'test','ISOLATED_NEON_BRANCH',$2,false) ON CONFLICT(singleton) DO UPDATE SET namespace=excluded.namespace,runtime='test',isolation='ISOLATED_NEON_BRANCH',database_fingerprint=excluded.database_fingerprint,writes_enabled=false`,[namespace,sourceIdentity.fingerprint]);
    await admin.query(`INSERT INTO evidence_acquisition_run VALUES($1,'BSB_SRU_MARCXML','[]',0,1,'COMPLETE',$2,$2,NULL) ON CONFLICT DO NOTHING`,['phase8r-test-run',now]);
    await admin.query(`INSERT INTO evidence_raw_source VALUES($1,'BSB_SRU_MARCXML','phase8r-test.xml',1,'application/marcxml+xml',$2,'https://example.invalid/license','phase8r-test-run') ON CONFLICT DO NOTHING`,[raw,now]);
    await admin.query(`INSERT INTO evidence_record_version VALUES($1,'BSB_SRU_MARCXML',$2,$3,$4,'{}','[]',$5,$5,true) ON CONFLICT DO NOTHING`,[version,recordId,'b'.repeat(64),raw,now]);
    await admin.query(`INSERT INTO evidence_snapshot VALUES($1,'phase8g-snapshot-v1','phase8f-bsb-v1',$2,1,$3,$4,'ACTIVE',$5,$5) ON CONFLICT DO NOTHING`,[snapshotId,JSON.stringify([version]),manifest,JSON.stringify(built.snapshot.manifest),now]);
    await admin.query(`INSERT INTO evidence_candidate_projection VALUES($1,$2,$3,'BSB_SRU_MARCXML',$4,$5,$6,$7,$8,'UNREVIEWED','NON_AUTHORITATIVE_CANDIDATE') ON CONFLICT DO NOTHING`,[snapshotId,candidate.candidateId,version,candidate.originalPersianForm,candidate.normalizedSearchForm,candidate.category,JSON.stringify(candidate),candidate.contentHash]);
    await admin.query(`INSERT INTO evidence_active_snapshot VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET snapshot_id=excluded.snapshot_id`,[snapshotId]);
    await admin.query(`INSERT INTO phase8o_review_event(event_id,active_snapshot_id,candidate_id,review_basis_sha256,decision_kind,reviewer_ref,decision_json,decided_at)
      VALUES($1,$2,$3,$4,'ACCEPT',$5,$6,$7) ON CONFLICT DO NOTHING`,[eventId,snapshotId,candidate.candidateId,basis,decision.reviewerRef,JSON.stringify(decision),now]);
    await admin.query(`INSERT INTO phase8r_authority_environment_binding(singleton,namespace,isolation,database_fingerprint,writes_enabled)
      VALUES(true,$1,'ISOLATED_NEON_BRANCH',$2,true) ON CONFLICT(singleton) DO UPDATE SET namespace=excluded.namespace,isolation=excluded.isolation,database_fingerprint=excluded.database_fingerprint,writes_enabled=true`,[namespace,adminIdentity.fingerprint]);
    await admin.query(`INSERT INTO phase8r_authority_snapshot(snapshot_id,version,manifest_sha256,manifest_json,status,created_at,activated_at)
      VALUES($1,$2,$3,$4,'ACTIVE',$5,$5) ON CONFLICT DO NOTHING`,[PUBLISHED_AUTHORITY_SNAPSHOT.snapshotId,PUBLISHED_AUTHORITY_SNAPSHOT.version,PUBLISHED_AUTHORITY_SNAPSHOT.manifestSha256,JSON.stringify(PUBLISHED_AUTHORITY_SNAPSHOT),now]);
    await admin.query(`INSERT INTO phase8r_active_authority_snapshot VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET snapshot_id=excluded.snapshot_id`,[PUBLISHED_AUTHORITY_SNAPSHOT.snapshotId]);
    request={reviewEventId:eventId,expectedReviewBasisSha256:basis,expectedSourceSnapshotId:snapshotId,
      context:'BOOK_OR_ARTICLE_TITLE',publicationReason:'Disposable integration publication'};
    source=new NeonReviewSourceVerifier(sourceUrl,{expectedHost:sourceIdentity.host,
      expectedDatabaseFingerprint:sourceIdentity.fingerprint,expectedNamespace:namespace});
    repository=new NeonAuthorityRepository(adminUrl,{namespace,expectedHost:adminIdentity.host,
      expectedDatabaseFingerprint:adminIdentity.fingerprint,administrator:true,allowWrites:true,isolation:'ISOLATED_NEON_BRANCH',
      expectedAuthorizationSha256:'9'.repeat(64),expectedAdministratorRef:'phase8r-integration-admin'});
  },120_000);
  it('runs real migrations and independently reloads source evidence',async()=>{
    verified=await source.verify(request);expect(verified.reviewBasisSha256).toBe(request.expectedReviewBasisSha256);
  });
  it('publishes concurrently with one durable idempotent result',async()=>{
    const active=await repository.readActiveSnapshot();
    const preview=prepareAuthorityPublication(verified,request,verified.activeSnapshotId,active.entries);
    const results=await Promise.all([repository.publish(preview,auth,verified,now),repository.publish(preview,auth,verified,now)]);
    expect(new Set(results.map(value=>value.snapshotId)).size).toBe(1);publishedSnapshotId=results[0].snapshotId;
  });
  it('rolls a failed real SQL transaction back completely',async()=>{
    const admin=neon(process.env.PHASE8R_TEST_ADMIN_DATABASE_URL!);const marker='rollback-'+createHash('sha256').update(now).digest('hex').slice(0,24);
    await expect(admin.transaction([admin`INSERT INTO phase8r_publication_event(event_id,event_kind,entry_id,review_event_id,preview_sha256,administrator_ref,authorization_version,reason,event_json,occurred_at) VALUES(${marker},'ROLLBACK',NULL,NULL,${'0'.repeat(64)},'test','1','forced failure',${JSON.stringify({})}::jsonb,${now})`,admin`SELECT 1/0`])).rejects.toThrow();
    const rows=await admin.query('SELECT event_id FROM phase8r_publication_event WHERE event_id=$1',[marker]) as unknown[];expect(rows).toHaveLength(0);
  });
  it('withdraws, rolls back by creating history, and reloads after repository restart',async()=>{
    const published=await repository.readActiveSnapshot();const entryId=published.entries[0].entryId;
    const withdrawn=await repository.withdraw(entryId,auth,'2026-10-10T12:01:00.000Z','integration withdrawal');expect(withdrawn.entries).toHaveLength(0);
    const restored=await repository.rollback(publishedSnapshotId,auth,'2026-10-10T12:02:00.000Z','integration restoration');expect(restored.entries[0].entryId).toBe(entryId);
    const restarted=new NeonAuthorityRepository(process.env.PHASE8R_TEST_ADMIN_DATABASE_URL!,{
      namespace:process.env.PHASE8R_TEST_NAMESPACE!,expectedHost:adminHost,
      expectedDatabaseFingerprint:adminFingerprint,administrator:true,allowWrites:true,isolation:'ISOLATED_NEON_BRANCH',
      expectedAuthorizationSha256:'9'.repeat(64),expectedAdministratorRef:'phase8r-integration-admin'});
    expect(await restarted.readActiveSnapshot()).toEqual(restored);
  });
});
