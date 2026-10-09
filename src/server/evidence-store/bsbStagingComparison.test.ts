import { describe,expect,it } from 'vitest';
import type { PagedEvidenceManifest } from '../../validation/bsbPagedAcquisitionCli';
import { compareBsbWithActiveStaging, type ActiveRecordVersion, type ActiveCandidateProjection } from './bsbStagingComparison';

const digest=(character:string)=>character.repeat(64);
const snapshotId='snapshot-7946161b2af2652b776a6bd4';
const activeRecords:ActiveRecordVersion[]=[
  {sourceRecordId:'a',recordChecksum:digest('a'),versionId:'v1'},
  {sourceRecordId:'b',recordChecksum:digest('b'),versionId:'v2'},
];
const activeCandidates:ActiveCandidateProjection[]=[
  {candidateId:'candidate-a',contentHash:digest('a'),sourceVersionId:'v1'},
  {candidateId:'candidate-b',contentHash:digest('b'),sourceVersionId:'v2'},
];
const review=(id:string,recordId:string,checksum:string)=>({
  id,contentHash:checksum,recordId,category:'WORK_TITLE',persianForm:'ادب فارسی',
  latinVariants:[{value:'Adab-i Fārsī',classification:'ROMANIZATION_CANDIDATE'}],
  reviewStatus:'UNREVIEWED' as const,authorityStatus:'NON_AUTHORITATIVE_CANDIDATE' as const,
});
const manifest=():PagedEvidenceManifest=>({
  schemaVersion:'phase8i-paged-bsb-v1',provider:'BSB_SRU_MARCXML',
  query:{index:'all_for_ui',relation:'all',term:'فارسی'},
  limits:{maxPages:5,pageSize:10,maximumRequests:5,maximumRecords:50},
  pages:[{startRecord:1,file:'page-001.xml',sourceUrl:'https://bsb.alma.exlibrisgroup.com/view/sru/49BVB_BSB',
    rawSha256:digest('f'),recordsReceived:3,totalReported:440,nextRecordPosition:4}],
  records:[
    {id:'a',firstPage:1,recordSha256:digest('a'),has880:true,candidateIds:['candidate-a']},
    {id:'b',firstPage:1,recordSha256:digest('c'),has880:true,candidateIds:['candidate-b']},
    {id:'c',firstPage:1,recordSha256:digest('d'),has880:true,candidateIds:['candidate-c']},
  ],
  reviewCandidates:[
    review('candidate-a','a',digest('a')),
    review('candidate-b','b',digest('c')),
    review('candidate-c','c',digest('d')),
  ],
  metrics:{observed:3,unique:3,duplicateRecords:0,recordsWith880:3,
    eligibleRecords:3,candidateCount:3,romanizationProposals:3,candidateCategories:{WORK_TITLE:3}},
  nextStartRecord:4,budgetExhausted:true,sourceComplete:false,
  persisted:false,authorityPromoted:false,warning:'unreviewed',
});
const compare=(m=manifest())=>compareBsbWithActiveStaging({
  manifest:m,activeSnapshotId:snapshotId,baselineManifestChecksum:digest('e'),
  activeRecords,historicalRecords:activeRecords,activeCandidates,
});

describe('Phase 8J strict read-only Staging comparison',()=>{
  it('distinguishes new, exact-active and revised record versions and candidate hashes',()=>{
    const result=compare();
    expect(result.recordCounts).toEqual({
      NEW_RECORD:1,ACTIVE_UNCHANGED:1,ACTIVE_CHANGED:1,KNOWN_HISTORICAL:0,
    });
    expect(result.candidateCounts).toEqual({
      NEW_CANDIDATE:1,ACTIVE_UNCHANGED:1,ACTIVE_CHANGED:1,
    });
    expect(result.importDecision).toBe('BLOCKED_PENDING_REVIEW');
    expect(result.blockers).toContain('ACTIVE_SOURCE_VERSION_DRIFT_REQUIRES_REVIEW');
    expect(result.blockers).toContain('CANDIDATE_IDENTITY_CONTENT_CONFLICT');
    expect(result.persisted).toBe(false);
    expect(result.preservedSnapshot).toBe(true);
  });
  it('flags historical source identities not present in active snapshot',()=>{
    const m=manifest();
    m.records[2].id='historic';
    m.reviewCandidates[2].recordId='historic';
    const result=compareBsbWithActiveStaging({manifest:m,activeSnapshotId:snapshotId,
      baselineManifestChecksum:digest('e'),activeRecords,historicalRecords:[
        ...activeRecords,{sourceRecordId:'historic',recordChecksum:digest('d'),versionId:'oldv'},
      ],activeCandidates});
    expect(result.recordCounts.KNOWN_HISTORICAL).toBe(1);
    expect(result.blockers).toContain('HISTORICAL_RECORD_REINTRODUCTION_REQUIRES_REVIEW');
  });
  it('rejects any authority elevation, invented source identity, duplicate and ID collision',()=>{
    const m=manifest();
    m.reviewCandidates[0].reviewStatus='REVIEWED' as never;
    expect(()=>compare(m)).toThrow(/authority elevation/);
    const orphan=manifest();
    orphan.reviewCandidates[0].recordId='unobserved';
    expect(()=>compare(orphan)).toThrow(/source identity invalid/);
    const duplicate=manifest();
    duplicate.records[2].id='a';
    expect(()=>compare(duplicate)).toThrow(/Duplicate or empty incoming record/);
  });
  it('rejects failed/unsafe manifests and incorrect active snapshot identity',()=>{
    const m=manifest();
    m.persisted=true as never;
    expect(()=>compare(m)).toThrow(/Untrusted source evidence/);
    const v=manifest();
    v.metrics.candidateCount=20;
    expect(()=>compare(v)).toThrow(/inconsistent counts/);
    expect(()=>compareBsbWithActiveStaging({manifest:manifest(),
      activeSnapshotId:'untrusted',baselineManifestChecksum:digest('e'),
      activeRecords,historicalRecords:[],activeCandidates})).toThrow(/Untrusted active snapshot/);
  });
});
