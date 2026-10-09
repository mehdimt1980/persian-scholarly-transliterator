/** Bounded live BSB acquisition preflight; no Neon or Blob writes. */
import { createHash } from 'node:crypto';
import { adaptBsbRecord } from '../validation/acquisition/bsb/adapter';
import { buildSruUrl, fetchSruPage } from '../validation/acquisition/bsb/client';

const MAX_REQUESTS = 2;
const PAGE_SIZE = 10;
const q = { index: 'language', relation: '==' as const, term: 'per' };
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const idOf = (record: {controlfields:Array<{tag:string;value:string}>}) =>
  record.controlfields.find(field=>field.tag==='001')?.value;

export async function runBsbBoundedPreflight(
  fetcher: typeof fetch = fetch
): Promise<{
  status: string; query: typeof q; requests: number; pages: Array<{
    requestedStart:number; returned:number; totalReported:number;
    nextRecordPosition:number|null; responseSha256:string; sourceUrl:string;
  }>; observed:number; unique:number; duplicateIds:number; candidateCount:number;
  excludedNoPersianCandidates:number; persianCandidateTypes: Record<string,number>;
  persisted:false; warnings:string[];
}> {
  const pages = []; const seen = new Set<string>(); let observed=0,duplicates=0,candidates=0,excluded=0;
  const types:Record<string,number>={};const warnings:string[]=[];
  let start=1; let total: number|undefined;
  for(let request=0; request<MAX_REQUESTS; request++) {
    const url=buildSruUrl(q,start,PAGE_SIZE);
    const {page,xml}=await fetchSruPage(url,fetcher);
    if(total!==undefined && page.numberOfRecords!==total) warnings.push('SRU total count changed between pages');
    total=page.numberOfRecords;
    pages.push({requestedStart:start,returned:page.records.length,totalReported:total,nextRecordPosition:page.nextRecordPosition,responseSha256:sha(xml),sourceUrl:url.toString()});
    for(const record of page.records){
      observed++;
      const id=idOf(record);
      if(!id) throw new Error('BSB record without 001');
      if(seen.has(id)){duplicates++;continue;}
      seen.add(id);
      const matches=adaptBsbRecord(record);
      if(!matches.length) excluded++;
      for(const candidate of matches){
        if(candidate.reviewStatus!=='UNREVIEWED'||candidate.authorityStatus!=='NON_AUTHORITATIVE_CANDIDATE') throw new Error('Authority elevation detected');
        candidates++;types[candidate.category]=(types[candidate.category]??0)+1;
      }
    }
    if(!page.records.length||page.nextRecordPosition===null||page.nextRecordPosition>total)break;
    if(page.nextRecordPosition<=start)throw new Error('Non-increasing SRU pagination');
    start=page.nextRecordPosition;
  }
  return {status:'BSB_BOUNDED_PREFLIGHT_OK',query:q,requests:pages.length,pages,observed,unique:seen.size,duplicateIds:duplicates,candidateCount:candidates,excludedNoPersianCandidates:excluded,persianCandidateTypes:types,persisted:false,warnings};
}
if(process.argv[1]?.endsWith('bsbBoundedPreflightCli.ts')){
 runBsbBoundedPreflight().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error instanceof Error?error.message:'BSB preflight failed');process.exitCode=1;});
}
