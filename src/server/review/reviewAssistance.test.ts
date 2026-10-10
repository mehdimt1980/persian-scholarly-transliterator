import {describe,expect,it} from 'vitest';
import {PRIMARY_REVIEWER_REF,proposeEvidenceRationale,reviewerRefForSession,suggestedIjmesProfile}
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
