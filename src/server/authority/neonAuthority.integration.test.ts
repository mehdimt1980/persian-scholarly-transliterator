import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { sha256 } from '../../validation/acquisition/cinii/identity';
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
import { NeonReviewSourceVerifier, type AnyVerifiedReviewSource, type VerifiedDerivedReviewSource } from './sourceVerification';
import { NeonAuthorityRepository } from './neonAuthorityRepository';
import { computeDerivedCandidateId } from '../../domain/authority/derivation';
import { transliterate } from '../../domain/engine';

const confirmation=process.env.PHASE8R_TEST_DISPOSABLE_CONFIRMATION;
const enabled=confirmation==='I_CONFIRM_PHASE8R_DISPOSABLE_ISOLATED_DATABASE' &&
  Boolean(process.env.PHASE8R_TEST_ADMIN_DATABASE_URL)&&Boolean(process.env.PHASE8R_TEST_SOURCE_DATABASE_URL)&&
  (process.env.PHASE8R_TEST_NAMESPACE??'').startsWith('phase8r_test_')&&
  /^br-[a-z0-9-]+$/u.test(process.env.PHASE8R_TEST_NEON_BRANCH_ID??'');
const suite=describe.runIf(enabled);
const eventId='88888888-8888-4888-8888-888888888888';
let snapshotId:string,manifest:string;const now='2026-10-10T12:00:00.000Z';
let repository:NeonAuthorityRepository,source:NeonReviewSourceVerifier,request:AuthorityPublicationRequest;
let verified:AnyVerifiedReviewSource,publishedSnapshotId:string,adminFingerprint:string,adminHost:string;
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
    for(const file of ['migrations/evidence/001_phase8g_evidence_store.sql','src/server/review/phase8o_staging_review_ledger.sql','migrations/evidence/002_phase8r_reviewed_authority.sql','migrations/evidence/003_phase8s_derived_authority.sql'])
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

