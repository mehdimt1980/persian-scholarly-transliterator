import { describe, expect, it } from 'vitest';
import { transliterate } from '../engine';
import { renderScholarlyCanonical } from '../presentation';
import type { PublishedAuthoritySnapshot } from './types';
import { authorityManifestSha256 } from '../../server/authority/manifest';
import { assertAuthorityManifest } from '../../server/authority/manifest';
import { PUBLISHED_AUTHORITY_SNAPSHOT } from '../../data/publishedAuthority';
import { authorizePublication, prepareAuthorityPublication, rollbackAuthority, withdrawAuthority,
  type AcceptedReviewRecord, type PublicationAuthorization } from '../../server/authority/authorityPublication';
import { MemoryAuthorityRepository, publishAuthorizedAuthority, rollbackPublishedAuthority,
  withdrawPublishedAuthority } from '../../server/authority/authorityRepository';

const review: AcceptedReviewRecord = {
  eventId:'review-event-001',candidateId:'candidate-001',activeSnapshotId:'source-snapshot-001',
  sourceVersionId:'BSB:record:version',reviewBasisSha256:'a'.repeat(64),decisionKind:'ACCEPT',
  canonical:'farhang-i Īrān',profile:'ijmes_full',reviewerRef:'reviewer:declared',
  reviewedAt:'2026-10-10T10:00:00.000Z',rationale:'Verified against Persian source and IJMES rules.',
  humanAttestation:'I_PERSONALLY_VERIFIED_THIS_IJMES_FORM',persianSurface:'فرهنگ ایران',
  candidateContentHash:'b'.repeat(64),latestForCandidate:true,sourceRecordIds:['record-1'],category:'TITLE'
};
const emptyBase={schemaVersion:'phase8r-authority-snapshot-v1' as const,snapshotId:'empty-authority-v1',
  version:1,generatedAt:'2026-10-10T09:00:00.000Z',entries:[]};
const empty:PublishedAuthoritySnapshot={...emptyBase,manifestSha256:authorityManifestSha256(emptyBase)};
const auth:PublicationAuthorization={administratorRef:'publisher:separate-role',authorizedAt:'2026-10-10T11:00:00.000Z',
  scope:'PHASE8R_AUTHORITY_PUBLICATION',authorizationVersion:'1'};

function published() {
  const preview=prepareAuthorityPublication(review,{reviewEventId:review.eventId,
    expectedReviewBasisSha256:review.reviewBasisSha256,expectedSourceSnapshotId:review.activeSnapshotId,
    context:'GENERAL_SCHOLARLY_TEXT',publicationReason:'Approved controlled publication'},review.activeSnapshotId,[]);
  return authorizePublication(preview,auth,'2026-10-10T11:00:00.000Z',empty);
}

