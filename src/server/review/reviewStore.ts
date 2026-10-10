/** Staging-only scholarly review. Cursor-bound evidence and append-only decisions. */
import 'server-only';
import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import { databaseIdentityFingerprint } from '../evidence-store/guard';
import { lexicalCandidateSchema } from '../../validation/lexical-evidence/schema';
import { assertCandidateContentHash } from '../evidence-store/publication';
import {
  buildBsbScholarlyReviewPacket, computeBsbReviewBasis,
  makePendingDecisionTemplate, validateBsbHumanReviewDecisions,
  type ScholarlyReviewDecision, type Disposition,
} from '../evidence-store/bsbScholarlyReview';
import {triageFor, BSB_EDITORIAL_TRIAGE} from './bsbEditorialTriage';
import type {LexicalCandidate} from '../../validation/lexical-evidence/types';

const BRANCH='br-noisy-field-b2m5q1zb';
const HOST='ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const FINGERPRINT='721280eed36907f5da9a76e5937c2bda28c70bc9cc01e695d4c6072f80fbeae2';
const MAX_TOTAL=10000,MAX_PAGE=50;
const rows=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?v as Record<string,unknown>[]:[];
const s=(v:unknown)=>String(v??'');
type Sql=ReturnType<typeof neon>;
type QueueGroup='ALL'|'EDITORIAL'|'SPECIALIST'|'FAST'|'NEW';
type QueueStatus='ALL'|'PENDING'|'DRAFT'|'ACCEPT'|'REJECT'|'DEFER';
export type ReviewEvent={eventId:string;candidateId:string;basisSha256:string;kind:'DRAFT'|'ACCEPT'|'REJECT'|'DEFER';
  reviewerRef:string|null;canonical:string|null;profile:'ijmes_full'|'ijmes_title'|null;
  rationale:string|null;reviewedAt:string|null;humanAttestation:string|null};
export type ReviewCard={candidateId:string;basisSha256:string;persian:string;category:string;sourceRecordId:string;
  sourceUrl:string;variants:Array<{value:string;classification:string;sourceField:string}>;
  providerFields:string[];queue:QueueGroup;draft:string;lastEvent:ReviewEvent|null};