suite('Phase 8S Derived Authority isolated Neon integration', () => {
  const parentCandidateId = 'lex-8f03c14482a7a9082f16';
  const parentRecordId = 'bsb-phase8s-rec-001';
  const parentRaw = 'c'.repeat(64);
  const parentVersion = `BSB_SRU_MARCXML:${parentRecordId}:${'d'.repeat(64)}`;
  const parentEventId = '77777777-7777-4777-7777-777777777777';
  const derivedEventId = '99999999-9999-4999-9999-999999999999';
  const draftEventId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const deferEventId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  const rejectEventId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';

  const originalCatalogueSurface = 'نصیری، محمدرضا';
  const catalogueCanonical = 'Naṣīrī, Muḥammad Riḍā';
  const runningTextSurface = 'محمدرضا نصیری';
  const approvedRunningCanonical = 'Muḥammad Riḍā Naṣīrī';

  let derivedCandidateId: string;
  let s8SnapshotId: string;
  let s8Basis: string;
  let derivedPublishedSnapshotId: string;
  let s8Verified: VerifiedDerivedReviewSource;
  let s8Request: AuthorityPublicationRequest;

  beforeAll(async () => {
    const adminUrl = process.env.PHASE8R_TEST_ADMIN_DATABASE_URL!;
    const sourceUrl = process.env.PHASE8R_TEST_SOURCE_DATABASE_URL!;
    const admin = neon(adminUrl);
    // This suite has independent setup: NEVER write unless BOTH credentials
    // independently confirm the explicit disposable branch.
    for (const url of [adminUrl, sourceUrl]) {
      const db = neon(url);
      const result = await db.query("SELECT current_setting('neon.branch_id',true) AS branch_id") as Array<{branch_id:string}>;
      if (result[0]?.branch_id !== process.env.PHASE8R_TEST_NEON_BRANCH_ID) {
        throw new Error('Refusing Phase 8S integration: disposable Neon branch identity mismatch');
      }
    }

    // Setup authentic parent candidate projection for personal name catalogue record
    const xml = fs.readFileSync(path.resolve(process.cwd(), 'validation/acquisition/bsb/authentic-selected-records.v1.xml'), 'utf8');
    const baseCandidate = parseMarcCollection(xml).flatMap(adaptBsbRecord)[0];
    const parentCandidateFields = {
      ...baseCandidate,
      candidateId: parentCandidateId,
      originalPersianForm: originalCatalogueSurface,
      normalizedSearchForm: originalCatalogueSurface,
      category: 'PERSON_NAME' as const,
      sourceRecordIds: [parentRecordId]
    };
    // Fixtures must satisfy the same candidate identity and integrity contracts as production evidence.
    const parentCandidate = { ...parentCandidateFields, contentHash: sha256({ ...parentCandidateFields, contentHash: undefined }) };

    const built = buildSnapshot([{ snapshotId: '', sourceVersionId: parentVersion, candidate: parentCandidate }],
      'phase8g-snapshot-v1', 'phase8f-bsb-v1', now);
    s8SnapshotId = built.snapshot.snapshotId;
    const manifestChecksum = built.snapshot.manifestChecksum;
    s8Basis = computeBsbReviewBasis(s8SnapshotId, manifestChecksum, parentVersion, parentCandidate);

    const parentDecision = {
      eventId: parentEventId, candidateId: parentCandidate.candidateId, basisSha256: s8Basis, kind: 'ACCEPT',
      reviewerRef: 'phase8s-parent-reviewer', canonical: catalogueCanonical, profile: 'ijmes_full',
      rationale: 'Accepted BSB catalogue evidence with comma-separated name order.', reviewedAt: now,
      humanAttestation: 'I_PERSONALLY_VERIFIED_THIS_IJMES_FORM'
    };

    // Insert source evidence and parent ACCEPT event
    await admin.query(`INSERT INTO evidence_acquisition_run VALUES($1,'BSB_SRU_MARCXML','[]',0,1,'COMPLETE',$2,$2,NULL) ON CONFLICT DO NOTHING`, ['phase8s-test-run', now]);
    await admin.query(`INSERT INTO evidence_raw_source VALUES($1,'BSB_SRU_MARCXML','phase8s-test.xml',1,'application/marcxml+xml',$2,'https://example.invalid/license','phase8s-test-run') ON CONFLICT DO NOTHING`, [parentRaw, now]);
    await admin.query(`INSERT INTO evidence_record_version VALUES($1,'BSB_SRU_MARCXML',$2,$3,$4,'{}','[]',$5,$5,true) ON CONFLICT DO NOTHING`, [parentVersion, parentRecordId, 'd'.repeat(64), parentRaw, now]);
    // Only one ACTIVE Phase 8G snapshot is allowed by evidence_one_active_phase8g_snapshot.
    // Retire the prior Phase 8R fixture snapshot; retain its immutable history.
    await admin.query("UPDATE evidence_snapshot SET status='RETIRED' WHERE status='ACTIVE' AND schema_version='phase8g-snapshot-v1'");
    await admin.query(`INSERT INTO evidence_snapshot VALUES($1,'phase8g-snapshot-v1','phase8f-bsb-v1',$2,1,$3,$4,'ACTIVE',$5,$5)`, [s8SnapshotId, JSON.stringify([parentVersion]), manifestChecksum, JSON.stringify(built.snapshot.manifest), now]);
    const inserted = await admin.query('SELECT snapshot_id FROM evidence_snapshot WHERE snapshot_id=$1 AND status=$2', [s8SnapshotId, 'ACTIVE']) as Array<{snapshot_id:string}>;
    expect(inserted).toHaveLength(1);
    await admin.query(`INSERT INTO evidence_candidate_projection VALUES($1,$2,$3,'BSB_SRU_MARCXML',$4,$5,$6,$7,$8,'UNREVIEWED','NON_AUTHORITATIVE_CANDIDATE') ON CONFLICT DO NOTHING`,
      [s8SnapshotId, parentCandidate.candidateId, parentVersion, parentCandidate.originalPersianForm, parentCandidate.normalizedSearchForm, parentCandidate.category, JSON.stringify(parentCandidate), parentCandidate.contentHash]);
    await admin.query(`INSERT INTO evidence_active_snapshot VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET snapshot_id=excluded.snapshot_id`, [s8SnapshotId]);
    await admin.query(`INSERT INTO phase8o_review_event(event_id,active_snapshot_id,candidate_id,review_basis_sha256,decision_kind,reviewer_ref,decision_json,decided_at)
      VALUES($1,$2,$3,$4,'ACCEPT',$5,$6,$7) ON CONFLICT DO NOTHING`, [parentEventId, s8SnapshotId, parentCandidate.candidateId, s8Basis, parentDecision.reviewerRef, JSON.stringify(parentDecision), now]);

    derivedCandidateId = computeDerivedCandidateId(parentCandidate.candidateId, runningTextSurface, 'CATALOGUE_INVERSION_NORMALIZED');
  }, 120_000);

  it('runs migration 003 and validates derived authority schema and constraints', async () => {
    const admin = neon(process.env.PHASE8R_TEST_ADMIN_DATABASE_URL!);
    const tableRows = await admin.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('phase8s_derived_candidate', 'phase8s_derived_review_event')
    `) as Array<{ table_name: string }>;
    expect(tableRows.map(r => r.table_name).sort()).toEqual(['phase8s_derived_candidate', 'phase8s_derived_review_event']);

    const colRows = await admin.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='phase8r_authority_entry' AND column_name IN ('derived_review_event_id', 'derived_candidate_id', 'derivation_type')
    `) as Array<{ column_name: string }>;
    expect(colRows).toHaveLength(3);
  });

  it('persists derived candidate with immutable parent provenance', async () => {
    const admin = neon(process.env.PHASE8R_TEST_ADMIN_DATABASE_URL!);
    await admin.query(`
      INSERT INTO phase8s_derived_candidate(
        derived_candidate_id, parent_candidate_id, parent_source_version_id, parent_review_event_id,
        source_snapshot_id, review_basis_sha256, original_persian_surface, running_text_persian_surface,
        derivation_type, derivation_explanation, created_at, created_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(derived_candidate_id) DO NOTHING
    `, [
      derivedCandidateId, parentCandidateId, parentVersion, parentEventId,
      s8SnapshotId, s8Basis, originalCatalogueSurface, runningTextSurface,
      'CATALOGUE_INVERSION_NORMALIZED', 'Natural order running text name.', now, 'phase8s-integration-reviewer'
    ]);

    const rows = await admin.query(`SELECT * FROM phase8s_derived_candidate WHERE derived_candidate_id=$1`, [derivedCandidateId]) as Record<string, string>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].parent_candidate_id).toBe(parentCandidateId);
    expect(rows[0].running_text_persian_surface).toBe(runningTextSurface);
  });

  it('enforces append-only review lifecycle: DRAFT -> DEFER -> REJECT -> ACCEPT', async () => {
    const admin = neon(process.env.PHASE8R_TEST_ADMIN_DATABASE_URL!);
    const t1 = '2026-10-10T12:05:00.000Z';
    const t2 = '2026-10-10T12:06:00.000Z';
    const t3 = '2026-10-10T12:07:00.000Z';
    const t4 = '2026-10-10T12:08:00.000Z';

    await admin.query(`INSERT INTO phase8s_derived_review_event(event_id, derived_candidate_id, decision_kind, canonical, profile, authority_context, reviewer_ref, rationale, human_attestation, decision_json, decided_at)
      VALUES($1, $2, 'DRAFT', $3, 'ijmes_full', 'PERSON_NAME', 'reviewer-1', 'Initial draft', 'I_PERSONALLY_VERIFIED_THIS_RUNNING_TEXT_IJMES_FORM', '{}'::jsonb, $4)`,
      [draftEventId, derivedCandidateId, approvedRunningCanonical, t1]);

    await admin.query(`INSERT INTO phase8s_derived_review_event(event_id, derived_candidate_id, decision_kind, canonical, profile, authority_context, reviewer_ref, rationale, human_attestation, decision_json, decided_at)
      VALUES($1, $2, 'DEFER', $3, 'ijmes_full', 'PERSON_NAME', 'reviewer-1', 'Deferred for verification', 'I_PERSONALLY_VERIFIED_THIS_RUNNING_TEXT_IJMES_FORM', '{}'::jsonb, $4)`,
      [deferEventId, derivedCandidateId, approvedRunningCanonical, t2]);

    await admin.query(`INSERT INTO phase8s_derived_review_event(event_id, derived_candidate_id, decision_kind, canonical, profile, authority_context, reviewer_ref, rationale, human_attestation, decision_json, decided_at)
      VALUES($1, $2, 'REJECT', $3, 'ijmes_full', 'PERSON_NAME', 'reviewer-1', 'Rejected temporarily', 'I_PERSONALLY_VERIFIED_THIS_RUNNING_TEXT_IJMES_FORM', '{}'::jsonb, $4)`,
      [rejectEventId, derivedCandidateId, approvedRunningCanonical, t3]);

    await admin.query(`INSERT INTO phase8s_derived_review_event(event_id, derived_candidate_id, decision_kind, canonical, profile, authority_context, reviewer_ref, rationale, human_attestation, decision_json, decided_at)
      VALUES($1, $2, 'ACCEPT', $3, 'ijmes_full', 'PERSON_NAME', 'phase8s-scholarly-reviewer', 'Approved running text transliteration.', 'I_PERSONALLY_VERIFIED_THIS_RUNNING_TEXT_IJMES_FORM', '{}'::jsonb, $4)`,
      [derivedEventId, derivedCandidateId, approvedRunningCanonical, t4]);

    const events = await admin.query(`SELECT decision_kind FROM phase8s_derived_review_event WHERE derived_candidate_id=$1 ORDER BY decided_at ASC`, [derivedCandidateId]) as Array<{ decision_kind: string }>;
    expect(events.map(e => e.decision_kind)).toEqual(['DRAFT', 'DEFER', 'REJECT', 'ACCEPT']);
  });

  it('enforces append-only immutability triggers (UPDATE and DELETE fail)', async () => {
    const admin = neon(process.env.PHASE8R_TEST_ADMIN_DATABASE_URL!);
    await expect(admin.query(`UPDATE phase8s_derived_review_event SET canonical='Tampered' WHERE event_id=$1`, [derivedEventId])).rejects.toThrow();
    await expect(admin.query(`DELETE FROM phase8s_derived_review_event WHERE event_id=$1`, [derivedEventId])).rejects.toThrow();
  });

  it('independently reloads derived source via NeonReviewSourceVerifier', async () => {
    s8Request = {
      reviewEventId: derivedEventId,
      derivedReviewEventId: derivedEventId,
      expectedReviewBasisSha256: s8Basis,
      expectedSourceSnapshotId: s8SnapshotId,
      context: 'PERSON_NAME',
      personalNameOrderingAttestation: 'RUNNING_TEXT_ORDER_VERIFIED',
      publicationReason: 'Phase 8S disposable integration test'
    };
    s8Verified = (await source.verify(s8Request)) as VerifiedDerivedReviewSource;
    expect(s8Verified.isDerived).toBe(true);
    expect(s8Verified.runningTextPersianSurface).toBe(runningTextSurface);
    expect(s8Verified.canonical).toBe(approvedRunningCanonical);
    expect(s8Verified.reviewBasisSha256).toBe(s8Basis);
  });

  it('rejects publication when superseded by later review or basis mismatch', async () => {
    const admin = neon(process.env.PHASE8R_TEST_ADMIN_DATABASE_URL!);
    const laterDeferId = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
    const t5 = '2026-10-10T12:09:00.000Z';
    await admin.query(`INSERT INTO phase8s_derived_review_event(event_id, derived_candidate_id, decision_kind, canonical, profile, authority_context, reviewer_ref, rationale, human_attestation, decision_json, decided_at)
      VALUES($1, $2, 'DEFER', $3, 'ijmes_full', 'PERSON_NAME', 'reviewer-1', 'Later defer', 'I_PERSONALLY_VERIFIED_THIS_RUNNING_TEXT_IJMES_FORM', '{}'::jsonb, $4)`,
      [laterDeferId, derivedCandidateId, approvedRunningCanonical, t5]);

    await expect(source.verify(s8Request)).rejects.toThrow('REVIEW_NOT_CURRENT_ACCEPT');

    const finalAcceptId = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';
    const t6 = '2026-10-10T12:10:00.000Z';
    await admin.query(`INSERT INTO phase8s_derived_review_event(event_id, derived_candidate_id, decision_kind, canonical, profile, authority_context, reviewer_ref, rationale, human_attestation, decision_json, decided_at)
      VALUES($1, $2, 'ACCEPT', $3, 'ijmes_full', 'PERSON_NAME', 'phase8s-scholarly-reviewer', 'Final confirmed accept.', 'I_PERSONALLY_VERIFIED_THIS_RUNNING_TEXT_IJMES_FORM', '{}'::jsonb, $4)`,
      [finalAcceptId, derivedCandidateId, approvedRunningCanonical, t6]);

    s8Request.derivedReviewEventId = finalAcceptId;
    s8Request.reviewEventId = finalAcceptId;
    s8Verified = (await source.verify(s8Request)) as VerifiedDerivedReviewSource;
    expect(s8Verified.eventId).toBe(finalAcceptId);
  });

  it('strengthened publication transaction guards reject mismatches and roll back completely', async () => {
    // Exercise the database guard BEFORE valid publication. A conflicting canonical
    // after publication would rightly be stopped earlier by the domain preflight.
    const before = await repository.readActiveSnapshot();
    const validPreview = prepareAuthorityPublication(s8Verified, s8Request, s8Verified.activeSnapshotId, before.entries);
    const tamperedPreview = {
      ...validPreview,
      entry: { ...validPreview.entry, canonical: 'Wrong Canonical' }
    };

    await expect(repository.publish(tamperedPreview, auth, s8Verified, '2026-10-10T12:14:00.000Z')).rejects.toThrow();

    const after = await repository.readActiveSnapshot();
    expect(after).toEqual(before);
  });

  it('publishes derived authority concurrently with idempotent result and exact running-text surface', async () => {
    const active = await repository.readActiveSnapshot();
    const preview = prepareAuthorityPublication(s8Verified, s8Request, s8Verified.activeSnapshotId, active.entries);
    expect(preview.exactRuntimeInputPhrase).toBe(runningTextSurface);
    expect(preview.expectedDeterministicOutput).toBe(approvedRunningCanonical);

    const results = await Promise.all([
      repository.publish(preview, auth, s8Verified, '2026-10-10T12:15:00.000Z'),
      repository.publish(preview, auth, s8Verified, '2026-10-10T12:15:00.000Z')
    ]);
    expect(new Set(results.map(r => r.snapshotId)).size).toBe(1);
    derivedPublishedSnapshotId = results[0].snapshotId;

    const published = await repository.readActiveSnapshot();
    const entry = published.entries.find(e => e.persianSurface === runningTextSurface);
    expect(entry).toBeDefined();
    expect(entry?.canonical).toBe(approvedRunningCanonical);
    expect(entry?.provenance.derivedCandidateId).toBe(derivedCandidateId);
    expect(entry?.provenance.parentCandidateId).toBe(parentCandidateId);
  });

  it('withdraws, rolls back derived authority, and reloads across repository restart', async () => {
    const published = await repository.readActiveSnapshot();
    const entry = published.entries.find(e => e.persianSurface === runningTextSurface)!;
    const initialCount = published.entries.length;

    const withdrawn = await repository.withdraw(entry.entryId, auth, '2026-10-10T12:20:00.000Z', 'Test derived withdrawal');
    expect(withdrawn.entries.find(e => e.entryId === entry.entryId)).toBeUndefined();
    expect(withdrawn.entries.length).toBe(initialCount - 1);

    const restored = await repository.rollback(derivedPublishedSnapshotId, auth, '2026-10-10T12:25:00.000Z', 'Test derived rollback restoration');
    expect(restored.entries.find(e => e.entryId === entry.entryId)).toBeDefined();

    const restarted = new NeonAuthorityRepository(process.env.PHASE8R_TEST_ADMIN_DATABASE_URL!, {
      namespace: process.env.PHASE8R_TEST_NAMESPACE!,
      expectedHost: adminHost,
      expectedDatabaseFingerprint: adminFingerprint,
      administrator: true,
      allowWrites: true,
      isolation: 'ISOLATED_NEON_BRANCH',
      expectedAuthorizationSha256: '9'.repeat(64),
      expectedAdministratorRef: 'phase8r-integration-admin'
    });
    expect(await restarted.readActiveSnapshot()).toEqual(restored);
  });

  it('exports published authority snapshot to runtime and resolves exact running-text form without AI', async () => {
    const activeSnapshot = await repository.readActiveSnapshot();
    const res = transliterate(runningTextSurface, 'ijmes_full', [], undefined, undefined, {
      publishedAuthoritySnapshot: activeSnapshot
    });
    expect(res.output).toBe(approvedRunningCanonical);
    expect(res.status).toBe('LEXICON_RESOLVED');
    expect(res.authority?.kind).toBe('PUBLISHED_SCHOLARLY_AUTHORITY');

    const catRes = transliterate(originalCatalogueSurface, 'ijmes_full', [], undefined, undefined, {
      publishedAuthoritySnapshot: activeSnapshot
    });
    expect(catRes.authority).toBeUndefined();
  });
});
