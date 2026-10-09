/** Compare bounded Persian-script discovery strategies against live BSB SRU.
 * Read-only: no credential access and no Neon/Blob mutations.
 */
import { createHash } from 'node:crypto';
import { buildSruUrl, fetchSruPage } from './acquisition/bsb/client';
import { adaptBsbRecord } from './acquisition/bsb/adapter';

const strategies = [
  { name: 'persian-title', index: 'dc_title', relation: 'all', term: 'فارسی' },
  { name: 'persian-general', index: 'all_for_ui', relation: 'all', term: 'فارسی' },
] as const;
export async function runTargetedBsbDiscovery(fetcher: typeof fetch = fetch) {
  const seen = new Set<string>();
  const results: Array<Record<string,unknown>> = [];
  for(const strategy of strategies) {
    const url = buildSruUrl(strategy, 1, 10);
    try {
      const { page, xml } = await fetchSruPage(url, fetcher);
      let newRecords=0, duplicates=0, eligibleRecords=0, candidates=0, with880=0;
      const types:Record<string,number>={};
      for(const record of page.records) {
        const id=record.controlfields.find(x=>x.tag==='001')?.value;
        if(!id) throw new Error('MARC 001 absent');
        if(seen.has(id)){duplicates++;continue;}
        seen.add(id);newRecords++;
        if(record.datafields.some(x=>x.tag==='880'))with880++;
        const c=adaptBsbRecord(record);
        if(c.length)eligibleRecords++;
        for(const item of c) {
          if(item.authorityStatus!=='NON_AUTHORITATIVE_CANDIDATE'||item.reviewStatus!=='UNREVIEWED')throw new Error('Authority status unexpectedly elevated');
          candidates++;types[item.category]=(types[item.category]??0)+1;
        }
      }
      results.push({strategy:strategy.name, query:{index:strategy.index,relation:strategy.relation,term:strategy.term}, requestUrl:url.toString(),
        responseSha256:createHash('sha256').update(xml).digest('hex'),totalReported:page.numberOfRecords,
        recordsReceived:page.records.length,newRecords,duplicates,recordsWith880:with880,
        eligibleRecords,candidates,candidateCategories:types,status:'OK'});
    } catch(error) {
      const message=error instanceof Error?error.message:'Unknown SRU failure';
      results.push({strategy:strategy.name,status:'QUERY_FAILED',reason:message.slice(0,240)});
    }
  }
  return {status:'TARGETED_BSB_DISCOVERY_COMPLETE',requestsAttempted:strategies.length,
    uniqueRecords:seen.size,results,persisted:false,authorityPromotion:false};
}
if(process.argv[1]?.endsWith('bsbTargetedDiscoveryCli.ts')){
 runTargetedBsbDiscovery().then(result=>{
   console.log(JSON.stringify(result,null,2));
   if(result.results.every(x=>x.status==='QUERY_FAILED'))process.exitCode=1;
 }).catch(error=>{console.error(error instanceof Error?error.message:'Targeted BSB discovery failed');process.exitCode=1;});
}
