import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMarcCollection } from '../../validation/acquisition/bsb/marcxml';
import { adaptBsbRecord } from '../../validation/acquisition/bsb/adapter';
import { computeBsbReviewBasis } from '../evidence-store/bsbScholarlyReview';
import { verifyReviewSourceWithQuery, type TrustedSourceQuery } from './sourceVerification';
import { prepareAuthorityPublication, type AuthorityPublicationRequest } from './authorityPublication';

const xml=fs.readFileSync(path.resolve(__dirname,'../../../validation/acquisition/bsb/authentic-selected-records.v1.xml'),'utf8');
const candidate=parseMarcCollection(xml).flatMap(adaptBsbRecord)[0];
const eventId='11111111-1111-4111-8111-111111111111';
const snapshotId='snapshot-'+ 'a'.repeat(24),manifest='b'.repeat(64);
const sourceVersionId=`BSB_SRU_MARCXML:${candidate.sourceRecordIds[0]}:${'c'.repeat(64)}`;
const basis=computeBsbReviewBasis(snapshotId,manifest,sourceVersionId,candidate);
const decision={eventId,candidateId:candidate.candidateId,basisSha256:basis,kind:'ACCEPT',
  reviewerRef:'reviewer:server-bound',canonical:'Adab-i Fārsī',profile:'ijmes_full',
  rationale:'Independently checked against the cited source.',reviewedAt:'2026-10-10T10:00:00.000Z',
  humanAttestation:'I_PERSONALLY_VERIFIED_THIS_IJMES_FORM'};
const row={snapshot_id:snapshotId,manifest_checksum:manifest,source_version_id:sourceVersionId,
  manifest_valid:true,source_in_manifest:true,candidate_in_manifest:true,
  candidate_json:candidate,content_hash:candidate.contentHash,event_id:eventId,event_snapshot_id:snapshotId,
  candidate_id:candidate.candidateId,review_basis_sha256:basis,decision_kind:'ACCEPT',
  reviewer_ref:decision.reviewerRef,decision_json:decision,decided_at:decision.reviewedAt,
  latest_event_id:eventId,latest_decision_kind:'ACCEPT',provider:'BSB_SRU_MARCXML',
  source_record_id:candidate.sourceRecordIds[0],record_checksum:'d'.repeat(64)};
const request:AuthorityPublicationRequest={reviewEventId:eventId,expectedReviewBasisSha256:basis,
  expectedSourceSnapshotId:snapshotId,context:'BOOK_OR_ARTICLE_TITLE',publicationReason:'Controlled publication'};
const query=(value:unknown):TrustedSourceQuery=>({query:async()=>value});

describe('Phase 8R independent source verification',()=>{
  it('reconstructs authority input from independently queried immutable evidence and review rows',async()=>{
    const verified=await verifyReviewSourceWithQuery(query([row]),eventId,request,'e'.repeat(64));
    expect(verified).toMatchObject({candidateId:candidate.candidateId,latestForCandidate:true,
      candidateContentHash:candidate.contentHash,reviewBasisSha256:basis});
  });
  it('rejects a superseded ACCEPT and a stale active snapshot',async()=>{
    await expect(verifyReviewSourceWithQuery(query([{...row,latest_event_id:'22222222-2222-4222-8222-222222222222',latest_decision_kind:'REJECT'}]),eventId,request,'e'.repeat(64))).rejects.toThrow('REVIEW_NOT_CURRENT_ACCEPT');
    await expect(verifyReviewSourceWithQuery(query([{...row,snapshot_id:'snapshot-'+'f'.repeat(24)}]),eventId,request,'e'.repeat(64))).rejects.toThrow();
  });
  it('rejects candidate and review-basis integrity mismatches',async()=>{
    await expect(verifyReviewSourceWithQuery(query([{...row,review_basis_sha256:'0'.repeat(64)}]),eventId,request,'e'.repeat(64))).rejects.toThrow('REVIEW_BASIS_HASH_MISMATCH');
    await expect(verifyReviewSourceWithQuery(query([{...row,content_hash:'0'.repeat(64)}]),eventId,request,'e'.repeat(64))).rejects.toThrow('SOURCE_EVIDENCE_INTEGRITY_FAILURE');
  });
  it('does not allow ordinary caller JSON to impersonate trusted source verification',()=>{
    const untrusted={...row,eventId,candidateId:candidate.candidateId,activeSnapshotId:snapshotId,
      sourceVersionId,reviewBasisSha256:basis,decisionKind:'ACCEPT',canonical:decision.canonical,
      profile:'ijmes_full',reviewerRef:decision.reviewerRef,reviewedAt:decision.reviewedAt,
      rationale:decision.rationale,humanAttestation:decision.humanAttestation,
      persianSurface:candidate.originalPersianForm,candidateContentHash:candidate.contentHash,
      latestForCandidate:true,sourceRecordIds:candidate.sourceRecordIds,category:candidate.category};
    expect(()=>prepareAuthorityPublication(untrusted as never,request,snapshotId,[]))
      .toThrow('INDEPENDENT_SOURCE_VERIFICATION_REQUIRED');
  });
});
