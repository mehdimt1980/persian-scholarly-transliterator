/** Strict, review-only Phase 8K comparison of a selected MARC fixture to live BSB.
 * Catalogue fields and observed romanizations are data, never verified IJMES authority.
 */
import { createHash } from 'node:crypto';
import { adaptBsbRecord } from '../../validation/acquisition/bsb/adapter';
import type { MarcRecord, MarcDataField } from '../../validation/acquisition/bsb/types';
import type { LexicalCandidate } from '../../validation/lexical-evidence/types';

const sha=(value:string):string=>createHash('sha256').update(value,'utf8').digest('hex');
const recordId=(r:MarcRecord):string=>{
  const id=r.controlfields.find(field=>field.tag==='001')?.value;
  if(!id)throw new Error('Reconciliation record lacks MARC 001');
  return id;
};
const stringKey=(value:unknown):string=>JSON.stringify(value);
const fieldKey=(field:MarcDataField):string=>stringKey({
  tag:field.tag,ind1:field.ind1,ind2:field.ind2,
  subfields:field.subfields.map(s=>({code:s.code,value:s.value.normalize('NFC')})),
});
const compareField=(field:MarcDataField, live:MarcDataField[]):'EXACT_SELECTED_FIELD'|'TAG_PRESENT_DIFFERENT_FIELD'|'TAG_ABSENT'=>
  live.some(item=>fieldKey(item)===fieldKey(field))?'EXACT_SELECTED_FIELD'
  :live.some(item=>item.tag===field.tag)?'TAG_PRESENT_DIFFERENT_FIELD':'TAG_ABSENT';
