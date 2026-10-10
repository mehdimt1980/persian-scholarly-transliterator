import {describe,expect,it} from 'vitest';
import {PRIMARY_REVIEWER_REF,parseAIScholarlyDraft,proposeEvidenceRationale,reviewerRefForSession,suggestedIjmesProfile}
  from './reviewAssistance';
import type {LexicalCandidateCategory} from '../../validation/lexical-evidence/types';

const example={candidateId:'lex-01fea5db13f709c4bbd9',
  persian:'دانشگاه تهران',sourceRecordId:'991144600686807356',
  category:'ORGANIZATION_NAME' as const,
  variants:[{value:'Danishgah-i Tihran',classification:'ROMANIZATION_CANDIDATE',sourceField:'710'}],
};

describe('Phase 8Q single human reviewer assisted workflow',()=>{
  it('keeps primary-reviewer server-authoritative and immutable across requests',()=>{
    expect(PRIMARY_REVIEWER_REF).toBe('primary-reviewer');
    expect(reviewerRefForSession()).toBe(PRIMARY_REVIEWER_REF);
  });
  it('preselects IJMES titles/proper-name profile for persons, places, organizations and works',()=>{
    const proper:LexicalCandidateCategory[]=['PERSON_NAME','PLACE_NAME','WORK_TITLE','ORGANIZATION_NAME'];
    for(const category of proper)expect(suggestedIjmesProfile(category)).toBe('ijmes_title');
    const full:LexicalCandidateCategory[]=['MULTIWORD_EXPRESSION','LEXICAL_TERM','UNCLASSIFIED_CANDIDATE'];
    for(const category of full)expect(suggestedIjmesProfile(category)).toBe('ijmes_full');
  });
  it('generates source-grounded draft without faking verification or human attestation',()=>{
    const note=proposeEvidenceRationale(example,'Danishgah-i Tihran','ijmes_title');
    expect(note).toContain('EDITORIAL DRAFT');
    expect(note).toContain('991144600686807356');
    expect(note).toContain('Danishgah-i Tihran');
    expect(note).toContain('Before acceptance');
    expect(note).toContain('comparison and independent IJMES verification are still required');
    expect(note).not.toContain('I personally verified');
    expect(note.length).toBeGreaterThan(120);
  });
  it('distinguishes translations/uncertain variants and missing proposed spelling',()=>{
    const note=proposeEvidenceRationale({...example,category:'WORK_TITLE' as const,
      variants:[{value:'History of Iran',classification:'UNDETERMINED_LATIN_VARIANT',sourceField:'246'}]},
    '', 'ijmes_title');
    expect(note).toContain('translations or uncertain parallels');
    expect(note).toContain('A defensible IJMES spelling has not yet been entered');
    expect(note).not.toContain('Proposed IJMES title/proper-name spelling:');
  });
  it('limits source data echoed into a draft note',()=>{
    const text=proposeEvidenceRationale({...example,variants:[{value:'x'.repeat(20000),
      classification:'ROMANIZATION_CANDIDATE',sourceField:'880'}]},'y'.repeat(30000),'ijmes_full');
    expect(text.length).toBeLessThanOrEqual(3500);
    expect(text).toContain('IJMES full scholarly');
  });
});


describe('Phase 8Q AI output is never a scholarly acceptance',()=>{
  const output=(proposedCanonical:string|null,rationale='The catalogue evidence suggests this spelling, but this IJMES reading remains unverified and requires human checking.',uncertainties:string[]=[]) =>
    JSON.stringify({proposedCanonical,rationale,uncertainties});
  it('extracts a strictly unverified IJMES title recommendation and unresolved evidence',()=>{
    const parsed=parseAIScholarlyDraft(output('Tarikh-i Iran',undefined,['Izafat needs source verification']),'ijmes_title');
    expect(parsed?.proposedCanonical).toBe('Tarikh-i Iran');
    expect(parsed?.uncertainties).toEqual(['Izafat needs source verification']);
    expect(parsed).not.toHaveProperty('humanAttestation');
    expect(parsed).not.toHaveProperty('disposition');
    expect(parsed).not.toHaveProperty('publicationAuthorized');
  });
  it('does not force a reading for uncertain unvowelled Persian',()=>{
    expect(parseAIScholarlyDraft(output(null),'ijmes_full')?.proposedCanonical).toBeNull();
  });
  it('rejects title forms with scholarly diacritics, Arabic script and invalid formatting',()=>{
    expect(parseAIScholarlyDraft(output('Tārīkh-i Īrān'),'ijmes_title')).toBeNull();
    expect(parseAIScholarlyDraft(output('تاریخ ایران'),'ijmes_full')).toBeNull();
    expect(parseAIScholarlyDraft(output('Tarikh\nIran'),'ijmes_title')).toBeNull();
    expect(parseAIScholarlyDraft(output('ʿAli-i Iran'),'ijmes_title')?.proposedCanonical).toBe('ʿAli-i Iran');
  });
  it('accepts properly bounded full scholarly diacritics without treating them as certification',()=>{
    const parsed=parseAIScholarlyDraft(output('tārīkh-i Īrān'),'ijmes_full');
    expect(parsed?.proposedCanonical).toBe('tārīkh-i Īrān');
    expect(parsed?.rationale).toContain('unverified');
  });
  it('fails closed on non-JSON or fictional human/source attestation',()=>{
    expect(parseAIScholarlyDraft('This is a transliteration','ijmes_title')).toBeNull();
    expect(parseAIScholarlyDraft(output('Tarikh','I personally verified the original and confirm the correct spelling.'),'ijmes_title')).toBeNull();
    expect(parseAIScholarlyDraft(output('Tarikh','The reviewer approved this record and says it is correct.'),'ijmes_title')).toBeNull();
  });
  it('rejects unexpected unbounded suggestions and invalid uncertainty shapes',()=>{
    expect(parseAIScholarlyDraft(output('x'.repeat(1001)),'ijmes_full')).toBeNull();
    expect(parseAIScholarlyDraft(JSON.stringify({proposedCanonical:'Tarikh',rationale:'x'.repeat(50),uncertainties:'none'}),'ijmes_title')).toBeNull();
    expect(parseAIScholarlyDraft(output('Tarikh','x'.repeat(1201)),'ijmes_title')).toBeNull();
  });
});
