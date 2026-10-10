/** Phase 8O: verify isolated Staging, read existing BSB evidence, append human review events only. */
import 'server-only';
import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import { databaseIdentityFingerprint } from '../evidence-store/guard';
import { lexicalCandidateSchema } from '../../validation/lexical-evidence/schema';
import { buildBsbScholarlyReviewPacket,makePendingDecisionTemplate,validateBsbHumanReviewDecisions } from '../evidence-store/bsbScholarlyReview';
import { triageFor } from './bsbEditorialTriage';
import type { ScholarlyReviewPacket, ScholarlyReviewDecision, Disposition } from '../evidence-store/bsbScholarlyReview';
import type { LexicalCandidate } from '../../validation/lexical-evidence/types';

const BRANCH='br-noisy-field-b2m5q1zb';
const HOST='ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const FINGERPRINT='721280eed36907f5da9a76e5937c2bda28c70bc9cc01e695d4c6072f80fbeae2';
const SNAPSHOT='snapshot-f76feb36ca85541c8faafb42';
const rows=(result:unknown):Record<string,unknown>[]=>Array.isArray(result)?result as Record<string,unknown>[]:[];
const val=(x:unknown)=>String(x??'');
export type ReviewEvent={
  eventId:string;candidateId:string;basisSha256:string;kind:'DRAFT'|'ACCEPT'|'REJECT'|'DEFER';
  reviewerRef:string|null;canonical:string|null;profile:'ijmes_full'|'ijmes_title'|null;
  rationale:string|null;reviewedAt:string|null;humanAttestation:string|null;
};
export type ReviewCard={
  candidateId:string;basisSha256:string;persian:string;category:string;sourceRecordId:string;
  sourceUrl:string;variants:Array<{value:string;classification:string;sourceField:string}>;
  providerFields:string[];queue:'EDITORIAL'|'SPECIALIST'|'FAST';draft:string;
  lastEvent:ReviewEvent|null;
};
export type ReviewQueueData={snapshotId:string;packetSha256:string;items:ReviewCard[];
  counts:{PENDING:number;DRAFT:number;ACCEPT:number;REJECT:number;DEFER:number};
  storageMode:'NEON_STAGING_REVIEW_LEDGER'};