export type ReviewQueueData={
  snapshotId:string;manifestChecksum:string;items:ReviewCard[];total:number;
  page:number;pageSize:number;pageCount:number;filteredTotal:number;
  groupTotals:Record<QueueGroup,number>;
  counts:{PENDING:number;DRAFT:number;ACCEPT:number;REJECT:number;DEFER:number};
  storageMode:'NEON_STAGING_REVIEW_LEDGER';
};
export type ReviewQuery={page?:number;pageSize?:number;group?:QueueGroup;status?:QueueStatus;search?:string};
function getSql():Sql{
  const conn=process.env.PHASE8O_REVIEW_STAGING_DATABASE_URL;
  if(!conn||new URL(conn).hostname.toLowerCase()!==HOST)throw new Error('Review Staging connection not configured');
  return neon(conn);
}
async function assertStaging(sql:Sql):Promise<{snapshotId:string;manifestChecksum:string;candidateCount:number}>{
  const identity=rows(await sql.query("SELECT current_setting('neon.branch_id',true) AS branch_id,current_database() AS db,current_user AS username,current_schema() AS schema"))[0];
  if(!identity||identity.branch_id!==BRANCH
    ||databaseIdentityFingerprint({host:HOST,database:s(identity.db),user:s(identity.username),schema:s(identity.schema)})!==FINGERPRINT)
    throw new Error('Review Staging identity mismatch');
  const binding=rows(await sql.query('SELECT namespace,runtime,isolation,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true'))[0];
  if(!binding||binding.namespace!=='phase8g_staging'||binding.runtime!=='preview'
    ||binding.isolation!=='ISOLATED_NEON_BRANCH'||binding.database_fingerprint!==FINGERPRINT
    ||binding.writes_enabled!==false)throw new Error('Evidence write window must remain closed');
  const row=rows(await sql.query(`
    SELECT s.snapshot_id,s.manifest_checksum,s.status,s.candidate_count,
      s.manifest_checksum=evidence_manifest_checksum(s.schema_version,s.extraction_version,s.source_version_ids,s.manifest_json->'candidates') AS intact
    FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id WHERE a.singleton=true
  `))[0];
  const count=Number(row?.candidate_count);
  if(!row||row.status!=='ACTIVE'||row.intact!==true
    ||!/^snapshot-[a-f0-9]{24}$/u.test(s(row.snapshot_id))
    ||!Number.isInteger(count)||count<1||count>MAX_TOTAL)
    throw new Error('Review snapshot integrity or capacity check failed');
  return {snapshotId:s(row.snapshot_id),manifestChecksum:s(row.manifest_checksum).trim(),candidateCount:count};
}
function validateParams(p:ReviewQuery){
  const page=p.page??1,pageSize=p.pageSize??25,group=p.group??'ALL',status=p.status??'ALL',search=(p.search??'').trim();
  if(!Number.isSafeInteger(page)||page<1||page>400
    ||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE
    ||!['ALL','EDITORIAL','SPECIALIST','FAST','NEW'].includes(group)
    ||!['ALL','PENDING','DRAFT','ACCEPT','REJECT','DEFER'].includes(status)
    ||search.length>120)throw new Error('Invalid review pagination or filters');
  return {page,pageSize,group,status,search};
}
const knownIds=Object.keys(BSB_EDITORIAL_TRIAGE);
export async function loadReviewQueue(params:ReviewQuery={}):Promise<ReviewQueueData>{
  const q=validateParams(params),sql=getSql();
  const meta=await assertStaging(sql);
  const summary=rows(await sql.query(`
    WITH latest AS (
      SELECT DISTINCT ON (candidate_id) candidate_id,decision_kind FROM phase8o_review_event
      WHERE active_snapshot_id=$1 ORDER BY candidate_id,decided_at DESC,event_id DESC
    )
    SELECT COALESCE(latest.decision_kind,'PENDING') AS status,count(*)::int AS n
    FROM evidence_candidate_projection p LEFT JOIN latest ON latest.candidate_id=p.candidate_id
    WHERE p.snapshot_id=$1 AND p.provider='BSB_SRU_MARCXML'
    GROUP BY COALESCE(latest.decision_kind,'PENDING')
  `,[meta.snapshotId]));
  const counts={PENDING:0,DRAFT:0,ACCEPT:0,REJECT:0,DEFER:0};
  for(const row of summary){const key=s(row.status) as keyof typeof counts;if(Object.hasOwn(counts,key))counts[key]=Number(row.n);}
  const total=Object.values(counts).reduce((acc,n)=>acc+n,0);
  if(total!==meta.candidateCount)throw new Error('Candidate projection count differs from immutable snapshot manifest');

  const groups=rows(await sql.query(`
    SELECT p.candidate_id FROM evidence_candidate_projection p
    WHERE p.snapshot_id=$1 AND p.provider='BSB_SRU_MARCXML'
  `,[meta.snapshotId]));
  const groupTotals={ALL:total,EDITORIAL:0,SPECIALIST:0,FAST:0,NEW:0};
  for(const r of groups){const id=s(r.candidate_id);
    const category=knownIds.includes(id)?triageFor(id).queue:'NEW';groupTotals[category]++;
  }
  const groupIds=q.group==='ALL'?null:q.group==='NEW'?knownIds:
    knownIds.filter(id=>triageFor(id).queue===q.group);
  const groupNot=q.group==='NEW';
  const escaped=q.search.replace(/[\\%_]/gu,x=>'\\'+x);
  const like='%'+escaped+'%';
  const filter=`
    WITH latest AS (
      SELECT DISTINCT ON (candidate_id) candidate_id,decision_kind,decision_json
      FROM phase8o_review_event WHERE active_snapshot_id=$1
      ORDER BY candidate_id,decided_at DESC,event_id DESC
    ),
    filtered AS (
      SELECT p.candidate_id,p.source_version_id,p.candidate_json,p.content_hash,
        latest.decision_json,COALESCE(latest.decision_kind,'PENDING') AS review_kind
      FROM evidence_candidate_projection p LEFT JOIN latest ON latest.candidate_id=p.candidate_id
      WHERE p.snapshot_id=$1 AND p.provider='BSB_SRU_MARCXML'
        AND ($2::text='ALL' OR COALESCE(latest.decision_kind,'PENDING')=$2)
        AND ($3::text='' OR p.persian_form ILIKE $4 ESCAPE '\\'
          OR p.candidate_id ILIKE $4 ESCAPE '\\' OR p.candidate_json::text ILIKE $4 ESCAPE '\\')
        AND ($5::text[] IS NULL OR (p.candidate_id=ANY($5::text[])) <> $6::boolean)
    )
  `;
  const bind=[meta.snapshotId,q.status,q.search,like,groupIds,groupNot];
  const cnt=rows(await sql.query(filter+' SELECT count(*)::int AS n FROM filtered',bind))[0];
  const filteredTotal=Number(cnt?.n??0),offset=(q.page-1)*q.pageSize;
  const pageRows=rows(await sql.query(filter+`
    SELECT candidate_id,source_version_id,candidate_json,content_hash,decision_json
    FROM filtered ORDER BY candidate_id,source_version_id LIMIT $7 OFFSET $8
  `,[...bind,q.pageSize,offset]));
  const items:ReviewCard[]=pageRows.map(r=>{
    const c=lexicalCandidateSchema.parse(r.candidate_json) as LexicalCandidate;
    assertCandidateContentHash(c);
    if(c.candidateId!==r.candidate_id||c.contentHash!==s(r.content_hash))throw new Error('Candidate evidence content mismatch');
    if(c.authorityStatus!=='NON_AUTHORITATIVE_CANDIDATE'||c.reviewStatus!=='UNREVIEWED')
      throw new Error('Evidence authority invariant violated');
    const event=(r.decision_json??null) as ReviewEvent|null;
    const basis=computeBsbReviewBasis(meta.snapshotId,meta.manifestChecksum,s(r.source_version_id),c);
    // Older snapshot decisions are never projected onto the new snapshot.
    if(event&&(event.candidateId!==c.candidateId||event.basisSha256!==basis))
      throw new Error('A decision is stale for the active source basis');
    const category=knownIds.includes(c.candidateId)?triageFor(c.candidateId):{queue:'NEW' as const,draft:''};
    return {candidateId:c.candidateId,basisSha256:basis,persian:c.originalPersianForm,
      category:c.category,sourceRecordId:c.sourceRecordIds[0],sourceUrl:c.sourceUrls[0]??'',
      variants:c.observedLatinVariants.map(v=>({value:v.value,classification:v.classification,sourceField:v.sourceField})),
      providerFields:(c.providerEvidence??[]).map(v=>v.sourceField+' · '+v.relationship),
      queue:category.queue,draft:category.draft,lastEvent:event};
  });
  const after=await assertStaging(sql);
  if(after.snapshotId!==meta.snapshotId||after.manifestChecksum!==meta.manifestChecksum)throw new Error('Active snapshot changed mid-query');
  return {snapshotId:meta.snapshotId,manifestChecksum:meta.manifestChecksum,items,total,page:q.page,
    pageSize:q.pageSize,pageCount:Math.ceil(filteredTotal/q.pageSize),filteredTotal,groupTotals,counts,
    storageMode:'NEON_STAGING_REVIEW_LEDGER'};
}
export type SaveReviewInput={candidateId:string;basisSha256:string;kind:'DRAFT'|'ACCEPT'|'REJECT'|'DEFER';
  reviewerRef?:string|null;canonical?:string|null;profile?:'ijmes_full'|'ijmes_title'|null;
  rationale?:string|null;humanAttestation?:string|null};
