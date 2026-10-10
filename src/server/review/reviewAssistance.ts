/** Phase 8Q: reviewer convenience only, never an attestation or IJMES authority grant. */
import type {LexicalCandidateCategory} from '../../validation/lexical-evidence/types';
export const PRIMARY_REVIEWER_REF='primary-reviewer' as const;
export type ReviewProfile='ijmes_full'|'ijmes_title';
export interface RationaleEvidence {
  candidateId:string;
  persian:string;
  category:LexicalCandidateCategory;
  sourceRecordId:string;
  variants:Array<{value:string;classification:string;sourceField:string}>;
}
export function suggestedIjmesProfile(category:LexicalCandidateCategory):ReviewProfile {
  if(category==='WORK_TITLE'||category==='PERSON_NAME'
    ||category==='PLACE_NAME'||category==='ORGANIZATION_NAME')return 'ijmes_title';
  return 'ijmes_full';
}
/** Plain editorial checklist, generated solely from current BSB fields. NOT a claim of scholarly verification. */
export function proposeEvidenceRationale(
  evidence:RationaleEvidence,canonical:string,profile:ReviewProfile,
):string {
  const kind={
    WORK_TITLE:'bibliographic title',PERSON_NAME:'personal name',PLACE_NAME:'place name',
    ORGANIZATION_NAME:'organizational name',MULTIWORD_EXPRESSION:'multiword expression',
    LEXICAL_TERM:'lexical term',UNCLASSIFIED_CANDIDATE:'unclassified expression',
  }[evidence.category];
  const observed=evidence.variants.find(v=>v.classification==='ROMANIZATION_CANDIDATE');
  const uncertain=evidence.variants.some(v=>v.classification!=='ROMANIZATION_CANDIDATE');
  const parts=[
    'EDITORIAL DRAFT — source comparison and independent IJMES verification are still required.',
    'BSB MARC 001 '+evidence.sourceRecordId+' supplies a Persian '+kind+'.',
    observed
      ? 'The catalogue contains a romanization candidate in MARC '+observed.sourceField
        +' ('+observed.value.slice(0,160)+'); this is not authoritative.'
      : 'No independently verified romanization is present in this catalogue evidence.',
    uncertain
      ? 'Other Latin variants may be translations or uncertain parallels rather than Persian transliterations.'
      : 'Check the Persian and Latin field alignment, names, diacritics, hamza and ʿayn against IJMES.',
    canonical.trim()
      ? 'Proposed '+(profile==='ijmes_title'?'IJMES title/proper-name':'IJMES full scholarly')
        +' spelling: '+canonical.trim().slice(0,160)+'.'
      : 'A defensible IJMES spelling has not yet been entered.',
    'Before acceptance, confirm this exact reading and replace this draft with the actual comparison findings.',
  ];
  return parts.join(' ').slice(0,3500);
}
export function reviewerRefForSession():typeof PRIMARY_REVIEWER_REF{
  return PRIMARY_REVIEWER_REF;
}
