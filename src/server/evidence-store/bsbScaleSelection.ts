/** Phase 8P BSB bounded scale-out: select whole authentic MARC records, never candidate fragments. */
import {createHash} from 'node:crypto';
import {adaptBsbRecord} from '../../validation/acquisition/bsb/adapter';
import {parseMarcCollection} from '../../validation/acquisition/bsb/marcxml';
import type {MarcRecord} from '../../validation/acquisition/bsb/types';

export const TARGET_TOTAL_CANDIDATES=750;
export const MAX_PAGES=20;
export const PAGE_SIZE=50;
export const BASELINE_SNAPSHOT='snapshot-f76feb36ca85541c8faafb42';
export const sha=(data:string)=>createHash('sha256').update(data,'utf8').digest('hex');
const recordId=(record:MarcRecord)=>record.controlfields.find(x=>x.tag==='001')?.value;
export type ScaleRecordSeal={id:string;canonicalRecordSha256:string;candidateIds:string[];candidateHashes:string[];candidateCount:number};
export interface ScaleSelection{
  selected:MarcRecord[];
  seal:ScaleRecordSeal[];
  candidatesAdded:number;
  skippedExisting:number;
  skippedNoCandidate:number;
  seenIds:Set<string>;
}
export function selectBsbScaleRecords(options:{
  incoming:MarcRecord[]; existingRecordIds:Set<string>; selection:ScaleSelection; maxNewCandidates?:number;
}):void{
  const {incoming,existingRecordIds,selection}=options;
  const goal=options.maxNewCandidates??(TARGET_TOTAL_CANDIDATES-75);
  if(!Number.isInteger(goal)||goal<=0||goal>10000)throw new Error('Invalid source acquisition target');
  for(const record of incoming){
    if(selection.candidatesAdded>=goal)break;
    const id=recordId(record);
    if(!id)throw new Error('MARC 001 missing in scale-out');
    if(selection.seenIds.has(id))throw new Error('Duplicated SRU MARC 001 across result pages: '+id);
    selection.seenIds.add(id);
    if(existingRecordIds.has(id)){selection.skippedExisting++;continue;}
    const candidates=adaptBsbRecord(record);
    if(!candidates.length){selection.skippedNoCandidate++;continue;}
    if(candidates.some(c=>c.sourceRecordIds.length!==1||c.sourceRecordIds[0]!==id
        ||c.reviewStatus!=='UNREVIEWED'||c.authorityStatus!=='NON_AUTHORITATIVE_CANDIDATE'
        ||c.evidenceStatus!=='CANDIDATE'))
      throw new Error('Candidate provenance or non-authority invariant violated');
    if(new Set(candidates.map(c=>c.candidateId)).size!==candidates.length)
      throw new Error('Duplicate candidate identity in selected MARC record');
    selection.selected.push(record);
    selection.seal.push({id,canonicalRecordSha256:sha(record.rawXml),
      candidateIds:candidates.map(c=>c.candidateId),
      candidateHashes:candidates.map(c=>c.contentHash),candidateCount:candidates.length});
    selection.candidatesAdded+=candidates.length;
  }
}
export function freshScaleSelection():ScaleSelection{
  return {selected:[],seal:[],candidatesAdded:0,skippedExisting:0,skippedNoCandidate:0,seenIds:new Set()};
}
export function renderSelectedBsbBatches(records:MarcRecord[],batchSize=40):Array<{name:string;xml:string;recordCount:number}>{
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>50)throw new Error('Batch size outside MARC parser limits');
  const output=[];
  for(let offset=0;offset<records.length;offset+=batchSize){
    const subset=records.slice(offset,offset+batchSize);
    const name='selected-batch-'+String(1+Math.floor(offset/batchSize)).padStart(3,'0')+'.marcxml';
    const xml='<collection xmlns="http://www.loc.gov/MARC21/slim">'+subset.map(x=>x.rawXml).join('')+'</collection>';
    const reparsed=parseMarcCollection(xml);
    if(reparsed.length!==subset.length||reparsed.some((r,i)=>sha(r.rawXml)!==sha(subset[i].rawXml)))
      throw new Error('Frozen MARC collection canonical roundtrip failed');
    output.push({name,xml,recordCount:subset.length});
  }
  return output;
}
export function validateScaleSeals(records:MarcRecord[],seals:ScaleRecordSeal[]):number{
  if(records.length!==seals.length||new Set(seals.map(s=>s.id)).size!==seals.length)
    throw new Error('Selected BSB record/seal count mismatch');
  let count=0;
  for(let i=0;i<records.length;i++){
    const r=records[i],seal=seals[i];
    const candidates=adaptBsbRecord(r);
    if(recordId(r)!==seal.id||sha(r.rawXml)!==seal.canonicalRecordSha256
      ||JSON.stringify(candidates.map(c=>c.candidateId))!==JSON.stringify(seal.candidateIds)
      ||JSON.stringify(candidates.map(c=>c.contentHash))!==JSON.stringify(seal.candidateHashes)
      ||candidates.length!==seal.candidateCount)
      throw new Error('BSB source checksum/candidate freeze mismatch for '+seal.id);
    count+=candidates.length;
  }
  return count;
}