export async function saveReviewDecision(input:SaveReviewInput):Promise<ReviewEvent>{
  if(!input||!/^lex-[a-f0-9]{20}$/u.test(input.candidateId)
    ||!/^[a-f0-9]{64}$/u.test(input.basisSha256)
    ||!['DRAFT','ACCEPT','REJECT','DEFER'].includes(input.kind))
    throw new Error('Invalid review identity, hash or disposition');
  const sql=getSql(),meta=await assertStaging(sql);
  const found=rows(await sql.query(`
    SELECT source_version_id,candidate_json,content_hash
    FROM evidence_candidate_projection WHERE snapshot_id=$1 AND candidate_id=$2 AND provider='BSB_SRU_MARCXML'
  `,[meta.snapshotId,input.candidateId]));
  if(found.length!==1)throw new Error('Unknown or ambiguous active candidate');
  const c=lexicalCandidateSchema.parse(found[0].candidate_json) as LexicalCandidate;
  assertCandidateContentHash(c);
  if(c.candidateId!==input.candidateId||c.contentHash!==s(found[0].content_hash))throw new Error('Candidate content mismatch');
  const sourceVersionId=s(found[0].source_version_id);
  const basis=computeBsbReviewBasis(meta.snapshotId,meta.manifestChecksum,sourceVersionId,c);
  if(input.basisSha256!==basis)throw new Error('Stale review basis');
  if(typeof input.reviewerRef==='string'&&input.reviewerRef.length>200)throw new Error('Reviewer ID too long');
  const reviewedAt=new Date().toISOString();
  const event:ReviewEvent={
    eventId:randomUUID(),candidateId:c.candidateId,basisSha256:basis,kind:input.kind,
    reviewerRef:input.reviewerRef?.trim()||null,canonical:input.canonical?.trim()||null,
    profile:input.profile??null,rationale:input.rationale?.trim()||null,
    reviewedAt:input.kind==='DRAFT'?null:reviewedAt,
    humanAttestation:input.kind==='ACCEPT'?input.humanAttestation??null:null,
  };
  if(input.kind==='DRAFT'){
    if((event.canonical?.length??0)>1000||(event.rationale?.length??0)>4000
      ||event.humanAttestation)throw new Error('Invalid review draft');
    event.profile=null;
  }else{
    const packet=buildBsbScholarlyReviewPacket({snapshotId:meta.snapshotId,
      manifestChecksum:meta.manifestChecksum,rows:[{sourceVersionId,candidate:c}]});
    const template=makePendingDecisionTemplate(packet);
    const decision:ScholarlyReviewDecision={
      candidateId:c.candidateId,reviewBasisSha256:basis,disposition:input.kind as Disposition,
      reviewerRef:event.reviewerRef,reviewedAt:event.reviewedAt,rationale:event.rationale,
      canonical:event.canonical,profile:event.profile,
      humanAttestation:input.kind==='ACCEPT'?input.humanAttestation as ScholarlyReviewDecision['humanAttestation']:null,
    };
    template.decisions=[decision];
    validateBsbHumanReviewDecisions(packet,template);
  }
  const inserted=rows(await sql.query(`
    INSERT INTO phase8o_review_event(event_id,active_snapshot_id,candidate_id,review_basis_sha256,decision_kind,reviewer_ref,decision_json)
    SELECT $1::uuid,$2,$3,$4,$5,$6,$7::jsonb
    WHERE EXISTS(
      SELECT 1 FROM evidence_active_snapshot a
      JOIN evidence_snapshot sn ON sn.snapshot_id=a.snapshot_id
      JOIN evidence_candidate_projection p ON p.snapshot_id=a.snapshot_id AND p.candidate_id=$3
      JOIN evidence_environment_binding b ON b.singleton=true
      WHERE a.singleton=true AND a.snapshot_id=$2 AND sn.manifest_checksum=$8
        AND b.writes_enabled=false AND p.content_hash=$9
    ) RETURNING event_id
  `,[event.eventId,meta.snapshotId,c.candidateId,basis,event.kind,event.reviewerRef,
    JSON.stringify(event),meta.manifestChecksum,c.contentHash]));
  if(inserted.length!==1)throw new Error('Snapshot changed; decision not saved');
  return event;
}
