import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {parseMarcCollection,parseMarcRecord} from '../../validation/acquisition/bsb/marcxml';
import {adaptBsbRecord} from '../../validation/acquisition/bsb/adapter';
import {buildBsbScholarlyReviewPacket,makePendingDecisionTemplate,
  validateBsbHumanReviewDecisions,verifyBsbScholarlyReviewPacket,renderBsbReviewCsv} from './bsbScholarlyReview';

const original=parseMarcCollection(fs.readFileSync('validation/acquisition/bsb/authentic-selected-records.v1.xml','utf8'));
const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
const id=(r:typeof original[number])=>r.controlfields.find(x=>x.tag==='001')!.value;
function packet(){
  const records=Array.from({length:50},(_,i)=>{
    if(i<2)return original[i];
    const base=original[i%2];
    const newId='99'+String(i).padStart(16,'0');
    return parseMarcRecord(base.rawXml.replace(
      '<controlfield tag="001">'+id(base)+'</controlfield>',
      '<controlfield tag="001">'+newId+'</controlfield>'));
  });
  const rows=records.flatMap(record=>adaptBsbRecord(record).map(candidate=>({
    sourceVersionId:'BSB_SRU_MARCXML:'+id(record)+':'+sha(record.rawXml),candidate,
  })));
  expect(rows).toHaveLength(75);
  return buildBsbScholarlyReviewPacket({
    snapshotId:'snapshot-f76feb36ca85541c8faafb42',
    manifestChecksum:'a'.repeat(64),rows,
  });
}
describe('Phase 8P snapshot-scalable review guard',()=>{
  it('accepts a verified new snapshot and a small subset without requiring exactly 75 records',()=>{
    const prior=packet();
    const subset=prior.items.slice(0,2).map(item=>({
      sourceVersionId:item.sourceVersionId,candidate:item.candidateSnapshot,
    }));
    const next=buildBsbScholarlyReviewPacket({
      snapshotId:'snapshot-'+'a'.repeat(24),manifestChecksum:'b'.repeat(64),rows:subset,
    });
    expect(next.candidateCount).toBe(2);
    expect(next.items).toHaveLength(2);
    expect(next.items[0].reviewBasisSha256).not.toBe(prior.items[0].reviewBasisSha256);
    const decisions=makePendingDecisionTemplate(next);
    expect(validateBsbHumanReviewDecisions(next,decisions).counts.PENDING).toBe(2);
  });
  it('rejects empty packets, oversized packets and malformed snapshot IDs',()=>{
    const first=packet().items[0];
    const row={sourceVersionId:first.sourceVersionId,candidate:first.candidateSnapshot};
    expect(()=>buildBsbScholarlyReviewPacket({
      snapshotId:'snapshot-invalid',manifestChecksum:'a'.repeat(64),rows:[row],
    })).toThrow(/invalid snapshot identity/);
    expect(()=>buildBsbScholarlyReviewPacket({
      snapshotId:'snapshot-'+'a'.repeat(24),manifestChecksum:'a'.repeat(64),rows:[],
    })).toThrow(/invalid candidate review packet size/);
    expect(()=>buildBsbScholarlyReviewPacket({
      snapshotId:'snapshot-'+'a'.repeat(24),manifestChecksum:'a'.repeat(64),rows:Array(10001).fill(row),
    })).toThrow(/invalid candidate review packet size/);
  });
});

