import fs from 'node:fs';
import { describe,expect,it } from 'vitest';
import { parseMarcCollection } from '../../validation/acquisition/bsb/marcxml';
import { adaptBsbRecord } from '../../validation/acquisition/bsb/adapter';
import type { MarcRecord } from '../../validation/acquisition/bsb/types';
import { reconcileBsbSelectedFixture } from './bsbFixtureReconciliation';

const fixtureXml=fs.readFileSync('validation/acquisition/bsb/authentic-selected-records.v1.xml','utf8');
const fixture=parseMarcCollection(fixtureXml);
const persisted=fixture.flatMap(adaptBsbRecord);
const baseline=()=>({fixtureRecords:structuredClone(fixture),liveRecords:structuredClone(fixture),
  persistedCandidates:structuredClone(persisted)});
const irrelevantField=(record:MarcRecord)=>({
  namespaceUri:record.namespaceUri,tag:'500',ind1:' ',ind2:' ',
  subfields:[{namespaceUri:record.namespaceUri,code:'a',value:'Catalog note; not part of the selected fixture.'}],
});

describe('Phase 8K legacy fixture and current BSB semantic reconciliation',()=>{
  it('classifies harmless full-MARC additions as provenance drift, not IJMES semantic edits',()=>{
    const input=baseline();
    input.liveRecords[0].datafields.push(irrelevantField(input.liveRecords[0]));
    input.liveRecords[0].rawXml += '<!-- additional unrelated source MARC field -->';
    const result=reconcileBsbSelectedFixture(input);
    expect(result.baselineRecordCount).toBe(2);
    expect(result.matchedLiveRecordCount).toBe(2);
    expect(result.totals.fixtureCandidates).toBe(3);
    expect(result.totals.semanticMatches).toBe(3);
    expect(result.totals.semanticDifferences).toBe(0);
    expect(result.totals.differentSelectedFields).toBe(0);
    expect(result.records[0].candidateDifferences.some(c=>c.state==='SEMANTICS_UNCHANGED_PROVENANCE_CHANGED')).toBe(true);
    expect(result.decision).toBe('BLOCKED_PENDING_FIELD_REVIEW');
    expect(result.persisted).toBe(false);
    expect(result.ijmesAuthorityPromoted).toBe(false);
  });
  it('identifies a newly added untranslated Latin title separately from changed transliteration',()=>{
    const input=baseline();
    const record=input.liveRecords[1];
    record.datafields.push({namespaceUri:record.namespaceUri,tag:'246',ind1:'1',ind2:'1',
      subfields:[{namespaceUri:record.namespaceUri,code:'a',value:'Persian literature'}]});
    record.rawXml += '<!-- live record contains an additional parallel title -->';
    const result=reconcileBsbSelectedFixture(input);
    expect(result.totals.additiveLatinVariantCandidates).toBe(1);
    expect(result.totals.semanticDifferences).toBe(0);
    expect(result.totals.semanticMatches).toBe(2);
    expect(result.records[1].candidateDifferences.some(c=>c.state==='ADDITIVE_LATIN_VARIANTS_REQUIRE_REVIEW')).toBe(true);
    expect(result.blockers).toContain('ADDITIVE_CATALOGUE_VARIANT_REQUIRES_REVIEW');
    expect(result.decision).toBe('BLOCKED_PENDING_FIELD_REVIEW');
  });
  it('detects a change to the actual linked Latin romanization and does not silently approve it',()=>{
    const input=baseline();
    const field=input.liveRecords[0].datafields.find(f=>f.tag==='245')!;
    field.subfields.find(s=>s.code==='a')!.value='A genuinely different Latin title';
    input.liveRecords[0].rawXml += '<!-- changed source content -->';
    const result=reconcileBsbSelectedFixture(input);
    expect(result.totals.differentSelectedFields).toBeGreaterThan(0);
    expect(result.totals.semanticDifferences).toBeGreaterThan(0);
    expect(result.blockers).toContain('CANDIDATE_SEMANTIC_MISMATCH');
    expect(result.blockers).toContain('SELECTED_FIXTURE_FIELD_MISMATCH');
    expect(result.oldActiveSnapshotPreserved).toBe(true);
  });
  it('requires stable baseline identities and fails on missing active candidate IDs',()=>{
    const wrong=baseline();
    wrong.persistedCandidates.splice(0,1);
    expect(()=>reconcileBsbSelectedFixture(wrong)).toThrow(/does not contain expected fixture candidate ID/);
    const missing=baseline();
    missing.liveRecords.pop();
    const result=reconcileBsbSelectedFixture(missing);
    expect(result.missingLiveRecordIds).toHaveLength(1);
    expect(result.blockers).toContain('BASELINE_RECORD_MISSING_FROM_BOUNDED_LIVE_SAMPLE');
    const duplicate=baseline();
    duplicate.liveRecords.push(duplicate.liveRecords[0]);
    expect(()=>reconcileBsbSelectedFixture(duplicate)).toThrow(/Duplicate live MARC 001 identity/);
  });
  it('rejects unexpected authority promotion of persisted evidence',()=>{
    const input=baseline();
    input.persistedCandidates[0].reviewStatus='REVIEWED';
    expect(()=>reconcileBsbSelectedFixture(input)).toThrow(/Persisted authority state unexpected/);
  });
});
