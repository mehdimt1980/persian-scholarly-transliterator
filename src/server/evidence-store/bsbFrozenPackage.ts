/** Phase 8L. Freeze a previously audited BSB source package; NEVER import or approve it.
 * Inputs are pinned Phase 8K GitHub Actions artifacts, not a fresh SRU query.
 */
import { createHash } from 'node:crypto';
import { adaptBsbRecord } from '../../validation/acquisition/bsb/adapter';
import { buildSruUrl } from '../../validation/acquisition/bsb/client';
import { parseMarcCollection, parseSruMarcXml } from '../../validation/acquisition/bsb/marcxml';
import type { MarcRecord } from '../../validation/acquisition/bsb/types';
import type { PagedEvidenceManifest } from '../../validation/bsbPagedAcquisitionCli';
import type { StagingComparison } from './bsbStagingComparison';
import type { FixtureReconciliation } from './bsbFixtureReconciliation';

export const FROZEN_INPUT_RUN = 37980848653;
export const FROZEN_INPUT_ARTIFACT = 'phase8k-bsb-fixture-reconciliation';
export const FROZEN_BASELINE = 'snapshot-7946161b2af2652b776a6bd4';
export const PREVIOUS_RECORD_IDS = ['991071006889707356','991144600686807356'] as const;
const sha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
const hashPattern=/^[a-f0-9]{64}$/u;
function assert(condition:unknown,message:string):asserts condition {
  if(!condition)throw new Error('Frozen BSB rejected: '+message);
}
const recordId=(record:MarcRecord):string=>{
  const id=record.controlfields.find(f=>f.tag==='001')?.value;
  assert(id,'MARC 001 missing');
  return id;
};
export interface FrozenBundle {
  files:Record<string,string>;
  seal:{
    schemaVersion:'phase8l-frozen-bsb-new-only-v1';
    sourceActionRun:number;
    sourceArtifact:string;
    baselineSnapshot:string;
    baselineManifestChecksum:string;
    frozenRecordCount:number;
    frozenCandidateCount:number;
    excludedPriorSourceIds:readonly string[];
    incomingRecords:Array<{recordId:string;canonicalChecksum:string;candidateIds:string[]}>;
    candidateReviewQueue:Array<{
      candidateId:string;sourceRecordId:string;contentHash:string;persianForm:string;
      category:string;latinVariants:Array<{value:string;classification:string}>;
      reviewStatus:'UNREVIEWED';authorityStatus:'NON_AUTHORITATIVE_CANDIDATE';
    }>;
    filesSha256:Record<string,string>;
    importAuthorized:false;
    published:false;
    status:'REVIEW_REQUIRED_NO_WRITES';
  };
}
const parseJson=<T>(text:string,name:string):T=>{
  try{return JSON.parse(text) as T;}catch{throw new Error('Frozen BSB rejected: invalid JSON in '+name);}
};
const requireFile=(files:Record<string,string>,name:string):string=>{
  assert(Object.prototype.hasOwnProperty.call(files,name) && typeof files[name]==='string','missing '+name);
  return files[name];
};
const uniqueMap=<T>(input:T[],fn:(t:T)=>string,label:string)=>{
  const map=new Map<string,T>();
  for(const item of input){
    const key=fn(item);
    assert(key&&!map.has(key),'duplicate or empty '+label);
    map.set(key,item);
  }
  return map;
};

