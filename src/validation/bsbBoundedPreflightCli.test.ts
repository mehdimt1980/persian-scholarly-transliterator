import fs from 'node:fs';
import { describe,expect,it,vi } from 'vitest';
import { runBsbBoundedPreflight } from './bsbBoundedPreflightCli';

const fixture=fs.readFileSync('validation/acquisition/bsb/authentic-selected-records.v1.xml','utf8');
const records=[...fixture.matchAll(/<record>[\s\S]*?<\/record>/gu)].map(x=>x[0]);
function sru(start:number,total:number,next:number|null):string {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/">
  <version>1.2</version><numberOfRecords>${total}</numberOfRecords>
  ${next===null?'':`<nextRecordPosition>${next}</nextRecordPosition>`}
  <records>${records.map((record,i)=>`<record><recordPosition>${start+i}</recordPosition><recordData>${record.replace('<record>','<record xmlns="http://www.loc.gov/MARC21/slim">')}</recordData></record>`).join('')}</records></searchRetrieveResponse>`;
}
describe('bounded BSB preflight',()=>{
 it('caps requests, records quality and never writes',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(new Response(sru(1,100,3),{status:200}))
   .mockResolvedValueOnce(new Response(sru(3,100,5),{status:200}));
  const out=await runBsbBoundedPreflight(mock as unknown as typeof fetch);
  expect(mock).toHaveBeenCalledTimes(2);
  expect(out.persisted).toBe(false);
  expect(out.observed).toBe(4);
  expect(out.unique).toBe(2);
  expect(out.duplicateIds).toBe(2);
  expect(out.candidateCount).toBeGreaterThan(0);
 });
 it('fails closed on malformed SRU response',async()=>{
  const mock=vi.fn().mockResolvedValue(new Response('<invalid/>',{status:200}));
  await expect(runBsbBoundedPreflight(mock as unknown as typeof fetch)).rejects.toThrow();
 });
});
