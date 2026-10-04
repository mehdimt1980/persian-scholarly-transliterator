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

  // 13. Exact allowlist fails when scholarlyCanonical is at case root
  it('13. throws when scholarlyCanonical is placed at case root', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    (worklist.cases[0] as any).scholarlyCanonical = 'anchored_canonical';

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_CASE_CONTAINS_PROHIBITED_FIELD.*scholarlyCanonical/
    );
  });

  // 14. Exact allowlist fails when renderedOutput is at case root
  it('14. throws when renderedOutput is placed at case root', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    (worklist.cases[0] as any).renderedOutput = 'anchored_rendered';

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_CASE_CONTAINS_PROHIBITED_FIELD.*renderedOutput/
    );
  });

  // 15. Exact allowlist fails on arbitrary unknown field (e.g. unexpectedAnchor)
  it('15. throws on arbitrary unknown field like unexpectedAnchor due to positive allowlist', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    (worklist.cases[0] as any).unexpectedAnchor = 'unknown_anchor_value';

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_CASE_CONTAINS_PROHIBITED_FIELD.*unexpectedAnchor/
    );
  });

  // 16. Missing required case key fails
  it('16. throws when a required case key is missing', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    delete (worklist.cases[0] as any).batch;

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_CASE_MISSING_REQUIRED_KEY.*batch/
    );
  });

  // 17. Incorrect metadata sourceCorpus fails
  it('17. throws when metadata.sourceCorpus is incorrect', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.metadata.sourceCorpus = 'wrong/path/corpus.json';

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_SOURCE_CORPUS_INVALID/
    );
  });

  // 18. Incorrect metadata priorAdjudicationAuthority fails
  it('18. throws when metadata.priorAdjudicationAuthority is not HISTORICAL_ONLY', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.metadata.priorAdjudicationAuthority = 'AUTHORITATIVE';

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_PRIOR_ADJUDICATION_AUTHORITY_INVALID/
    );
  });

  // 19. Unexpected metadata key fails
  it('19. throws when metadata contains an unexpected extra key', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    (worklist.metadata as any).unexpectedExtra = 'prohibited';

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_METADATA_CONTAINS_UNEXPECTED_KEY.*unexpectedExtra/
    );
  });

  // 20. Tampered summary batch count fails
  it('20. throws when summary.byBatch is tampered while cases remain unchanged', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.summary.byBatch.A = 99; // tampered summary

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_SUMMARY_BATCH_COUNT_MISMATCH:A/
    );
  });

  // 21. Tampered summary category count fails
  it('21. throws when summary.byCategory is tampered while cases remain unchanged', () => {
    const { worklist, acquisition } = createSyntheticWorklistFixture();
    worklist.summary.byCategory.TERM = 99; // tampered summary

    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_SUMMARY_CATEGORY_COUNT_MISMATCH:TERM/
    );
  });

  // 22. Validator source code contains no transliteration/engine execution path
  it('22. confirms re-audit validator source code does not import or execute transliteration engine', () => {
    const validatorFilePath = path.join(__dirname, 'reauditWorklist.ts');
    const sourceCode = fs.readFileSync(validatorFilePath, 'utf8');

    expect(sourceCode).not.toMatch(/import.*transliterate/);
    expect(sourceCode).not.toMatch(/transliterate\s*\(/);
    expect(sourceCode).not.toMatch(/from\s+['"].*domain\/engine['"]/);
  });
});