export function freezeBsbNewOnly(sourceFiles:Record<string,string>,sourceRunId=FROZEN_INPUT_RUN):FrozenBundle {
  assert(sourceRunId===FROZEN_INPUT_RUN,'source run must be pinned to audited Phase 8K');
  const manifestText=requireFile(sourceFiles,'source-manifest.json');
  const comparisonText=requireFile(sourceFiles,'comparison.json');
  const reconciliationText=requireFile(sourceFiles,'fixture-reconciliation.json');
  const checksumsText=requireFile(sourceFiles,'package-checksums.json');
  const worklistText=requireFile(sourceFiles,'human-review-worklist.csv');
  const manifest=parseJson<PagedEvidenceManifest>(manifestText,'source-manifest.json');
  const comparison=parseJson<StagingComparison>(comparisonText,'comparison.json');
  const reconciliation=parseJson<FixtureReconciliation>(reconciliationText,'fixture-reconciliation.json');
  const checksums=parseJson<{
    schemaVersion:string; activeSnapshotId:string;baselineManifestChecksum:string;
    sourceManifestSha256:string;comparisonSha256:string;fixtureReconciliationSha256:string;
    reviewWorklistSha256:string;rawPages:Array<{file:string;checksum:string}>;
    reviewRequired:boolean;importAuthorized:boolean;writesPerformed:boolean;
  }>(checksumsText,'package-checksums.json');
  assert(checksums.schemaVersion==='phase8j-bsb-review-package-v1'
    && checksums.activeSnapshotId===FROZEN_BASELINE
    && hashPattern.test(checksums.baselineManifestChecksum)
    && checksums.reviewRequired===true
    && checksums.importAuthorized===false && checksums.writesPerformed===false,
    'source audit/baseline seal invalid');
  assert(sha(manifestText)===checksums.sourceManifestSha256
    && sha(comparisonText)===checksums.comparisonSha256
    && sha(reconciliationText)===checksums.fixtureReconciliationSha256
    && sha(worklistText)===checksums.reviewWorklistSha256,
    'source audit file SHA-256 mismatch');
  assert(manifest.schemaVersion==='phase8i-paged-bsb-v1'
    && manifest.provider==='BSB_SRU_MARCXML'
    && manifest.persisted===false && manifest.authorityPromoted===false
    && manifest.query.index==='all_for_ui' && manifest.query.relation==='all'
    && manifest.query.term==='فارسی'
    && manifest.pages.length===5 && manifest.metrics.observed===50
    && manifest.metrics.unique===50 && manifest.metrics.duplicateRecords===0
    && manifest.metrics.candidateCount===75
    && manifest.records.length===50 && manifest.reviewCandidates.length===75
    && manifest.limits.maximumRecords===50 && manifest.limits.maximumRequests===5,
    'source manifest is not the approved bounded 50-record sample');
  assert(comparison.schemaVersion==='phase8j-bsb-staging-diff-v1'
    && comparison.importDecision==='BLOCKED_PENDING_REVIEW'
    && comparison.preservedSnapshot===true && comparison.persisted===false
    && comparison.activeSnapshotId===FROZEN_BASELINE
    && comparison.baselineManifestChecksum===checksums.baselineManifestChecksum,
    'staging comparison baseline or write policy mismatch');
  assert(comparison.recordCounts.NEW_RECORD===48
    && comparison.recordCounts.ACTIVE_CHANGED===2
    && comparison.recordCounts.ACTIVE_UNCHANGED===0
    && comparison.recordCounts.KNOWN_HISTORICAL===0
    && comparison.candidateCounts.NEW_CANDIDATE===72
    && comparison.candidateCounts.ACTIVE_CHANGED===3
    && comparison.candidateCounts.ACTIVE_UNCHANGED===0
    && comparison.recordDiff.length===50 && comparison.candidateDiff.length===75,
    'incoming record/candidate counts differ from audited Phase 8K comparison');
  assert(reconciliation.schemaVersion==='phase8k-bsb-fixture-reconciliation-v1'
    && reconciliation.decision==='BLOCKED_PENDING_FIELD_REVIEW'
    && reconciliation.oldActiveSnapshotPreserved===true
    && reconciliation.persisted===false && reconciliation.ijmesAuthorityPromoted===false
    && reconciliation.baselineRecordCount===2 && reconciliation.matchedLiveRecordCount===2
    && reconciliation.missingLiveRecordIds.length===0
    && reconciliation.totals.semanticDifferences===0
    && reconciliation.totals.additiveLatinVariantCandidates===1,
    'unresolved or untrusted prior-fixture reconciliation');

  const parsedRecords:MarcRecord[]=[];
  assert(checksums.rawPages.length===5,'source audit raw page count mismatch');
  for(let i=0;i<5;i++){
    const name=`page-${String(i+1).padStart(3,'0')}.xml`;
    const meta=manifest.pages[i];
    assert(meta?.file===name&&checksums.rawPages[i]?.file===name,'source page ordering mismatch');
    const xml=requireFile(sourceFiles,name);
    assert(hashPattern.test(meta.rawSha256)
      && sha(xml)===meta.rawSha256 && checksums.rawPages[i].checksum===meta.rawSha256,
      'source page checksum mismatch: '+name);
    const expectedStart=1+i*10;
    assert(meta.startRecord===expectedStart && meta.recordsReceived===10 && meta.totalReported===440
      && meta.sourceUrl===buildSruUrl({index:'all_for_ui',relation:'all',term:'فارسی'},expectedStart,10).toString(),
      'source page index/CQL does not match pinned retrieval');
    const parsed=parseSruMarcXml(xml);
    assert(parsed.diagnostics.length===0 && parsed.numberOfRecords===440 && parsed.records.length===10
      && parsed.recordPositions[0]===expectedStart && parsed.records.length===meta.recordsReceived
      && parsed.nextRecordPosition===meta.nextRecordPosition,
      'raw source does not match signed SRU page metadata');
    parsedRecords.push(...parsed.records);
  }
  const incomingById=uniqueMap(parsedRecords,recordId,'raw MARC 001');
  const sourceById=uniqueMap(manifest.records,r=>r.id,'manifest MARC 001');
  const comparisonById=uniqueMap(comparison.recordDiff,r=>r.recordId,'comparison MARC 001');
  assert(incomingById.size===50 && sourceById.size===50 && comparisonById.size===50,'record cardinality mismatch');

  const extractedByCandidateId=new Map<string,ReturnType<typeof adaptBsbRecord>[number]>();
  for(const record of parsedRecords){
    const id=recordId(record);
    const declared=sourceById.get(id), diff=comparisonById.get(id);
    assert(declared && diff && declared.recordSha256===sha(record.rawXml)
      && diff.incomingChecksum===declared.recordSha256,
      'canonical record checksum mismatch '+id);
    const candidates=adaptBsbRecord(record);
    assert(JSON.stringify(candidates.map(c=>c.candidateId).sort())===JSON.stringify([...declared.candidateIds].sort()),
      'record-to-candidate mapping changed for '+id);
    for(const candidate of candidates){
      assert(!extractedByCandidateId.has(candidate.candidateId),'duplicate candidate across source records');
      assert(candidate.reviewStatus==='UNREVIEWED'&&candidate.authorityStatus==='NON_AUTHORITATIVE_CANDIDATE'
        && candidate.evidenceStatus==='CANDIDATE','candidate authority elevation');
      extractedByCandidateId.set(candidate.candidateId,candidate);
    }
  }
  assert(extractedByCandidateId.size===75,'re-extracted source candidate count mismatch');
  const manifestCandidateById=uniqueMap(manifest.reviewCandidates,c=>c.id,'manifest candidate');
  const comparisonCandidateById=uniqueMap(comparison.candidateDiff,c=>c.candidateId,'comparison candidate');
  assert(manifestCandidateById.size===75 && comparisonCandidateById.size===75,'candidate cardinality mismatch');
  for(const [id,candidate] of extractedByCandidateId){
    const fromSource=manifestCandidateById.get(id),fromStaging=comparisonCandidateById.get(id);
    assert(fromSource && fromStaging && fromSource.contentHash===candidate.contentHash
      && fromStaging.incomingContentHash===candidate.contentHash
      && fromSource.recordId===candidate.sourceRecordIds[0]
      && fromStaging.sourceRecordId===candidate.sourceRecordIds[0]
      && fromSource.persianForm===candidate.originalPersianForm
      && fromSource.category===candidate.category
      && fromSource.reviewStatus==='UNREVIEWED'
      && fromSource.authorityStatus==='NON_AUTHORITATIVE_CANDIDATE'
      && fromStaging.reviewStatus==='UNREVIEWED'
      && fromStaging.authorityStatus==='NON_AUTHORITATIVE_CANDIDATE'
      && JSON.stringify(fromSource.latinVariants)===JSON.stringify(candidate.observedLatinVariants.map(v=>({value:v.value,classification:v.classification}))),
      'candidate hashes/identity or review state diverged: '+id);
  }
  const oldIds=new Set<string>(PREVIOUS_RECORD_IDS);
  assert(PREVIOUS_RECORD_IDS.every(id=>comparisonById.get(id)?.state==='ACTIVE_CHANGED')
    && comparison.recordDiff.filter(r=>r.state==='ACTIVE_CHANGED').every(r=>oldIds.has(r.recordId)),
    'unreviewed old-record update would be imported');
  for(const r of comparison.candidateDiff){
    const isOld=oldIds.has(r.sourceRecordId);
    assert(isOld ? r.state==='ACTIVE_CHANGED' : r.state==='NEW_CANDIDATE',
      'new import includes old or revised candidate');
  }
  const incomingRecords=parsedRecords.filter(r=>!oldIds.has(recordId(r)));
  const recordQueue=incomingRecords.map(record=>({
    recordId:recordId(record),canonicalChecksum:sha(record.rawXml),
    candidateIds:adaptBsbRecord(record).map(c=>c.candidateId),
  }));
  assert(incomingRecords.length===48
    && incomingRecords.every(r=>comparisonById.get(recordId(r))?.state==='NEW_RECORD'),
    'new record proposal contains existing identity');
  const candidateReviewQueue=incomingRecords.flatMap(record=>adaptBsbRecord(record).map(c=>({
    candidateId:c.candidateId,sourceRecordId:recordId(record),contentHash:c.contentHash,
    persianForm:c.originalPersianForm,category:c.category,
    latinVariants:c.observedLatinVariants.map(v=>({value:v.value,classification:v.classification})),
    reviewStatus:'UNREVIEWED' as const,authorityStatus:'NON_AUTHORITATIVE_CANDIDATE' as const,
  })));
  assert(candidateReviewQueue.length===72 && candidateReviewQueue.every(c=>
    comparisonCandidateById.get(c.candidateId)?.state==='NEW_CANDIDATE'),
    'new proposal includes legacy candidate or has unexpected candidate count');
  const collectionXml='<?xml version="1.0" encoding="UTF-8"?>\n'
    +'<collection xmlns="http://www.loc.gov/MARC21/slim">'
    +incomingRecords.map(r=>r.rawXml).join('')+'</collection>\n';
  const parsedCollection=parseMarcCollection(collectionXml);
  assert(parsedCollection.length===48
    && parsedCollection.every((r,i)=>recordId(r)===recordId(incomingRecords[i])&&sha(r.rawXml)===sha(incomingRecords[i].rawXml)),
    'frozen MARC collection did not roundtrip');

  const outFiles:Record<string,string>={};
  // Preserve original immutable source evidence in the new frozen artifact.
  for(const [name,value] of Object.entries(sourceFiles)){
    assert(['source-manifest.json','comparison.json','fixture-reconciliation.json','human-review-worklist.csv',
      'package-checksums.json',...manifest.pages.map(page=>page.file)].includes(name),'unexpected source archive file');
    outFiles['source/'+name]=value;
  }
  outFiles['frozen-new-records.marcxml']=collectionXml;
  const filesSha256=Object.fromEntries(Object.entries(outFiles).sort(([a],[b])=>a.localeCompare(b)).map(([name,text])=>[name,sha(text)]));
  const seal:FrozenBundle['seal']={
    schemaVersion:'phase8l-frozen-bsb-new-only-v1',sourceActionRun:sourceRunId,
    sourceArtifact:FROZEN_INPUT_ARTIFACT,baselineSnapshot:FROZEN_BASELINE,
    baselineManifestChecksum:checksums.baselineManifestChecksum,
    frozenRecordCount:48,frozenCandidateCount:72,
    excludedPriorSourceIds:PREVIOUS_RECORD_IDS,
    incomingRecords:recordQueue,candidateReviewQueue,
    filesSha256,importAuthorized:false,published:false,status:'REVIEW_REQUIRED_NO_WRITES',
  };
  outFiles['frozen-seal.json']=JSON.stringify(seal,null,2)+'\n';
  return {files:outFiles,seal};
}

/** Replay sealed source proofs and require byte-identical regenerated frozen files. */
export function verifyFrozenReviewPackage(files:Record<string,string>):FrozenBundle['seal'] {
  const source:Record<string,string>={};
  for(const [name,content] of Object.entries(files)){
    if(name.startsWith('source/'))source[name.slice('source/'.length)]=content;
  }
  const expected=freezeBsbNewOnly(source);
  const wanted=Object.keys(expected.files).sort();
  assert(JSON.stringify(Object.keys(files).sort())===JSON.stringify(wanted),
    'frozen package file list changed');
  for(const [name,content] of Object.entries(expected.files)){
    assert(typeof files[name]==='string' && files[name]===content,
      'frozen file/provenance differs from reconstructed seal: '+name);
  }
  const seal=parseJson<FrozenBundle['seal']>(requireFile(files,'frozen-seal.json'),'frozen-seal.json');
  assert(seal.status==='REVIEW_REQUIRED_NO_WRITES'
    && seal.published===false && seal.importAuthorized===false
    && seal.sourceActionRun===FROZEN_INPUT_RUN,
    'frozen seal accidentally claims publication or approval');
  return expected.seal;
}
