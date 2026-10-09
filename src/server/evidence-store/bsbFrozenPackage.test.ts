import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { buildSruUrl } from '../../validation/acquisition/bsb/client';
import { parseMarcCollection,parseMarcRecord } from '../../validation/acquisition/bsb/marcxml';
import { adaptBsbRecord } from '../../validation/acquisition/bsb/adapter';
import { freezeBsbNewOnly,FROZEN_INPUT_RUN,PREVIOUS_RECORD_IDS } from './bsbFrozenPackage';

const sha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
const fixture=parseMarcCollection(fs.readFileSync('validation/acquisition/bsb/authentic-selected-records.v1.xml','utf8'));
const oldId=(index:number)=>fixture[index].controlfields.find(field=>field.tag==='001')!.value;
function sourcePackage():Record<string,string>{
  const records=[...fixture];
  for(let i=0;i<48;i++){
    const base=fixture[i%2];
    const id='99'+String(i+1).padStart(16,'0');
    const raw=base.rawXml.replace('<controlfield tag="001">'+oldId(i%2)+'</controlfield>',
      '<controlfield tag="001">'+id+'</controlfield>');
    records.push(parseMarcRecord(raw));
  }
  const pages=[];
  for(let i=0;i<5;i++){
    const start=i*10+1,chunk=records.slice(i*10,(i+1)*10);
    const xml=`<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><version>1.2</version><numberOfRecords>440</numberOfRecords><records>${chunk.map((r,j)=>`<record><recordPosition>${start+j}</recordPosition><recordData>${r.rawXml}</recordData></record>`).join('')}</records><nextRecordPosition>${start+10}</nextRecordPosition></searchRetrieveResponse>`;
    pages.push({name:`page-${String(i+1).padStart(3,'0')}.xml`,xml,start});
  }
  const recordSummaries=records.map((r,i)=>({
    id:r.controlfields.find(field=>field.tag==='001')!.value,firstPage:Math.floor(i/10)*10+1,
    recordSha256:sha(r.rawXml),has880:r.datafields.some(field=>field.tag==='880'),
    candidateIds:adaptBsbRecord(r).map(c=>c.candidateId),
  }));
  const candidates=records.flatMap(adaptBsbRecord);
  expect(candidates).toHaveLength(75);
  const manifest={
    schemaVersion:'phase8i-paged-bsb-v1',provider:'BSB_SRU_MARCXML',
    query:{index:'all_for_ui',relation:'all',term:'فارسی'},
    limits:{maxPages:5,pageSize:10,maximumRequests:5,maximumRecords:50},
    pages:pages.map(page=>({startRecord:page.start,file:page.name,
      sourceUrl:buildSruUrl({index:'all_for_ui',relation:'all',term:'فارسی'},page.start,10).toString(),
      rawSha256:sha(page.xml),recordsReceived:10,totalReported:440,nextRecordPosition:page.start+10})),
    records:recordSummaries,
    reviewCandidates:candidates.map(c=>({id:c.candidateId,contentHash:c.contentHash,
      recordId:c.sourceRecordIds[0],category:c.category,persianForm:c.originalPersianForm,
      latinVariants:c.observedLatinVariants.map(v=>({value:v.value,classification:v.classification})),
      reviewStatus:'UNREVIEWED',authorityStatus:'NON_AUTHORITATIVE_CANDIDATE'})),
    metrics:{observed:50,unique:50,duplicateRecords:0,recordsWith880:50,eligibleRecords:50,candidateCount:75,romanizationProposals:75,candidateCategories:{WORK_TITLE:50,ORGANIZATION_NAME:25}},
    nextStartRecord:51,budgetExhausted:true,sourceComplete:false,
    persisted:false,authorityPromoted:false,warning:'unreviewed',
  };
  const baseline='a'.repeat(64);
  const diff={
    schemaVersion:'phase8j-bsb-staging-diff-v1',
    activeSnapshotId:'snapshot-7946161b2af2652b776a6bd4',baselineManifestChecksum:baseline,
    importDecision:'BLOCKED_PENDING_REVIEW',preservedSnapshot:true,persisted:false,
    recordCounts:{NEW_RECORD:48,ACTIVE_UNCHANGED:0,ACTIVE_CHANGED:2,KNOWN_HISTORICAL:0},
    candidateCounts:{NEW_CANDIDATE:72,ACTIVE_UNCHANGED:0,ACTIVE_CHANGED:3},
    recordDiff:recordSummaries.map((r,i)=>({recordId:r.id,incomingChecksum:r.recordSha256,
      state:i<2?'ACTIVE_CHANGED':'NEW_RECORD',activeChecksum:i<2?'b'.repeat(64):null})),
    candidateDiff:candidates.map(c=>({candidateId:c.candidateId,sourceRecordId:c.sourceRecordIds[0],
      category:c.category,persianForm:c.originalPersianForm,
      latinVariants:c.observedLatinVariants.map(v=>({value:v.value,classification:v.classification})),
      state:PREVIOUS_RECORD_IDS.includes(c.sourceRecordIds[0] as typeof PREVIOUS_RECORD_IDS[number])?'ACTIVE_CHANGED':'NEW_CANDIDATE',
      incomingContentHash:c.contentHash,activeContentHash:null,reviewStatus:'UNREVIEWED',authorityStatus:'NON_AUTHORITATIVE_CANDIDATE'})),
    blockers:['HUMAN_REVIEW_REQUIRED'],preservedSnapshot:true,persisted:false,
  };
  const reconcile={
    schemaVersion:'phase8k-bsb-fixture-reconciliation-v1',decision:'BLOCKED_PENDING_FIELD_REVIEW',
    oldActiveSnapshotPreserved:true,persisted:false,ijmesAuthorityPromoted:false,
    baselineRecordCount:2,matchedLiveRecordCount:2,missingLiveRecordIds:[],
    totals:{semanticDifferences:0,additiveLatinVariantCandidates:1},
  };
  const files:Record<string,string>={
    'source-manifest.json':JSON.stringify(manifest,null,2)+'\n',
    'comparison.json':JSON.stringify(diff,null,2)+'\n',
    'fixture-reconciliation.json':JSON.stringify(reconcile,null,2)+'\n',
    'human-review-worklist.csv':'sourceRecordId,candidateId\r\n',
  };
  for(const page of pages)files[page.name]=page.xml;
  files['package-checksums.json']=JSON.stringify({
    schemaVersion:'phase8j-bsb-review-package-v1',activeSnapshotId:diff.activeSnapshotId,
    baselineManifestChecksum:baseline,sourceManifestSha256:sha(files['source-manifest.json']),
    comparisonSha256:sha(files['comparison.json']),
    fixtureReconciliationSha256:sha(files['fixture-reconciliation.json']),
    reviewWorklistSha256:sha(files['human-review-worklist.csv']),
    rawPages:pages.map(p=>({file:p.name,checksum:sha(p.xml)})),
    reviewRequired:true,importAuthorized:false,writesPerformed:false,
  },null,2)+'\n';
  return files;
}
describe('Phase 8L frozen BSB import proposal',()=>{
  it('freezes exactly 48 never-seen MARC IDs and 72 non-authoritative candidates without changing the old two',()=>{
    const {files,seal}=freezeBsbNewOnly(sourcePackage());
    expect(seal.frozenRecordCount).toBe(48);
    expect(seal.frozenCandidateCount).toBe(72);
    expect(seal.incomingRecords).toHaveLength(48);
    expect(seal.candidateReviewQueue).toHaveLength(72);
    expect(seal.incomingRecords.some(r=>PREVIOUS_RECORD_IDS.includes(r.recordId as typeof PREVIOUS_RECORD_IDS[number]))).toBe(false);
    expect(seal.candidateReviewQueue.every(c=>c.authorityStatus==='NON_AUTHORITATIVE_CANDIDATE'&&c.reviewStatus==='UNREVIEWED')).toBe(true);
    expect(seal.importAuthorized).toBe(false);
    expect(seal.published).toBe(false);
    expect(Object.keys(seal.filesSha256)).toContain('source/page-005.xml');
    expect(sha(files['frozen-new-records.marcxml'])).toBe(seal.filesSha256['frozen-new-records.marcxml']);
    expect(parseMarcCollection(files['frozen-new-records.marcxml'])).toHaveLength(48);
  });
  it('rejects even a one-character change to a pinned source SRU XML page',()=>{
    const files=sourcePackage();
    files['page-002.xml']=files['page-002.xml'].replace('440','441');
    expect(()=>freezeBsbNewOnly(files)).toThrow(/source page checksum mismatch/);
  });
  it('rejects tampered comparison audit, even if JSON still parses',()=>{
    const files=sourcePackage();
    files['comparison.json']=files['comparison.json'].replace('"NEW_RECORD": 48','"NEW_RECORD": 49');
    expect(()=>freezeBsbNewOnly(files)).toThrow(/source audit file SHA-256 mismatch/);
  });
  it('rejects replay from a different GitHub run or an unapproved imported source package',()=>{
    const files=sourcePackage();
    expect(()=>freezeBsbNewOnly(files,FROZEN_INPUT_RUN+1)).toThrow(/source run must be pinned/);
    const checksums=JSON.parse(files['package-checksums.json']) as Record<string,unknown>;
    checksums.importAuthorized=true;
    files['package-checksums.json']=JSON.stringify(checksums,null,2)+'\n';
    expect(()=>freezeBsbNewOnly(files)).toThrow(/source audit\/baseline seal invalid/);
  });
  it('rejects an old source masquerading as a new record even with resealed comparison',()=>{
    const files=sourcePackage();
    const diff=JSON.parse(files['comparison.json']) as {recordDiff:Array<{state:string}>;recordCounts:Record<string,number>};
    diff.recordDiff[0].state='NEW_RECORD';
    diff.recordDiff[2].state='ACTIVE_CHANGED';
    files['comparison.json']=JSON.stringify(diff,null,2)+'\n';
    const checksum=JSON.parse(files['package-checksums.json']) as Record<string,unknown>;
    checksum.comparisonSha256=sha(files['comparison.json']);
    files['package-checksums.json']=JSON.stringify(checksum,null,2)+'\n';
    expect(()=>freezeBsbNewOnly(files)).toThrow(/old-record update would be imported/);
  });
});