const semantic=(candidate:LexicalCandidate):string=>sha(stringKey({
  candidateId:candidate.candidateId,originalPersianForm:candidate.originalPersianForm,
  normalizedSearchForm:candidate.normalizedSearchForm,category:candidate.category,
  linguisticContext:candidate.linguisticContext,
  observedLatinVariants:candidate.observedLatinVariants.map(({value,classification,sourceField})=>({value,classification,sourceField})),
}));
// 'Semantic' here is precisely the listed bibliographic evidence fields,
// NOT conformity to any scholarly transliteration style.
export interface FixtureReconciliation {
  schemaVersion:'phase8k-bsb-fixture-reconciliation-v1';
  decision:'BLOCKED_PENDING_FIELD_REVIEW';
  baselineSource:'SELECTED_MARC_FIELDS_NOT_COMPLETE_SRU_RESPONSE';
  baselineRecordCount:number;
  matchedLiveRecordCount:number;
  missingLiveRecordIds:string[];
  records:Array<{
    id:string;fixtureRecordSha256:string;liveRecordSha256:string;
    fixtureHasBlankLeader:boolean;liveAdditionalDatafields:number;
    selectedFields:Array<{tag:string;state:'EXACT_SELECTED_FIELD'|'TAG_PRESENT_DIFFERENT_FIELD'|'TAG_ABSENT'}>;
    exactSelectedFieldCount:number;selectedFieldDifferenceCount:number;
    candidateDifferences:Array<{candidateId:string;state:'SEMANTICS_UNCHANGED_PROVENANCE_CHANGED'|'SEMANTIC_EVIDENCE_CHANGED'|'NO_CURRENT_LIVE_CANDIDATE'|'NEW_LIVE_CANDIDATE'|'EXACT_CONTENT_HASH';
      fixtureEvidenceFingerprint:string|null;liveEvidenceFingerprint:string|null;
      fixtureContentHash:string|null;liveContentHash:string|null}>;
  }>;
  totals:{fixtureCandidates:number;liveCandidates:number;semanticMatches:number;semanticDifferences:number;missingCandidates:number;newCandidates:number;
    exactSelectedFields:number;differentSelectedFields:number};
  blockers:string[];
  oldActiveSnapshotPreserved:true;
  persisted:false;
  ijmesAuthorityPromoted:false;
}
export function reconcileBsbSelectedFixture(input:{
  fixtureRecords:MarcRecord[];
  liveRecords:MarcRecord[];
  persistedCandidates:LexicalCandidate[];
}):FixtureReconciliation {
  const {fixtureRecords,liveRecords,persistedCandidates}=input;
  if(fixtureRecords.length!==2)throw new Error('Expected exactly two selected baseline fixture records');
  const index=<T>(values:T[],get:(v:T)=>string,tag:string):Map<string,T>=>{
    const out=new Map<string,T>();
    for(const value of values){const id=get(value);if(!id||out.has(id))throw new Error('Duplicate '+tag+' identity');out.set(id,value);}
    return out;
  };
  const liveById=index(liveRecords,recordId,'live MARC 001');
  const persistedById=index(persistedCandidates,c=>c.candidateId,'persisted candidate');
  if(persistedCandidates.some(c=>c.reviewStatus!=='UNREVIEWED'||c.authorityStatus!=='NON_AUTHORITATIVE_CANDIDATE'))
    throw new Error('Persisted authority state unexpected');
  const fixtureById=index(fixtureRecords,recordId,'fixture MARC 001');
  const missingLiveRecordIds=fixtureRecords.filter(r=>!liveById.has(recordId(r))).map(recordId);
  const totals={fixtureCandidates:0,liveCandidates:0,semanticMatches:0,semanticDifferences:0,
    missingCandidates:0,newCandidates:0,exactSelectedFields:0,differentSelectedFields:0};
  const reports:FixtureReconciliation['records']=[];
  for(const fixture of fixtureRecords){
    const id=recordId(fixture);
    const live=liveById.get(id);
    if(!live)continue;
    const expectedFixtureCandidates=adaptBsbRecord(fixture);
    const fixtureCandidates=expectedFixtureCandidates.map(c=>persistedById.get(c.candidateId)??null);
    if(fixtureCandidates.some(c=>!c))throw new Error('Active snapshot does not contain expected fixture candidate ID');
    const oldCandidates=index(fixtureCandidates as LexicalCandidate[],c=>c.candidateId,'fixture candidate');
    const newCandidates=index(adaptBsbRecord(live),c=>c.candidateId,'live candidate');
    totals.fixtureCandidates+=oldCandidates.size;
    totals.liveCandidates+=newCandidates.size;
    const selectedFields=fixture.datafields.map(field=>({tag:field.tag,state:compareField(field,live.datafields)}));
    const exactSelectedFieldCount=selectedFields.filter(f=>f.state==='EXACT_SELECTED_FIELD').length;
    const selectedFieldDifferenceCount=selectedFields.length-exactSelectedFieldCount;
    totals.exactSelectedFields+=exactSelectedFieldCount;
    totals.differentSelectedFields+=selectedFieldDifferenceCount;
    const candidateDifferences:FixtureReconciliation['records'][number]['candidateDifferences']=[];
    for(const old of oldCandidates.values()){
      const newer=newCandidates.get(old.candidateId);
      let state:FixtureReconciliation['records'][number]['candidateDifferences'][number]['state'];
      if(!newer){state='NO_CURRENT_LIVE_CANDIDATE';totals.missingCandidates++;}
      else if(old.contentHash===newer.contentHash){state='EXACT_CONTENT_HASH';totals.semanticMatches++;}
      else if(semantic(old)===semantic(newer)){state='SEMANTICS_UNCHANGED_PROVENANCE_CHANGED';totals.semanticMatches++;}
      else{state='SEMANTIC_EVIDENCE_CHANGED';totals.semanticDifferences++;}
      candidateDifferences.push({candidateId:old.candidateId,state,
        fixtureEvidenceFingerprint:semantic(old),liveEvidenceFingerprint:newer?semantic(newer):null,
        fixtureContentHash:old.contentHash,liveContentHash:newer?.contentHash??null});
    }
    for(const candidate of newCandidates.values())if(!oldCandidates.has(candidate.candidateId)){
      totals.newCandidates++;
      candidateDifferences.push({candidateId:candidate.candidateId,state:'NEW_LIVE_CANDIDATE',
        fixtureEvidenceFingerprint:null,liveEvidenceFingerprint:semantic(candidate),
        fixtureContentHash:null,liveContentHash:candidate.contentHash});
    }
    reports.push({id,fixtureRecordSha256:sha(fixture.rawXml),liveRecordSha256:sha(live.rawXml),
      fixtureHasBlankLeader:!fixture.leader,
      liveAdditionalDatafields:Math.max(0,live.datafields.length-fixture.datafields.length),
      selectedFields,exactSelectedFieldCount,selectedFieldDifferenceCount,candidateDifferences});
  }
  const blockers=['HUMAN_FIELD_LEVEL_REVIEW_REQUIRED','NO_AUTO_OVERWRITE_OF_BASELINE','IJMES_AUTHORITY_NOT_VERIFIED'];
  if(missingLiveRecordIds.length)blockers.push('BASELINE_RECORD_MISSING_FROM_BOUNDED_LIVE_SAMPLE');
  if(totals.differentSelectedFields)blockers.push('SELECTED_FIXTURE_FIELD_MISMATCH');
  if(totals.semanticDifferences||totals.missingCandidates)blockers.push('CANDIDATE_SEMANTIC_MISMATCH');
  if(totals.newCandidates)blockers.push('NEW_LIVE_CANDIDATES_REQUIRE_REVIEW');
  if(fixtureById.size!==2)throw new Error('Invalid fixture identity cardinality');
  return{schemaVersion:'phase8k-bsb-fixture-reconciliation-v1',
    decision:'BLOCKED_PENDING_FIELD_REVIEW',
    baselineSource:'SELECTED_MARC_FIELDS_NOT_COMPLETE_SRU_RESPONSE',
    baselineRecordCount:fixtureRecords.length,matchedLiveRecordCount:reports.length,
    missingLiveRecordIds,records:reports,totals,blockers,
    oldActiveSnapshotPreserved:true,persisted:false,ijmesAuthorityPromoted:false};
}
