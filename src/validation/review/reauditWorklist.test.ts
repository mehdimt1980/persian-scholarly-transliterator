import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AcquisitionCandidateMinimal,
  ReauditBatch,
  ReauditStatus,
  ReauditWorklistDocument,
  EXPECTED_BATCH_COUNTS,
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

function reviewer(date = '2026-10-05') {
  return { name: 'Synthetic Specialist', type: 'AI_SPECIALIST' as const, reviewedAt: date };
}

function finalDecision(id: string) {
  return {
    disposition: 'FINAL' as const,
    scholarlyCanonical: `canonical-${id}`,
    renderedOutput: `rendered-${id}`,
    readingEvidence: [
      { source: 'Synthetic reading authority', citation: `Synthetic ${id}`, locator: 'entry' }
    ],
    renderingEvidence: [
      { source: 'Synthetic rendering authority', citation: 'Synthetic style rule', locator: 'rule' }
    ],
    reviewNote: 'Synthetic non-adjudicative fixture.',
    reviewer: reviewer()
  };
}

const STATUS_BY_BATCH: Record<ReauditBatch, ReauditStatus> = {
  A: 'BATCH_A_COMPLETED',
  B: 'BATCH_B_COMPLETED',
  C: 'BATCH_C_COMPLETED',
  D: 'BATCH_D_COMPLETED',
  E: 'BATCH_E_COMPLETED'
};
const ORDER: ReauditBatch[] = ['A', 'B', 'C', 'D', 'E'];

function completeThrough(worklist: ReauditWorklistDocument, through: ReauditBatch): void {
  const completed = new Set(ORDER.slice(0, ORDER.indexOf(through) + 1));
  let adjudicated = 0;
  for (const c of worklist.cases) {
    if (completed.has(c.batch)) {
      c.reviewState = 'COMPLETED';
      c.decision = finalDecision(c.id);
      adjudicated++;
    }
  }
  worklist.metadata.status = STATUS_BY_BATCH[through];
  worklist.summary.adjudicated = adjudicated;
  worklist.summary.pending = 108 - adjudicated;
}

