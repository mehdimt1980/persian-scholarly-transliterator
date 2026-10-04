import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AcquisitionCandidateMinimal,
  ReauditWorklistDocument,
  getExpectedReauditBatch,
  validateReauditWorklist,
  validateRepositoryReauditWorklist
} from './reauditWorklist';

function createBlankFixture(): {
  worklist: ReauditWorklistDocument;
  acquisition: AcquisitionCandidateMinimal[];
} {
  const categories: Array<{ category: string; profile: string; count: number }> = [
    { category: 'TERM', profile: 'ijmes_full', count: 15 },
    { category: 'RELIGIOUS_TERM', profile: 'ijmes_full', count: 10 },
    { category: 'COMPOUND', profile: 'ijmes_full', count: 5 },
    { category: 'MORPHOLOGY', profile: 'ijmes_full', count: 10 },
    { category: 'IZAFAT', profile: 'ijmes_full', count: 8 },
    { category: 'PERSON', profile: 'ijmes_full', count: 18 },
    { category: 'PLACE', profile: 'ijmes_full', count: 12 },
    { category: 'INSTITUTION', profile: 'ijmes_full', count: 6 },
    { category: 'BOOK_TITLE', profile: 'ijmes_title', count: 12 },
    { category: 'AMBIGUITY', profile: 'ijmes_full', count: 12 }
  ];

  const acquisition: AcquisitionCandidateMinimal[] = [];
  const cases: ReauditWorklistDocument['cases'] = [];
  let counter = 1;

  for (const { category, profile, count } of categories) {
    for (let i = 0; i < count; i++) {
      const id = `cand-synth-${String(counter).padStart(3, '0')}`;
      const sourceText = `synthetic_${counter}`;
      acquisition.push({ id, sourceText, category, proposedProfile: profile });
      cases.push({
        id,
        sourceText,
        category,
        profile,
        batch: getExpectedReauditBatch(category),
        reviewState: 'PENDING',
        decision: null
      });
      counter++;
    }
  }

  return {
    acquisition,
    worklist: {
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
    }
  };
}

function syntheticReviewer() {
  return {
    name: 'OpenAI GPT-5.6 Sol' as const,
    type: 'AI_SPECIALIST' as const,
    reviewedAt: '2026-10-04'
  };
}

function completeBatchA(worklist: ReauditWorklistDocument): void {
  worklist.metadata.status = 'BATCH_A_COMPLETED';
  worklist.summary.pending = 83;
  worklist.summary.adjudicated = 25;

  for (const c of worklist.cases) {
    if (c.batch !== 'A') continue;
    c.reviewState = 'COMPLETED';
    c.decision = {
      disposition: 'FINAL',
      scholarlyCanonical: `canonical-${c.id}`,
      renderedOutput: `rendered-${c.id}`,
      readingEvidence: [
        {
          source: 'Synthetic lexical authority',
          citation: `Synthetic citation ${c.id}`,
          locator: 'entry'
        }
      ],
      renderingEvidence: [
        {
          source: 'Synthetic style authority',
          citation: 'Synthetic rendering rule',
          locator: 'rule'
        }
      ],
      reviewNote: 'Synthetic non-adjudicative fixture.',
      reviewer: syntheticReviewer()
    };
  }
}

