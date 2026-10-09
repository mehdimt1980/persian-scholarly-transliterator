/** Pure Phase 8J pre-import comparison. Never modifies persistence or authority. */
import type { PagedEvidenceManifest } from '../../validation/bsbPagedAcquisitionCli';

export interface ActiveRecordVersion {
  sourceRecordId: string;
  recordChecksum: string;
  versionId: string;
}
export interface ActiveCandidateProjection {
  candidateId: string;
  contentHash: string;
  sourceVersionId: string;
}
export type RecordDisposition = 'NEW_RECORD' | 'ACTIVE_UNCHANGED' | 'ACTIVE_CHANGED' | 'KNOWN_HISTORICAL';
export type CandidateDisposition = 'NEW_CANDIDATE' | 'ACTIVE_UNCHANGED' | 'ACTIVE_CHANGED';

export interface StagingComparison {
  schemaVersion: 'phase8j-bsb-staging-diff-v1';
  activeSnapshotId: string;
  baselineManifestChecksum: string;
  importDecision: 'BLOCKED_PENDING_REVIEW';
  recordCounts: Record<RecordDisposition,number>;
  candidateCounts: Record<CandidateDisposition,number>;
  recordDiff: Array<{recordId:string;incomingChecksum:string;state:RecordDisposition;activeChecksum:string|null}>;
  candidateDiff: Array<{candidateId:string;sourceRecordId:string;category:string;persianForm:string;latinVariants: Array<{value:string;classification:string}>;state:CandidateDisposition;incomingContentHash:string;activeContentHash:string|null;reviewStatus:'UNREVIEWED';authorityStatus:'NON_AUTHORITATIVE_CANDIDATE'}>;
  blockers: string[];
  preservedSnapshot: true;
  persisted: false;
}