describe('Phase 8R authority boundary',()=>{
  it('ships a hash-valid empty snapshot and publishes no real authority entries',()=>{
    expect(()=>assertAuthorityManifest(PUBLISHED_AUTHORITY_SNAPSHOT)).not.toThrow();
    expect(PUBLISHED_AUTHORITY_SNAPSHOT.entries).toEqual([]);
  });
  it('keeps accepted-but-unpublished review unavailable at runtime',()=>{
    expect(transliterate(review.persianSurface,'ijmes_full',[],undefined,undefined,
      {publishedAuthoritySnapshot:empty}).authority).toBeUndefined();
  });
  it('resolves a separately published exact phrase deterministically',()=>{
    const {snapshot}=published();
    const result=transliterate(review.persianSurface,'ijmes_full',[],undefined,undefined,
      {publishedAuthoritySnapshot:snapshot,authorityContext:'GENERAL_SCHOLARLY_TEXT'});
    expect(result.output).toBe(review.canonical); expect(result.authority?.kind).toBe('PUBLISHED_SCHOLARLY_AUTHORITY');
  });
  it('does not allow a user decision to be silently overridden',()=>{
    const {snapshot}=published();
    const result=transliterate(review.persianSurface,'ijmes_full',[{issueId:'user-choice',action:'MANUAL_CANONICAL_OVERRIDE',manualCanonicalTransliteration:'other'}],undefined,undefined,
      {publishedAuthoritySnapshot:snapshot,authorityContext:'GENERAL_SCHOLARLY_TEXT'});
    expect(result.authority).toBeUndefined();
  });
  it('blocks stale review basis and conflicting active forms',()=>{
    expect(()=>prepareAuthorityPublication(review,{reviewEventId:review.eventId,expectedReviewBasisSha256:'c'.repeat(64),
      expectedSourceSnapshotId:review.activeSnapshotId,context:'GENERAL_SCHOLARLY_TEXT',publicationReason:'x'},review.activeSnapshotId,[])).toThrow('STALE_REVIEW_BASIS');
    const {entry}=published();
    expect(()=>prepareAuthorityPublication({...review,eventId:'review-event-002',canonical:'farhang-e Īrān'},
      {reviewEventId:'review-event-002',expectedReviewBasisSha256:review.reviewBasisSha256,
       expectedSourceSnapshotId:review.activeSnapshotId,context:'GENERAL_SCHOLARLY_TEXT',publicationReason:'x'},
      review.activeSnapshotId,[entry])).toThrow('CONFLICTING_PUBLISHED_AUTHORITY');
  });
  it('blocks AI/draft evidence and catalogue evidence without accepted human review',()=>{
    for(const kind of ['DRAFT','REJECT'] as const) expect(()=>prepareAuthorityPublication({...review,decisionKind:kind},
      {reviewEventId:review.eventId,expectedReviewBasisSha256:review.reviewBasisSha256,
       expectedSourceSnapshotId:review.activeSnapshotId,context:'GENERAL_SCHOLARLY_TEXT',publicationReason:'x'},review.activeSnapshotId,[])).toThrow('REVIEW_NOT_CURRENT_ACCEPT');
  });
  it('requires explicit running-text ordering attestation for personal names',()=>{
    expect(()=>prepareAuthorityPublication(review,{reviewEventId:review.eventId,
      expectedReviewBasisSha256:review.reviewBasisSha256,expectedSourceSnapshotId:review.activeSnapshotId,
      context:'PERSON_NAME',publicationReason:'x'},review.activeSnapshotId,[])).toThrow('PERSON_NAME_ORDERING_NOT_VERIFIED');
  });
  it('handles Persian Unicode normalization but only at exact phrase scope',()=>{
    const {snapshot}=published();
    expect(transliterate('فرهنگ ايران','ijmes_full',[],undefined,undefined,
      {publishedAuthoritySnapshot:snapshot,authorityContext:'GENERAL_SCHOLARLY_TEXT'}).authority).toBeDefined();
    expect(transliterate('این فرهنگ ایران است','ijmes_full',[],undefined,undefined,
      {publishedAuthoritySnapshot:snapshot,authorityContext:'GENERAL_SCHOLARLY_TEXT'}).authority).toBeUndefined();
  });
  it('renders the approved canonical through distinct presentation profiles',()=>{
    expect(renderScholarlyCanonical('Naṣīrī, Muḥammad Riḍā',{id:'full_scholarly_v1'}).output).toBe('Naṣīrī, Muḥammad Riḍā');
    expect(renderScholarlyCanonical('Naṣīrī, Muḥammad Riḍā',{id:'ijmes_publication_v1'},{contentCategory:'BOOK_OR_ARTICLE_TITLE'}).output).not.toBe('Naṣīrī, Muḥammad Riḍā');
  });
  it('is idempotent and withdrawal removes runtime authority without erasing history inputs',()=>{
    const first=published();
    const preview=prepareAuthorityPublication(review,{reviewEventId:review.eventId,
      expectedReviewBasisSha256:review.reviewBasisSha256,expectedSourceSnapshotId:review.activeSnapshotId,
      context:'GENERAL_SCHOLARLY_TEXT',publicationReason:'repeat'},review.activeSnapshotId,first.snapshot.entries);
    expect(authorizePublication(preview,auth,'2026-10-10T12:00:00.000Z',first.snapshot).snapshot).toEqual(first.snapshot);
    const withdrawal=withdrawAuthority(first.snapshot,first.entry.entryId,auth,'2026-10-10T13:00:00.000Z');
    const withdrawn=withdrawal.snapshot;
    expect(transliterate(review.persianSurface,'ijmes_full',[],undefined,undefined,
      {publishedAuthoritySnapshot:withdrawn}).authority).toBeUndefined();
    expect(first.snapshot.entries).toHaveLength(1);
    const rolledBack=rollbackAuthority(withdrawn,first.snapshot,auth,'2026-10-10T14:00:00.000Z','Restore previous reviewed snapshot');
    expect(rolledBack.event.kind).toBe('ROLLBACK');
    expect(rolledBack.snapshot.entries).toHaveLength(1);
  });
  it('serializes repository publication, preserves snapshots, and records rollback history',async()=>{
    const preview=prepareAuthorityPublication(review,{reviewEventId:review.eventId,
      expectedReviewBasisSha256:review.reviewBasisSha256,expectedSourceSnapshotId:review.activeSnapshotId,
      context:'GENERAL_SCHOLARLY_TEXT',publicationReason:'controlled publication'},review.activeSnapshotId,[]);
    const repository=new MemoryAuthorityRepository(empty);
    const active=await publishAuthorizedAuthority(repository,preview,auth,'2026-10-10T11:00:00.000Z');
    await publishAuthorizedAuthority(repository,preview,auth,'2026-10-10T11:01:00.000Z');
    const withdrawn=await withdrawPublishedAuthority(repository,active.entries[0].entryId,auth,'2026-10-10T12:00:00.000Z','scholarly withdrawal');
    await rollbackPublishedAuthority(repository,active.snapshotId,auth,'2026-10-10T13:00:00.000Z','audited restoration');
    const state=await repository.read();
    expect(state.snapshots.has(withdrawn.snapshotId)).toBe(true);
    expect(state.events.map(event=>event.kind)).toEqual(['PUBLISH','WITHDRAW','ROLLBACK']);
  });
});
