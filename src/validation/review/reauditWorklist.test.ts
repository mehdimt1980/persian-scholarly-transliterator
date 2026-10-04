import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  validateReauditWorklist,
  validateRepositoryReauditWorklist,
  ReauditWorklistDocument,
  AcquisitionCandidateMinimal,
  getExpectedReauditBatch
} from './reauditWorklist';

describe('V2 Re-Audit Worklist & Blindness Validator Suite', () => {
  // Helper to create synthetic valid test fixtures
  function createSyntheticWorklistFixture(): {
    worklist: ReauditWorklistDocument;
    acquisition: AcquisitionCandidateMinimal[];
  } {
    const categories: Array<{ cat: string; profile: string; count: number }> = [
      { cat: 'TERM', profile: 'ijmes_full', count: 15 },
      { cat: 'RELIGIOUS_TERM', profile: 'ijmes_full', count: 10 },
      { cat: 'COMPOUND', profile: 'ijmes_full', count: 5 },
      { cat: 'MORPHOLOGY', profile: 'ijmes_full', count: 10 },
      { cat: 'IZAFAT', profile: 'ijmes_full', count: 8 },
      { cat: 'PERSON', profile: 'ijmes_full', count: 18 },
      { cat: 'PLACE', profile: 'ijmes_full', count: 12 },
      { cat: 'INSTITUTION', profile: 'ijmes_full', count: 6 },
      { cat: 'BOOK_TITLE', profile: 'ijmes_title', count: 12 },
      { cat: 'AMBIGUITY', profile: 'ijmes_full', count: 12 }
    ];

    const acquisition: AcquisitionCandidateMinimal[] = [];
    const cases: ReauditWorklistDocument['cases'] = [];

    let idx = 1;
    for (const { cat, profile, count } of categories) {
      for (let i = 0; i < count; i++) {
        const id = `cand-synth-${String(idx).padStart(3, '0')}`;
        const sourceText = `synth_source_${idx}`;
        const batch = getExpectedReauditBatch(cat);

        acquisition.push({
          id,
          sourceText,
          category: cat,
          proposedProfile: profile
        });

        cases.push({
          id,
          sourceText,
          category: cat,
          profile,
          batch,
          reviewState: 'PENDING',
          decision: null
        });

        idx++;
      }
    }

    const worklist: ReauditWorklistDocument = {
      metadata: {
        schemaVersion: 2,
        artifactType: 'BLIND_REAUDIT_WORKLIST',
        sourceCorpus: 'validation/acquisition/external-candidates.v1.json',
        sourceCorpusCount: 108,
        status: 'READY_FOR_BLIND_REAUDIT',
        engineEvaluationPerformed: false,
        humanSignoff: null,
        priorAdjudicationAuthority: 'HISTORICAL_ONLY'
      },
      summary: {
        total: 108,
        pending: 108,
        adjudicated: 0,
        byBatch: { A: 25, B: 23, C: 36, D: 12, E: 12 },
        byCategory: {
          TERM: 15,
          RELIGIOUS_TERM: 10,
          PERSON: 18,
          PLACE: 12,
          INSTITUTION: 6,
          BOOK_TITLE: 12,
          COMPOUND: 5,
          MORPHOLOGY: 10,
          IZAFAT: 8,
          AMBIGUITY: 12
        }
      },
      cases
    };

    return { worklist, acquisition };
  }

  // 1. Canonical blank 108-case worklist validates
  it('1. validates the canonical repository blank 108-case worklist', () => {
    expect(() => validateRepositoryReauditWorklist()).not.toThrow();
  });

  // 2. Duplicate ID fails
  it('2. throws on duplicate case IDs in the worklist', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.cases[1].id = worklist.cases[0].id; // duplicate ID

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_DUPLICATE_CASE_ID/
    );
  });

  // 3. Missing candidate fails
  it('3. throws when a candidate is missing from the worklist', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.cases.pop(); // remove one case

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_CASE_COUNT_MISMATCH/
    );
  });

  // 4. Extra candidate fails
  it('4. throws when an extra candidate is added to the worklist', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.cases.push({
      id: 'cand-extra-999',
      sourceText: 'extra',
      category: 'TERM',
      profile: 'ijmes_full',
      batch: 'A',
      reviewState: 'PENDING',
      decision: null
    });

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_CASE_COUNT_MISMATCH/
    );
  });

  // 5. sourceText mismatch fails
  it('5. throws when sourceText diverges from acquisition record', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.cases[0].sourceText = 'tampered_source';

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_SOURCETEXT_MISMATCH/
    );
  });

  // 6. category mismatch fails
  it('6. throws when category diverges from acquisition record', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.cases[0].category = 'PLACE'; // was TERM

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_CATEGORY_MISMATCH/
    );
  });

  // 7. profile mismatch fails
  it('7. throws when profile diverges from proposedProfile in acquisition', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.cases[0].profile = 'ijmes_title'; // was ijmes_full

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_PROFILE_MISMATCH/
    );
  });

  // 8. wrong batch fails
  it('8. throws when deterministic batch assignment is incorrect', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.cases[0].batch = 'C'; // was A for TERM

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_BATCH_MISMATCH/
    );
  });

  // 9. non-PENDING state fails in the initial blank artifact
  it('9. throws when reviewState is not PENDING in the initial blank worklist', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.cases[0].reviewState = 'COMPLETED';

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_CASE_NOT_PENDING/
    );
  });

  // 10. non-null decision fails in this initialization PR
  it('10. throws when a decision object is populated in the initialization worklist', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.cases[0].decision = { disposition: 'FINAL', scholarlyCanonical: 'test' };

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_CASE_HAS_NON_NULL_DECISION/
    );
  });

  // 11. engineEvaluationPerformed: true fails
  it('11. throws when engineEvaluationPerformed is true', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.metadata.engineEvaluationPerformed = true;

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_ENGINE_EVALUATION_MUST_BE_FALSE/
    );
  });

  // 12. non-null humanSignoff fails
  it('12. throws when humanSignoff is prematurely populated', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.metadata.humanSignoff = { reviewer: 'Human', approvedAt: '2026-10-04' };

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_HUMAN_SIGNOFF_MUST_BE_NULL/
    );
  });

  // 13. prohibited field such as priorCanonical fails
  it('13. throws when prohibited historical anchor field priorCanonical is present in a case', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    (worklist.cases[0] as any).priorCanonical = 'anchored_string';

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_CASE_CONTAINS_PROHIBITED_FIELD.*priorCanonical/
    );
  });

  // 14. prohibited field such as engineOutput fails
  it('14. throws when prohibited runtime field engineOutput is present in a case', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    (worklist.cases[0] as any).engineOutput = 'engine_transliteration';

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_CASE_CONTAINS_PROHIBITED_FIELD.*engineOutput/
    );
  });

  // 15. validator contains no engine/transliteration execution path
  it('15. confirms re-audit validator source code does not import or execute transliteration engine', () => {
    const validatorFilePath = path.join(__dirname, 'reauditWorklist.ts');
    const sourceCode = fs.readFileSync(validatorFilePath, 'utf8');

    expect(sourceCode).not.toMatch(/import.*transliterate/);
    expect(sourceCode).not.toMatch(/transliterate\s*\(/);
    expect(sourceCode).not.toMatch(/from\s+['"].*domain\/engine['"]/);
  });
});