type SqlClient=ReturnType<typeof neon>;
function getSql():SqlClient{
  const connection=process.env.PHASE8O_REVIEW_STAGING_DATABASE_URL;
  if(!connection||new URL(connection).hostname.toLowerCase()!==HOST)
    throw new Error('Review Staging connection not configured for approved Neon host');
  return neon(connection);
}
async function assertStaging(sql:SqlClient):Promise<{manifestChecksum:string}>{
  const identity=rows(await sql.query("SELECT current_setting('neon.branch_id',true) AS branch_id,current_database() AS db,current_user AS username,current_schema() AS schema"))[0];
  if(!identity||identity.branch_id!==BRANCH
    ||databaseIdentityFingerprint({host:HOST,database:val(identity.db),user:val(identity.username),schema:val(identity.schema)})!==FINGERPRINT)
    throw new Error('Review Staging database identity mismatch');
  const binding=rows(await sql.query('SELECT namespace,runtime,isolation,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true'))[0];
  if(!binding||binding.namespace!=='phase8g_staging'||binding.runtime!=='preview'
    ||binding.isolation!=='ISOLATED_NEON_BRANCH'||binding.database_fingerprint!==FINGERPRINT
    ||binding.writes_enabled!==false)throw new Error('Evidence binding must remain read-only');
  const snap=rows(await sql.query(`
    SELECT s.snapshot_id,s.manifest_checksum,s.status,s.candidate_count,
      s.manifest_checksum=evidence_manifest_checksum(s.schema_version,s.extraction_version,s.source_version_ids,s.manifest_json->'candidates') AS checksum_valid
    FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id WHERE a.singleton=true
  `))[0];
  if(!snap||snap.snapshot_id!==SNAPSHOT||snap.status!=='ACTIVE'||Number(snap.candidate_count)!==75||snap.checksum_valid!==true)
    throw new Error('Active BSB snapshot changed or failed integrity verification');
  return {manifestChecksum:val(snap.manifest_checksum).trim()};
}
async function loadPacket(sql:SqlClient,manifestChecksum:string):Promise<ScholarlyReviewPacket>{
  const projections=rows(await sql.query(`
    SELECT p.candidate_id,p.content_hash,p.source_version_id,p.candidate_json
    FROM evidence_active_snapshot a JOIN evidence_candidate_projection p ON p.snapshot_id=a.snapshot_id
    WHERE a.singleton=true AND p.provider='BSB_SRU_MARCXML'
    ORDER BY p.candidate_id,p.source_version_id
  `));
  if(projections.length!==75)throw new Error('Exactly 75 BSB candidate projections required');
  return buildBsbScholarlyReviewPacket({
    snapshotId:SNAPSHOT,manifestChecksum,
    rows:projections.map(p=>{
      const candidate=lexicalCandidateSchema.parse(p.candidate_json) as LexicalCandidate;
      if(candidate.candidateId!==p.candidate_id||candidate.contentHash!==val(p.content_hash).trim())
        throw new Error('Projection candidate identity/checksum conflict');
      return {sourceVersionId:val(p.source_version_id),candidate};
    }),
  });
}
async function latestEvents(sql:SqlClient):Promise<Map<string,ReviewEvent>>{
  const result=rows(await sql.query(`
    SELECT DISTINCT ON (candidate_id) candidate_id,decision_json
    FROM phase8o_review_event WHERE active_snapshot_id=$1
    ORDER BY candidate_id, decided_at DESC,event_id DESC
  `,[SNAPSHOT]));
  const map=new Map<string,ReviewEvent>();
  for(const r of result){
    const e=r.decision_json as ReviewEvent;
    if(!e||e.candidateId!==r.candidate_id)throw new Error('Corrupt review ledger event');
    map.set(e.candidateId,e);
  }
  return map;
}
export async function loadReviewQueue():Promise<ReviewQueueData>{
  const sql=getSql();
  const {manifestChecksum}=await assertStaging(sql);
  const packet=await loadPacket(sql,manifestChecksum);
  const events=await latestEvents(sql);
  const counts={PENDING:0,DRAFT:0,ACCEPT:0,REJECT:0,DEFER:0};
  const items=packet.items.map(item=>{
    const c=item.candidateSnapshot;
    const triage=triageFor(c.candidateId);
    const event=events.get(c.candidateId)??null;
    if(event&&event.basisSha256!==item.reviewBasisSha256)
      throw new Error('Ledger contains stale decision basis, manual reconciliation required');
    counts[event?.kind??'PENDING']++;
    return {candidateId:c.candidateId,basisSha256:item.reviewBasisSha256,
      persian:c.originalPersianForm,category:c.category,sourceRecordId:c.sourceRecordIds[0],
      sourceUrl:c.sourceUrls[0]??'',variants:c.observedLatinVariants.map(v=>({value:v.value,classification:v.classification,sourceField:v.sourceField})),
      providerFields:(c.providerEvidence??[]).map(p=>p.sourceField+' · '+p.relationship),
      queue:triage.queue,draft:triage.draft,lastEvent:event} satisfies ReviewCard;
  });
  // Recheck live snapshot after reading all projections.
  if((await assertStaging(sql)).manifestChecksum!==manifestChecksum)
    throw new Error('Staging changed during review request');
  return {snapshotId:SNAPSHOT,packetSha256:packet.packetSha256,items,counts,storageMode:'NEON_STAGING_REVIEW_LEDGER'};
}
export type SaveReviewInput={
  candidateId:string;basisSha256:string;kind:'DRAFT'|'ACCEPT'|'REJECT'|'DEFER';
  reviewerRef?:string|null;canonical?:string|null;profile?:'ijmes_full'|'ijmes_title'|null;
  rationale?:string|null;humanAttestation?:string|null;
};
function validDraft(input:SaveReviewInput):boolean{
  return (input.canonical===null||input.canonical===undefined||(typeof input.canonical==='string'&&input.canonical.length<=1000))
    &&(input.rationale===null||input.rationale===undefined||(typeof input.rationale==='string'&&input.rationale.length<=4000));
}
export async function saveReviewDecision(input:SaveReviewInput):Promise<ReviewEvent>{
  if(!input||!/^lex-[a-f0-9]{20}$/u.test(input.candidateId)
    ||!/^[a-f0-9]{64}$/u.test(input.basisSha256)
    ||!['DRAFT','ACCEPT','REJECT','DEFER'].includes(input.kind))
    throw new Error('Invalid review identity, hash or disposition');
  const sql=getSql();
  const {manifestChecksum}=await assertStaging(sql);
  const packet=await loadPacket(sql,manifestChecksum);
  const item=packet.items.find(x=>x.candidateId===input.candidateId);
  if(!item||item.reviewBasisSha256!==input.basisSha256)throw new Error('Stale or unknown review basis');
  if(typeof input.reviewerRef==='string'&&input.reviewerRef.length>200)throw new Error('Reviewer identifier too long');
  if(input.kind==='DRAFT'&&!validDraft(input))throw new Error('Invalid draft input');
  const reviewedAt=new Date().toISOString();
  const event:ReviewEvent={
    eventId:randomUUID(),candidateId:input.candidateId,basisSha256:item.reviewBasisSha256,
    kind:input.kind,reviewerRef:input.reviewerRef?.trim()||null,
    canonical:input.canonical?.trim()||null,profile:input.profile??null,
    rationale:input.rationale?.trim()||null,reviewedAt:input.kind==='DRAFT'?null:reviewedAt,
    humanAttestation:input.kind==='ACCEPT'?input.humanAttestation??null:null,
  };
  if(input.kind==='DRAFT'){
    if(event.humanAttestation||(event.canonical!==null&&event.canonical.length>1000))throw new Error('Invalid draft');
    // DRAFT never grants scientific authority.
    event.profile=null;
  }else{
    const proposal=makePendingDecisionTemplate(packet);
    const decision:ScholarlyReviewDecision={
      candidateId:event.candidateId,reviewBasisSha256:event.basisSha256,
      disposition:input.kind as Disposition,reviewerRef:event.reviewerRef,
      reviewedAt:event.reviewedAt,rationale:event.rationale,canonical:event.canonical,
      profile:event.profile,humanAttestation:input.kind==='ACCEPT'?input.humanAttestation as ScholarlyReviewDecision['humanAttestation']:null,
    };
    proposal.decisions=proposal.decisions.map(row=>row.candidateId===input.candidateId?decision:row);
    validateBsbHumanReviewDecisions(packet,proposal);
  }
  // SQL-side active snapshot check prevents stale submissions if publication changes mid-request.
  const inserted=rows(await sql.query(`
    INSERT INTO phase8o_review_event(event_id,active_snapshot_id,candidate_id,review_basis_sha256,decision_kind,reviewer_ref,decision_json)
    SELECT $1::uuid,$2,$3,$4,$5,$6,$7::jsonb
    WHERE EXISTS(
      SELECT 1 FROM evidence_active_snapshot a
      JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id
      JOIN evidence_candidate_projection p ON p.snapshot_id=a.snapshot_id AND p.candidate_id=$3
      JOIN evidence_environment_binding b ON b.singleton=true
      WHERE a.singleton=true AND a.snapshot_id=$2 AND s.manifest_checksum=$8
        AND b.writes_enabled=false AND p.content_hash=$9
    ) RETURNING event_id
  `,[event.eventId,SNAPSHOT,event.candidateId,event.basisSha256,event.kind,event.reviewerRef,JSON.stringify(event),
    packet.manifestChecksum,item.candidateSnapshot.contentHash]));
  if(inserted.length!==1)throw new Error('Staging or candidate changed: decision not saved');
  return event;
}
