/** Scholarly review of BSB catalogue evidence is not automatic IJMES authority. */
import { createHash } from 'node:crypto';
import { lexicalCandidateSchema } from '../../validation/lexical-evidence/schema';
import type { LexicalCandidate } from '../../validation/lexical-evidence/types';
import { assertCandidateContentHash } from './publication';
import { validateManualTransliteration } from '../../domain/review/validation';

const sha=(text:string):string=>createHash('sha256').update(text,'utf8').digest('hex');
const HASH=/^[0-9a-f]{64}$/u;
const SNAPSHOT='snapshot-f76feb36ca85541c8faafb42';
function invariant(condition:unknown,message:string):asserts condition{
  if(!condition)throw new Error('BSB scholarly review rejected: '+message);
}
export interface ScholarlyReviewItem{
  candidateId:string;
  sourceVersionId:string;
  reviewBasisSha256:string;
  candidateSnapshot:LexicalCandidate;
}
export interface ScholarlyReviewPacket{
  schemaVersion:'phase8n-bsb-scholarly-review-v1';
  activeSnapshotId:string;
  manifestChecksum:string;
  sourceProvider:'BSB_SRU_MARCXML';
  candidateCount:75;
  items:ScholarlyReviewItem[];
  packetSha256:string;
  reviewStatus:'AWAITING_EXPLICIT_HUMAN_DECISIONS';
  publicationAuthorized:false;
}
export type Disposition='PENDING'|'ACCEPT'|'REJECT'|'DEFER';
export interface ScholarlyReviewDecision{
  candidateId:string;
  reviewBasisSha256:string;
  disposition:Disposition;
  reviewerRef:string|null;
  reviewedAt:string|null;
  rationale:string|null;
  canonical:string|null;
  profile:'ijmes_full'|'ijmes_title'|null;
  humanAttestation:'I_PERSONALLY_VERIFIED_THIS_IJMES_FORM'|null;
}
export interface ScholarlyReviewDecisionFile{
  schemaVersion:'phase8n-bsb-human-decisions-v1';
  packetSha256:string;
  activeSnapshotId:string;
  decisions:ScholarlyReviewDecision[];
}
export interface DecisionValidation{
  schemaVersion:'phase8n-bsb-reviewed-proposal-v1';
  packetSha256:string;
  activeSnapshotId:string;
  counts:Record<Disposition,number>;
  accepted:Array<{candidateId:string;reviewBasisSha256:string;sourceRecordIds:string[];canonical:string;profile:'ijmes_full'|'ijmes_title';reviewerRef:string;reviewedAt:string;rationale:string}>;
  promotionAuthorized:false;
  evidenceSnapshotModified:false;
}