describe('Phase 8N scientifically honest BSB reviewer queue',()=>{
  it('exports 75 hash-bound UNREVIEWED items with 75 PENDING decisions and no authority grant',()=>{
    const review=packet();
    expect(review.items).toHaveLength(75);
    expect(new Set(review.items.map(x=>x.candidateId)).size).toBe(75);
    expect(review.items.every(x=>x.candidateSnapshot.reviewStatus==='UNREVIEWED')).toBe(true);
    verifyBsbScholarlyReviewPacket(review);
    const initial=makePendingDecisionTemplate(review);
    expect(initial.decisions.every(x=>x.disposition==='PENDING'&&x.canonical===null)).toBe(true);
    const verified=validateBsbHumanReviewDecisions(review,initial);
    expect(verified.counts).toEqual({PENDING:75,ACCEPT:0,REJECT:0,DEFER:0});
    expect(verified.accepted).toHaveLength(0);
    expect(verified.promotionAuthorized).toBe(false);
    expect(verified.evidenceSnapshotModified).toBe(false);
    const csv=renderBsbReviewCsv(review);
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(76);
    expect(csv).toContain('ROMANIZATION_CANDIDATE');
  });
  it('accepts one actual explicit reviewed IJMES canonical as proposal only, never auto promotes',()=>{
    const review=packet();
    const decisions=makePendingDecisionTemplate(review);
    decisions.decisions[0]={
      ...decisions.decisions[0],disposition:'ACCEPT',canonical:'tārīkh-i Īrān',
      profile:'ijmes_title',reviewerRef:'scholar-reviewer-01',
      reviewedAt:'2026-10-09T20:00:00.000Z',
      rationale:'Checked Persian vowels, context and diacritics manually against IJMES editorial rules.',
      humanAttestation:'I_PERSONALLY_VERIFIED_THIS_IJMES_FORM',
    };
    const result=validateBsbHumanReviewDecisions(review,decisions);
    expect(result.counts).toEqual({PENDING:74,ACCEPT:1,REJECT:0,DEFER:0});
    expect(result.accepted[0].canonical).toBe('tārīkh-i Īrān');
    expect(result.promotionAuthorized).toBe(false);
  });
  it('fails closed on invented default acceptance, incorrect profile or Persian-script output',()=>{
    const review=packet();
    const decisions=makePendingDecisionTemplate(review);
    const first=decisions.decisions[0];
    first.disposition='ACCEPT';
    first.canonical='کتاب';
    first.profile='ijmes_full';
    first.reviewerRef='reviewer';
    first.reviewedAt='2026-10-09T20:00:00.000Z';
    first.rationale='Manually checked this lexical form against all required editorial IJMES rules.';
    expect(()=>validateBsbHumanReviewDecisions(review,decisions)).toThrow(/attestation missing/);
    first.humanAttestation='I_PERSONALLY_VERIFIED_THIS_IJMES_FORM';
    expect(()=>validateBsbHumanReviewDecisions(review,decisions)).toThrow(/invalid explicitly selected/);
    first.canonical='kitāb';
    first.profile=null;
    expect(()=>validateBsbHumanReviewDecisions(review,decisions)).toThrow(/profile must be explicit/);
  });
  it('requires explicit rationale for rejection and defer, and no canonical for either',()=>{
    const review=packet();
    const decisions=makePendingDecisionTemplate(review);
    decisions.decisions[0].disposition='REJECT';
    expect(()=>validateBsbHumanReviewDecisions(review,decisions)).toThrow(/reviewer provenance/);
    const row=decisions.decisions[0];
    row.reviewerRef='scholar-01';
    row.reviewedAt='2026-10-09T20:00:00.000Z';
    row.rationale='Source is a translated English work title, not a transliteration of Persian.';
    row.canonical=null;
    expect(validateBsbHumanReviewDecisions(review,decisions).counts.REJECT).toBe(1);
    row.disposition='DEFER';
    row.canonical='kitāb';
    expect(()=>validateBsbHumanReviewDecisions(review,decisions)).toThrow(/cannot contain IJMES canonical/);
  });
  it('rejects stale packet sha, stale candidate basis, duplicates and forged source evidence',()=>{
    const review=packet();
    const decisions=makePendingDecisionTemplate(review);
    decisions.packetSha256='0'.repeat(64);
    expect(()=>validateBsbHumanReviewDecisions(review,decisions)).toThrow(/do not match pinned review basis/);
    decisions.packetSha256=review.packetSha256;
    decisions.decisions[1].candidateId=decisions.decisions[0].candidateId;
    expect(()=>validateBsbHumanReviewDecisions(review,decisions)).toThrow(/duplicate or stale/);
    const tampered=structuredClone(review);
    tampered.items[0].candidateSnapshot.originalPersianForm='عبارت ساختگی';
    expect(()=>verifyBsbScholarlyReviewPacket(tampered)).toThrow(/content hash mismatch/i);
  });
});