export function compareBsbWithActiveStaging(input:{
  manifest: PagedEvidenceManifest;
  activeSnapshotId: string;
  baselineManifestChecksum: string;
  activeRecords: ActiveRecordVersion[];
  historicalRecords: ActiveRecordVersion[];
  activeCandidates: ActiveCandidateProjection[];
}):StagingComparison {
  const {manifest,activeSnapshotId,baselineManifestChecksum,activeRecords,historicalRecords,activeCandidates}=input;
  if(!/^snapshot-[0-9a-f]{24}$/u.test(activeSnapshotId) || !/^[a-f0-9]{64}$/u.test(baselineManifestChecksum))
    throw new Error('Untrusted active snapshot identity or manifest checksum');
  if(manifest.schemaVersion!=='phase8i-paged-bsb-v1' || manifest.provider!=='BSB_SRU_MARCXML'
     || manifest.persisted!==false || manifest.authorityPromoted!==false)
    throw new Error('Untrusted source evidence manifest');
  if(manifest.pages.length>5 || manifest.metrics.observed>50 || manifest.metrics.unique!==manifest.records.length
    || manifest.metrics.candidateCount!==manifest.reviewCandidates.length)
    throw new Error('Incoming BSB manifest exceeds reviewed limits or has inconsistent counts');

  const byId=<T extends object>(items:T[], key:(item:T)=>string, context:string):Map<string,T>=>{
    const output=new Map<string,T>();
    for(const item of items){
      const id=key(item);
      if(!id || output.has(id))throw new Error(`Duplicate or empty ${context} identity`);
      output.set(id,item);
    }
    return output;
  };
  const activeById=byId(activeRecords,(row)=>row.sourceRecordId,'active record');
  const historicalById=new Map<string,Set<string>>();
  for(const row of historicalRecords){
    if(!row.sourceRecordId || !/^[a-f0-9]{64}$/u.test(row.recordChecksum))throw new Error('Malformed historical version');
    if(!historicalById.has(row.sourceRecordId))historicalById.set(row.sourceRecordId,new Set());
    historicalById.get(row.sourceRecordId)!.add(row.recordChecksum);
  }
  const candidatesById=byId(activeCandidates,(row)=>row.candidateId,'active candidate');
  for(const row of activeRecords){
    if(!/^[a-f0-9]{64}$/u.test(row.recordChecksum))throw new Error('Malformed active checksum');
  }
  for(const row of activeCandidates){
    if(!/^[a-f0-9]{64}$/u.test(row.contentHash))throw new Error('Malformed active candidate checksum');
  }
  const inputRecords=byId(manifest.records,(record)=>record.id,'incoming record');
  const inputCandidates=byId(manifest.reviewCandidates,(candidate)=>candidate.id,'incoming candidate');

  const recordCounts:Record<RecordDisposition,number>={
    NEW_RECORD:0,ACTIVE_UNCHANGED:0,ACTIVE_CHANGED:0,KNOWN_HISTORICAL:0,
  };
  const candidateCounts:Record<CandidateDisposition,number>={
    NEW_CANDIDATE:0,ACTIVE_UNCHANGED:0,ACTIVE_CHANGED:0,
  };
  const recordDiff=manifest.records.map(record=>{
    if(!/^[a-f0-9]{64}$/u.test(record.recordSha256))throw new Error('Malformed incoming record checksum');
    const active=activeById.get(record.id);
    const state:RecordDisposition=active
      ? (active.recordChecksum===record.recordSha256?'ACTIVE_UNCHANGED':'ACTIVE_CHANGED')
      : historicalById.has(record.id)?'KNOWN_HISTORICAL':'NEW_RECORD';
    recordCounts[state]++;
    return {recordId:record.id,incomingChecksum:record.recordSha256,state,activeChecksum:active?.recordChecksum??null};
  });
  const candidateDiff=manifest.reviewCandidates.map(candidate=>{
    if(candidate.reviewStatus!=='UNREVIEWED'||candidate.authorityStatus!=='NON_AUTHORITATIVE_CANDIDATE')
      throw new Error('Candidate authority elevation rejected');
    if(!/^[a-f0-9]{64}$/u.test(candidate.contentHash) || !inputRecords.has(candidate.recordId))
      throw new Error('Candidate checksum or source identity invalid');
    if(!inputRecords.get(candidate.recordId)!.candidateIds.includes(candidate.id))
      throw new Error('Candidate is not referenced by its source record');
    const active=candidatesById.get(candidate.id);
    const state:CandidateDisposition=active
      ? active.contentHash===candidate.contentHash?'ACTIVE_UNCHANGED':'ACTIVE_CHANGED'
      :'NEW_CANDIDATE';
    candidateCounts[state]++;
    return {candidateId:candidate.id,sourceRecordId:candidate.recordId,category:candidate.category,
      persianForm:candidate.persianForm,latinVariants:candidate.latinVariants,state,
      incomingContentHash:candidate.contentHash,activeContentHash:active?.contentHash??null,
      reviewStatus:candidate.reviewStatus,authorityStatus:candidate.authorityStatus};
  });
  const blockers:string[]=['HUMAN_REVIEW_REQUIRED','IMPORT_OPERATOR_APPROVAL_REQUIRED','SOURCE_REUSE_POLICY_REVIEW_REQUIRED'];
  if(recordCounts.ACTIVE_CHANGED)blockers.push('ACTIVE_SOURCE_VERSION_DRIFT_REQUIRES_REVIEW');
  if(recordCounts.KNOWN_HISTORICAL)blockers.push('HISTORICAL_RECORD_REINTRODUCTION_REQUIRES_REVIEW');
  if(candidateCounts.ACTIVE_CHANGED)blockers.push('CANDIDATE_IDENTITY_CONTENT_CONFLICT');
  if(manifest.budgetExhausted)blockers.push('SOURCE_COLLECTION_INCOMPLETE_BUDGET_EXHAUSTED');
  return {schemaVersion:'phase8j-bsb-staging-diff-v1',activeSnapshotId,baselineManifestChecksum,
    importDecision:'BLOCKED_PENDING_REVIEW',recordCounts,candidateCounts,recordDiff,candidateDiff,blockers,
    preservedSnapshot:true,persisted:false};
}