describe('V2 re-audit worklist validator', () => {
  it('validates the repository Batch B artifact', () => {
    expect(() => validateRepositoryReauditWorklist()).not.toThrow();
  });

  it('preserves the pristine blank 108-case state', () => {
    const { worklist, acquisition } = createBlankFixture();
    expect(() => validateReauditWorklist(worklist, acquisition)).not.toThrow();
  });

  it('validates sequential completion through Batch A', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeThrough(worklist, 'A');
    expect(() => validateReauditWorklist(worklist, acquisition)).not.toThrow();
  });

  it('validates sequential completion through Batch B', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeThrough(worklist, 'B');
    expect(worklist.summary.adjudicated).toBe(48);
    expect(worklist.summary.pending).toBe(60);
    expect(() => validateReauditWorklist(worklist, acquisition)).not.toThrow();
  });

  it('supports future sequential statuses without changing scholarly outcomes', () => {
    const expected = { C: 84, D: 96, E: 108 } as const;
    for (const batch of ['C', 'D', 'E'] as ReauditBatch[]) {
      const { worklist, acquisition } = createBlankFixture();
      completeThrough(worklist, batch);
      expect(worklist.summary.adjudicated).toBe(expected[batch as keyof typeof expected]);
      expect(() => validateReauditWorklist(worklist, acquisition)).not.toThrow();
    }
  });

  it('requires all earlier batches when Batch B is declared complete', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeThrough(worklist, 'B');
    const a = worklist.cases.find((c) => c.batch === 'A')!;
    a.reviewState = 'PENDING';
    a.decision = null;
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_COMPLETED_BATCH_CASE_INVALID/
    );
  });

  it('rejects contamination of a later batch', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeThrough(worklist, 'B');
    const c = worklist.cases.find((item) => item.batch === 'C')!;
    c.reviewState = 'COMPLETED';
    c.decision = finalDecision(c.id);
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_PENDING_BATCH_CASE_INVALID/
    );
  });

  it('does not dictate FINAL: REVIEW_REQUIRED is valid in a completed batch', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeThrough(worklist, 'B');
    const c = worklist.cases.find((item) => item.batch === 'B')!;
    c.decision = {
      disposition: 'REVIEW_REQUIRED',
      nonAuthoritativeAlternatives: [
        { reading: 'reading-a', source: 'Synthetic A' },
        { reading: 'reading-b', source: 'Synthetic B' }
      ],
      readingEvidence: [
        { source: 'Synthetic', citation: 'Synthetic ambiguity evidence', locator: 'entry' }
      ],
      reviewNote: 'Synthetic ambiguity.',
      reviewer: reviewer()
    };
    expect(() => validateReauditWorklist(worklist, acquisition)).not.toThrow();
  });

  it('does not dictate FINAL: UNRESOLVED is valid without rendering evidence', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeThrough(worklist, 'B');
    const c = worklist.cases.find((item) => item.batch === 'B')!;
    c.decision = {
      disposition: 'UNRESOLVED',
      readingEvidence: [
        { source: 'Synthetic', citation: 'Insufficient reading evidence', locator: 'entry' }
      ],
      reviewNote: 'Synthetic unresolved case.',
      reviewer: reviewer()
    };
    expect(() => validateReauditWorklist(worklist, acquisition)).not.toThrow();
  });

  it('rejects authoritative canonical data on a non-FINAL decision', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeThrough(worklist, 'B');
    const c = worklist.cases.find((item) => item.batch === 'B')!;
    c.decision = {
      disposition: 'UNRESOLVED',
      readingEvidence: [{ source: 'Synthetic', citation: 'Synthetic', locator: 'entry' }],
      reviewNote: 'Synthetic unresolved case.',
      reviewer: reviewer()
    };
    (c.decision as any).scholarlyCanonical = 'forbidden';
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_DECISION.*CONTAINS_UNEXPECTED_KEY:scholarlyCanonical/
    );
  });

  it('accepts actual ISO review dates from different batches', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeThrough(worklist, 'B');
    const a = worklist.cases.find((c) => c.batch === 'A')!;
    const b = worklist.cases.find((c) => c.batch === 'B')!;
    a.decision!.reviewer.reviewedAt = '2026-10-04';
    b.decision!.reviewer.reviewedAt = '2026-10-05';
    expect(() => validateReauditWorklist(worklist, acquisition)).not.toThrow();
  });

  it('rejects impossible or malformed reviewer dates', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeThrough(worklist, 'A');
    const c = worklist.cases.find((item) => item.batch === 'A')!;
    c.decision!.reviewer.reviewedAt = '2026-02-30';
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_DECISION_REVIEW_DATE_INVALID/
    );
  });

  it('rejects duplicate case IDs', () => {
    const { worklist, acquisition } = createBlankFixture();
    worklist.cases[1].id = worklist.cases[0].id;
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(/WORKLIST_DUPLICATE_CASE_ID/);
  });

  it('rejects acquisition alignment drift', () => {
    const { worklist, acquisition } = createBlankFixture();
    worklist.cases[0].sourceText = 'tampered';
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(/WORKLIST_SOURCETEXT_MISMATCH/);
  });

  it('rejects root and case contamination', () => {
    const first = createBlankFixture();
    (first.worklist as any).historicalCanonicals = {};
    expect(() => validateReauditWorklist(first.worklist, first.acquisition)).toThrow(
      /WORKLIST_DOCUMENT_CONTAINS_UNEXPECTED_KEY/
    );
    const second = createBlankFixture();
    (second.worklist.cases[0] as any).priorCanonical = 'anchor';
    expect(() => validateReauditWorklist(second.worklist, second.acquisition)).toThrow(
      /WORKLIST_CASE.*CONTAINS_UNEXPECTED_KEY/
    );
  });

  it('rejects engine evaluation and premature human sign-off', () => {
    const first = createBlankFixture();
    first.worklist.metadata.engineEvaluationPerformed = true;
    expect(() => validateReauditWorklist(first.worklist, first.acquisition)).toThrow(
      /WORKLIST_ENGINE_EVALUATION_MUST_BE_FALSE/
    );
    const second = createBlankFixture();
    second.worklist.metadata.humanSignoff = { approved: true };
    expect(() => validateReauditWorklist(second.worklist, second.acquisition)).toThrow(
      /WORKLIST_HUMAN_SIGNOFF_MUST_BE_NULL/
    );
  });

  it('rejects Persian/Arabic script in authoritative Latin outputs', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeThrough(worklist, 'A');
    const d = worklist.cases.find((c) => c.batch === 'A')!.decision as any;
    d.scholarlyCanonical = 'تست';
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /SCHOLARLY_CANONICAL_CONTAINS_ARABIC_SCRIPT/
    );
  });

  it('requires reading and rendering evidence for FINAL decisions', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeThrough(worklist, 'A');
    const d = worklist.cases.find((c) => c.batch === 'A')!.decision as any;
    d.renderingEvidence = [];
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /RENDERING_EVIDENCE_MUST_BE_NONEMPTY/
    );
  });

  it('rejects summary drift from the sequential completion state', () => {
    const { worklist, acquisition } = createBlankFixture();
    completeThrough(worklist, 'B');
    worklist.summary.pending = 61;
    expect(() => validateReauditWorklist(worklist, acquisition)).toThrow(
      /WORKLIST_SUMMARY_PENDING_MISMATCH/
    );
  });

  it('keeps expected batch counts stable', () => {
    expect(EXPECTED_BATCH_COUNTS).toEqual({ A: 25, B: 23, C: 36, D: 12, E: 12 });
  });

  it('contains no transliteration engine execution path', () => {
    const source = fs.readFileSync(path.join(__dirname, 'reauditWorklist.ts'), 'utf8');
    expect(source).not.toMatch(/import.*transliterate/);
    expect(source).not.toMatch(/transliterate\s*\(/);
    expect(source).not.toMatch(/from\s+['\"].*domain\/engine['\"]/);
  });
});