describe('V2 re-audit worklist validator', () => {
  it('validates the repository Batch A artifact', () => {
    expect(() => validateRepositoryReauditWorklist()).not.toThrow();
  });

  it('preserves support for the pristine blank 108-case artifact', () => {
    const { worklist, acquisition } = createBlankFixture();
    expect(() => validateReauditWorklist(worklist, acquisition)).not.toThrow();
  });

  it('validates a synthetic Batch A completed artifact', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    expect(() => validateReauditWorklist(worklist, acquisition)).not.toThrow();
  });

  it('does not dictate FINAL: REVIEW_REQUIRED is valid under the protocol contract', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const c = worklist.cases.find((item) => item.batch === 'A')!;
    c.decision = {
      disposition: 'REVIEW_REQUIRED',
      nonAuthoritativeAlternatives: [
        { reading: 'reading-a', source: 'Synthetic source A' },
        { reading: 'reading-b', source: 'Synthetic source B' }
      ],
      readingEvidence: [
        {
          source: 'Synthetic lexical authority',
          citation: 'Synthetic ambiguity citation',
          locator: 'entry'
        }
      ],
      reviewNote: 'Synthetic ambiguity; no authoritative output.',
      reviewer: syntheticReviewer()
    };
    expect(() => validateReauditWorklist(worklist, acquisition)).not.toThrow();
  });

  it('does not dictate FINAL: UNRESOLVED is valid without rendering evidence', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const c = worklist.cases.find((item) => item.batch === 'A')!;
    c.decision = {
      disposition: 'UNRESOLVED',
      readingEvidence: [
        {
          source: 'Synthetic lexical authority',
          citation: 'Synthetic insufficient-evidence citation',
          locator: 'entry'
        }
      ],
      reviewNote: 'Synthetic unresolved reading.',
      reviewer: syntheticReviewer()
    };
    expect(() => validateReauditWorklist(worklist, acquisition)).not.toThrow();
  });

  it('rejects authoritative canonical fields on a non-FINAL decision', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const c = worklist.cases.find((item) => item.batch === 'A')!;
    c.decision = {
      disposition: 'REVIEW_REQUIRED',
      readingEvidence: [
        { source: 'Synthetic', citation: 'Synthetic citation', locator: 'entry' }
      ],
      reviewNote: 'Synthetic ambiguity.',
      reviewer: syntheticReviewer()
    };
    (c.decision as any).scholarlyCanonical = 'forbidden';
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_BATCH_A_DECISION.*CONTAINS_UNEXPECTED_KEY:scholarlyCanonical/
    );
  });

  it('allows optional renderingEvidence for non-FINAL only when non-empty', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const c = worklist.cases.find((item) => item.batch === 'A')!;
    c.decision = {
      disposition: 'UNRESOLVED',
      readingEvidence: [
        { source: 'Synthetic', citation: 'Synthetic citation', locator: 'entry' }
      ],
      renderingEvidence: [],
      reviewNote: 'Synthetic unresolved reading.',
      reviewer: syntheticReviewer()
    };
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /RENDERING_EVIDENCE_MUST_BE_NONEMPTY/
    );
  });

  it('rejects duplicate case IDs', () => {
    const { worklist, acquisition } = createBlankFixture();
    worklist.cases[1].id = worklist.cases[0].id;
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_DUPLICATE_CASE_ID/
    );
  });

  it('rejects acquisition alignment mismatches', () => {
    const { worklist, acquisition } = createBlankFixture();
    worklist.cases[0].sourceText = 'tampered';
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_SOURCETEXT_MISMATCH/
    );
  });

  it('rejects unexpected root contamination', () => {
    const { worklist, acquisition } = createBlankFixture();
    (worklist as any).historicalCanonicals = {};
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_DOCUMENT_CONTAINS_UNEXPECTED_KEY/
    );
  });

  it('rejects unexpected case keys', () => {
    const { worklist, acquisition } = createBlankFixture();
    (worklist.cases[0] as any).priorCanonical = 'anchor';
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_CASE.*CONTAINS_UNEXPECTED_KEY/
    );
  });

  it('rejects engineEvaluationPerformed=true', () => {
    const { worklist, acquisition } = createBlankFixture();
    worklist.metadata.engineEvaluationPerformed = true;
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_ENGINE_EVALUATION_MUST_BE_FALSE/
    );
  });

  it('rejects non-null human sign-off', () => {
    const { worklist, acquisition } = createBlankFixture();
    worklist.metadata.humanSignoff = { approved: true };
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_HUMAN_SIGNOFF_MUST_BE_NULL/
    );
  });

  it('requires every Batch A case to be completed in BATCH_A_COMPLETED state', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const batchACase = worklist.cases.find((c) => c.batch === 'A')!;
    batchACase.reviewState = 'PENDING';
    batchACase.decision = null;
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_BATCH_A_CASE_NOT_COMPLETED/
    );
  });

  it('keeps every non-Batch-A case pending and blank', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const batchBCase = worklist.cases.find((c) => c.batch === 'B')!;
    batchBCase.reviewState = 'COMPLETED';
    batchBCase.decision = worklist.cases.find((c) => c.batch === 'A')!.decision;
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_NON_BATCH_A_CASE_MUST_REMAIN_PENDING/
    );
  });

  it('rejects unknown Batch A dispositions', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const decision = worklist.cases.find((c) => c.batch === 'A')!.decision as any;
    decision.disposition = 'INVENTED';
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_BATCH_A_DISPOSITION_INVALID/
    );
  });

  it('rejects extra fields inside a FINAL Batch A decision', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const decision = worklist.cases.find((c) => c.batch === 'A')!.decision as any;
    decision.priorCanonical = 'anchor';
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_BATCH_A_DECISION.*CONTAINS_UNEXPECTED_KEY/
    );
  });

  it('rejects Persian/Arabic script in scholarlyCanonical', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const decision = worklist.cases.find((c) => c.batch === 'A')!.decision as any;
    decision.scholarlyCanonical = 'تست';
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /SCHOLARLY_CANONICAL_CONTAINS_ARABIC_SCRIPT/
    );
  });

  it('rejects Persian/Arabic script in renderedOutput', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const decision = worklist.cases.find((c) => c.batch === 'A')!.decision as any;
    decision.renderedOutput = 'تست';
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /RENDERED_OUTPUT_CONTAINS_ARABIC_SCRIPT/
    );
  });

  it('requires non-empty reading evidence', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const decision = worklist.cases.find((c) => c.batch === 'A')!.decision as any;
    decision.readingEvidence = [];
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /READING_EVIDENCE_MUST_BE_NONEMPTY/
    );
  });

  it('requires non-empty rendering evidence for FINAL decisions', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const decision = worklist.cases.find((c) => c.batch === 'A')!.decision as any;
    decision.renderingEvidence = [];
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /RENDERING_EVIDENCE_MUST_BE_NONEMPTY/
    );
  });

  it('rejects incorrect reviewer provenance', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const decision = worklist.cases.find((c) => c.batch === 'A')!.decision as any;
    decision.reviewer.type = 'HUMAN';
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_DECISION_REVIEWER_TYPE_INVALID/
    );
  });

  it('requires the actual Batch A review date', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    const decision = worklist.cases.find((c) => c.batch === 'A')!.decision as any;
    decision.reviewer.reviewedAt = '2026-10-03';
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_DECISION_REVIEW_DATE_INVALID/
    );
  });

  it('rejects Batch A summary count drift', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeBatchA(worklist);
    worklist.summary.pending = 84;
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_SUMMARY_PENDING_MISMATCH/
    );
  });

  it('keeps strict summary key allowlists', () => {
    const { worklist, acquisition } = createBlankFixture();
    (worklist.summary as any).oldAnswers = {};
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_SUMMARY_CONTAINS_UNEXPECTED_KEY/
    );
  });

  it('contains no transliteration engine execution path', () => {
    const validatorFilePath = path.join(__dirname, 'reauditWorklist.ts');
    const sourceCode = fs.readFileSync(validatorFilePath, 'utf8');
    expect(sourceCode).not.toMatch(/import.*transliterate/);
    expect(sourceCode).not.toMatch(/transliterate\s*\(/);
    expect(sourceCode).not.toMatch(/from\s+['\"].*domain\/engine['\"]/);
  });
});
