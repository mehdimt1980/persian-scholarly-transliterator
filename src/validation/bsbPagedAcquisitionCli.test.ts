import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { collectBsbPagedEvidence } from './bsbPagedAcquisitionCli';

const fixture = fs.readFileSync('validation/acquisition/bsb/authentic-selected-records.v1.xml','utf8');
const source = [...fixture.matchAll(/<record>[\s\S]*?<\/record>/gu)].map((match)=>match[0]);
if (source.length !== 2) throw new Error('Unexpected authentic fixture');
function wrap(xml:string, position:number) {
  return `<record><recordPosition>${position}</recordPosition><recordData>${xml.replace('<record>', '<record xmlns="http://www.loc.gov/MARC21/slim">')}</recordData></record>`;
}
function page(start:number,total:number, records:string[], next:number|null) {
  return `<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><version>1.2</version><numberOfRecords>${total}</numberOfRecords><records>${records.map((xml,i)=>wrap(xml,start+i)).join('')}</records>${next===null?'':`<nextRecordPosition>${next}</nextRecordPosition>`}</searchRetrieveResponse>`;
}
const mockFetcher = (...xmls:string[]) => vi.fn().mockImplementationOnce(async()=>new Response(xmls[0])).mockImplementationOnce(async()=>new Response(xmls[1]));

describe('Phase 8I BSB paged, read-only evidence package',()=>{
  it('retrieves bounded pages, reports duplicate records and preserves raw response hashes',async()=>{
    const first=page(1,4,source,3);
    const second=page(3,4,source,null);
    const fetcher=mockFetcher(first,second);
    const { manifest,rawPages }=await collectBsbPagedEvidence({fetcher:fetcher as unknown as typeof fetch,maxPages:2,pageSize:2});
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(manifest.pages).toHaveLength(2);
    expect(manifest.metrics).toMatchObject({ observed:4,unique:2,duplicateRecords:2 });
    expect(manifest.metrics.candidateCount).toBeGreaterThan(0);
    expect(manifest.metrics.romanizationProposals).toBeGreaterThan(0);
    expect(manifest.sourceComplete).toBe(true);
    expect(manifest.nextStartRecord).toBeNull();
    expect(manifest.persisted).toBe(false);
    expect(manifest.authorityPromoted).toBe(false);
    expect(manifest.reviewCandidates.every((c)=>c.reviewStatus==='UNREVIEWED'&&c.authorityStatus==='NON_AUTHORITATIVE_CANDIDATE')).toBe(true);
    expect(rawPages.map(p=>p.xml)).toEqual([first,second]);
    expect(manifest.pages.every(p=>p.rawSha256.length===64)).toBe(true);
  });
  it('stops at hard request and record budget while exposing a safe continuation pointer',async()=>{
    const fetcher=vi.fn(async()=>new Response(page(1,100,source,3)));
    const {manifest}=await collectBsbPagedEvidence({fetcher:fetcher as unknown as typeof fetch,maxPages:1,pageSize:2});
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(manifest.metrics.observed).toBe(2);
    expect(manifest.budgetExhausted).toBe(true);
    expect(manifest.sourceComplete).toBe(false);
    expect(manifest.nextStartRecord).toBe(3);
  });
  it('fails closed when repeated 001 points to different MARC content',async()=>{
    const altered=source[0].replace('<leader>','<leader>X');
    const fetcher=mockFetcher(page(1,3,source,3),page(3,3,[altered],null));
    await expect(collectBsbPagedEvidence({fetcher:fetcher as unknown as typeof fetch,maxPages:2,pageSize:2}))
      .rejects.toThrow(/Conflicting MARC content/);
  });
  it('fails closed on changed totals and unexpected continuation positions',async()=>{
    const change=mockFetcher(page(1,4,source,3),page(3,5,source,null));
    await expect(collectBsbPagedEvidence({fetcher:change as unknown as typeof fetch,maxPages:2,pageSize:2}))
      .rejects.toThrow(/result count changed/);
    const bad=vi.fn(async()=>new Response(page(1,9,source,6)));
    await expect(collectBsbPagedEvidence({fetcher:bad as unknown as typeof fetch,maxPages:2,pageSize:2}))
      .rejects.toThrow(/pagination cursor/);
    const missing=vi.fn(async()=>new Response(page(1,9,source,null)));
    await expect(collectBsbPagedEvidence({fetcher:missing as unknown as typeof fetch,maxPages:2,pageSize:2}))
      .rejects.toThrow(/Missing SRU continuation/);
  });
  it('rejects attempts to exceed strict 5x10 limits before calling provider',async()=>{
    const fetcher=vi.fn();
    await expect(collectBsbPagedEvidence({maxPages:6,fetcher:fetcher as unknown as typeof fetch}))
      .rejects.toThrow(/limits exceeded/);
    await expect(collectBsbPagedEvidence({pageSize:11,fetcher:fetcher as unknown as typeof fetch}))
      .rejects.toThrow(/limits exceeded/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
