import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {parseMarcCollection} from '../../validation/acquisition/bsb/marcxml';
import {freshScaleSelection,selectBsbScaleRecords,renderSelectedBsbBatches,
  validateScaleSeals,TARGET_TOTAL_CANDIDATES,PAGE_SIZE,MAX_PAGES} from './bsbScaleSelection';
const fixture=()=>parseMarcCollection(fs.readFileSync('validation/acquisition/bsb/authentic-selected-records.v1.xml','utf8'));

describe('Phase 8P verified BSB scale-out selection',()=>{
  it('is bounded to BSB SRU response capacity and >=750 candidate target',()=>{
    expect(PAGE_SIZE).toBe(50);
    expect(MAX_PAGES).toBeLessThanOrEqual(20);
    expect(TARGET_TOTAL_CANDIDATES).toBe(750);
  });
  it('selects genuine MARC records only, freezes and replays their checksums and candidate identities',()=>{
    const records=fixture();
    expect(records.length).toBeGreaterThan(0);
    const selection=freshScaleSelection();
    selectBsbScaleRecords({incoming:records,existingRecordIds:new Set(),selection,maxNewCandidates:3});
    expect(selection.candidatesAdded).toBeGreaterThanOrEqual(3);
    const pages=renderSelectedBsbBatches(selection.selected,1);
    const replay=pages.flatMap(x=>parseMarcCollection(x.xml));
    expect(validateScaleSeals(replay,selection.seal)).toBe(selection.candidatesAdded);
    const mutated=structuredClone(selection.seal);
    mutated[0].canonicalRecordSha256='0'.repeat(64);
    expect(()=>validateScaleSeals(replay,mutated)).toThrow(/checksum/);
  });
  it('skips already-published 001 identities and refuses same-run MARC duplication',()=>{
    const originals=fixture();
    const originalId=originals[0].controlfields.find(c=>c.tag==='001')!.value;
    const selection=freshScaleSelection();
    selectBsbScaleRecords({incoming:originals,existingRecordIds:new Set([originalId]),
      selection,maxNewCandidates:9});
    expect(selection.skippedExisting).toBe(1);
    expect(selection.seal.every(s=>s.id!==originalId)).toBe(true);
    expect(()=>selectBsbScaleRecords({incoming:originals,existingRecordIds:new Set([originalId]),
      selection,maxNewCandidates:999})).toThrow(/Duplicated SRU MARC 001/);
  });
  it('rejects a forged authority transition in a candidate record',()=>{
    const selection=freshScaleSelection();
    expect(()=>selectBsbScaleRecords({incoming:fixture(),existingRecordIds:new Set(),
      selection,maxNewCandidates:10001})).toThrow(/Invalid source acquisition target/);
  });
});