function basis(snapshotId:string,manifestChecksum:string,sourceVersionId:string,candidate:LexicalCandidate):string{
  return sha(JSON.stringify({snapshotId,manifestChecksum,sourceVersionId,candidateId:candidate.candidateId,contentHash:candidate.contentHash,
    persian:candidate.originalPersianForm,normalized:candidate.normalizedSearchForm,category:candidate.category,
    context:candidate.linguisticContext,providerEvidence:candidate.providerEvidence??[],observedLatinVariants:candidate.observedLatinVariants}));
}
function packetBody(packet:ScholarlyReviewPacket){
  return {schemaVersion:packet.schemaVersion,activeSnapshotId:packet.activeSnapshotId,
    manifestChecksum:packet.manifestChecksum,sourceProvider:packet.sourceProvider,
    candidateCount:packet.candidateCount,items:packet.items,reviewStatus:packet.reviewStatus,publicationAuthorized:packet.publicationAuthorized};
}
export function buildBsbScholarlyReviewPacket(input:{
  snapshotId:string;manifestChecksum:string;rows:Array<{sourceVersionId:string;candidate:LexicalCandidate}>;
}):ScholarlyReviewPacket {
  const {snapshotId,manifestChecksum,rows}=input;
  invariant(snapshotId===SNAPSHOT && HASH.test(manifestChecksum),'unexpected active snapshot or checksum');
  invariant(rows.length===75,'expected exactly 75 active candidate projections');
  const seen=new Set<string>();
  const items:ScholarlyReviewItem[]=rows.map(row=>{
    const c=lexicalCandidateSchema.parse(row.candidate);
    assertCandidateContentHash(c);
    invariant(c.reviewStatus==='UNREVIEWED'&&c.authorityStatus==='NON_AUTHORITATIVE_CANDIDATE'
      &&c.evidenceStatus==='CANDIDATE','candidate already promoted or not a candidate');
    invariant(!seen.has(c.candidateId),'duplicate candidate identity');
    seen.add(c.candidateId);
    invariant(typeof row.sourceVersionId==='string'&&row.sourceVersionId.startsWith('BSB_SRU_MARCXML:')
      &&c.sourceRecordIds.length===1 && row.sourceVersionId.startsWith('BSB_SRU_MARCXML:'+c.sourceRecordIds[0]+':'),
      'inconsistent BSB source record version identity');
    invariant((c.providerEvidence??[]).length>0
      &&c.providerEvidence!.every(e=>e.provider==='BSB_SRU_MARCXML'&&e.sourceRecordId===c.sourceRecordIds[0]),
      'missing or mixed source provenance');
    return {candidateId:c.candidateId,sourceVersionId:row.sourceVersionId,
      reviewBasisSha256:basis(snapshotId,manifestChecksum,row.sourceVersionId,c),candidateSnapshot:c};
  }).sort((a,b)=>a.candidateId.localeCompare(b.candidateId,'en'));
  const packet:ScholarlyReviewPacket={
    schemaVersion:'phase8n-bsb-scholarly-review-v1',activeSnapshotId:snapshotId,manifestChecksum,
    sourceProvider:'BSB_SRU_MARCXML',candidateCount:75,items,packetSha256:'',
    reviewStatus:'AWAITING_EXPLICIT_HUMAN_DECISIONS',publicationAuthorized:false,
  };
  packet.packetSha256=sha(JSON.stringify(packetBody(packet)));
  return packet;
}
export function verifyBsbScholarlyReviewPacket(packet:ScholarlyReviewPacket):void{
  invariant(packet.schemaVersion==='phase8n-bsb-scholarly-review-v1'
    &&packet.sourceProvider==='BSB_SRU_MARCXML'
    &&packet.reviewStatus==='AWAITING_EXPLICIT_HUMAN_DECISIONS'
    &&packet.publicationAuthorized===false
    &&packet.candidateCount===75 &&packet.items?.length===75,
    'unexpected packet policy or size');
  const rebuilt=buildBsbScholarlyReviewPacket({
    snapshotId:packet.activeSnapshotId,manifestChecksum:packet.manifestChecksum,
    rows:packet.items.map(x=>({sourceVersionId:x.sourceVersionId,candidate:x.candidateSnapshot})),
  });
  invariant(packet.packetSha256===rebuilt.packetSha256
    &&packet.items.every((item,index)=>item.reviewBasisSha256===rebuilt.items[index].reviewBasisSha256
      &&item.candidateId===rebuilt.items[index].candidateId),
    'packet or review basis integrity mismatch');
}
export function makePendingDecisionTemplate(packet:ScholarlyReviewPacket):ScholarlyReviewDecisionFile{
  verifyBsbScholarlyReviewPacket(packet);
  return {
    schemaVersion:'phase8n-bsb-human-decisions-v1',packetSha256:packet.packetSha256,
    activeSnapshotId:packet.activeSnapshotId,
    decisions:packet.items.map(item=>({
      candidateId:item.candidateId,reviewBasisSha256:item.reviewBasisSha256,
      disposition:'PENDING',reviewerRef:null,reviewedAt:null,rationale:null,
      canonical:null,profile:null,humanAttestation:null,
    })),
  };
}
const nonblank=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
export function validateBsbHumanReviewDecisions(packet:ScholarlyReviewPacket,source:ScholarlyReviewDecisionFile):DecisionValidation{
  verifyBsbScholarlyReviewPacket(packet);
  invariant(source?.schemaVersion==='phase8n-bsb-human-decisions-v1'
    &&source.packetSha256===packet.packetSha256
    &&source.activeSnapshotId===packet.activeSnapshotId
    &&Array.isArray(source.decisions)&&source.decisions.length===75,
    'decisions do not match pinned review basis');
  const byId=new Map(packet.items.map(item=>[item.candidateId,item]));
  const seen=new Set<string>();
  const counts:Record<Disposition,number>={PENDING:0,ACCEPT:0,REJECT:0,DEFER:0};
  const accepted:DecisionValidation['accepted']=[];
  for(const decision of source.decisions){
    invariant(decision&&Object.keys(decision).sort().join('|')===
      ['candidateId','reviewBasisSha256','disposition','reviewerRef','reviewedAt','rationale','canonical','profile','humanAttestation'].sort().join('|'),
      'decision fields missing or unrecognized');
    const item=byId.get(decision.candidateId);
    invariant(item&&!seen.has(decision.candidateId)
      &&item.reviewBasisSha256===decision.reviewBasisSha256,'unknown, duplicate or stale review basis');
    seen.add(decision.candidateId);
    invariant(Object.hasOwn(counts,decision.disposition),'unrecognized decision');
    counts[decision.disposition]++;
    if(decision.disposition==='PENDING'){
      invariant([decision.reviewerRef,decision.reviewedAt,decision.rationale,decision.canonical,
        decision.profile,decision.humanAttestation].every(v=>v===null),
      'pending decision may not contain reviewer/approval data');
      continue;
    }
    invariant(nonblank(decision.reviewerRef)&&decision.reviewerRef.length<=200
      &&nonblank(decision.rationale)&&decision.rationale.trim().length>=20&&decision.rationale.length<=4000
      &&typeof decision.reviewedAt==='string'&&!Number.isNaN(Date.parse(decision.reviewedAt))
      &&new Date(decision.reviewedAt).toISOString()===decision.reviewedAt,
      'reviewer provenance, date or substantive rationale missing');
    if(decision.disposition==='ACCEPT'){
      invariant(decision.profile==='ijmes_full'||decision.profile==='ijmes_title','IJMES profile must be explicit');
      invariant(decision.humanAttestation==='I_PERSONALLY_VERIFIED_THIS_IJMES_FORM',
        'explicit scholarly attestation missing');
      invariant(nonblank(decision.canonical)&&decision.canonical===decision.canonical.normalize('NFC')
        &&decision.canonical===decision.canonical.trim()
        &&validateManualTransliteration(decision.canonical).valid,
        'invalid explicitly selected scholarly canonical');
      accepted.push({
        candidateId:decision.candidateId,reviewBasisSha256:item.reviewBasisSha256,
        sourceRecordIds:[...item.candidateSnapshot.sourceRecordIds],canonical:decision.canonical,
        profile:decision.profile,reviewerRef:decision.reviewerRef,
        reviewedAt:decision.reviewedAt!,rationale:decision.rationale!,
      });
    }else{
      invariant(decision.canonical===null&&decision.profile===null&&decision.humanAttestation===null,
        'rejected/deferred decision cannot contain IJMES canonical');
    }
  }
  invariant(seen.size===packet.items.length,'incomplete reviewer decision coverage');
  return {
    schemaVersion:'phase8n-bsb-reviewed-proposal-v1',packetSha256:packet.packetSha256,
    activeSnapshotId:packet.activeSnapshotId,counts,accepted,
    promotionAuthorized:false,evidenceSnapshotModified:false,
  };
}
function csv(value:string):string{
  const x=/^\s*[=+@-]/u.test(value)?"'"+value:value;
  return '"'+x.replaceAll('"','""').replace(/[\r\n]/gu,' ')+'"';
}
export function renderBsbReviewCsv(packet:ScholarlyReviewPacket):string{
  verifyBsbScholarlyReviewPacket(packet);
  const columns=['candidateId','reviewBasisSha256','category','persianOriginal','observedLatinAndRelationship',
    'sourceRecordId','sourceUrl','MARCFields','IJMESCanonicalToReview','proposedProfile','reviewDisposition','rationale','reviewerRef','reviewedAt'];
  return [columns,...packet.items.map(item=>{
    const c=item.candidateSnapshot;
    return [item.candidateId,item.reviewBasisSha256,c.category,c.originalPersianForm,
      c.observedLatinVariants.map(v=>v.value+' ['+v.classification+'] '+v.sourceField).join(' | '),
      c.sourceRecordIds.join(' | '),c.sourceUrls.join(' | '),
      (c.providerEvidence??[]).map(e=>e.sourceField+' ('+e.relationship+')').join(' | '),
      '','','PENDING','','',''];
  })].map(row=>row.map(csv).join(',')).join('\r\n')+'\r\n';
}
