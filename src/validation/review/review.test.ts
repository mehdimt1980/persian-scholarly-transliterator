import { describe, expect, it } from 'vitest';
import {
  validateAcquisitionAlignment,
  validateConsolidatedAmendmentLedger,
  validateEffectiveAdjudication
} from './cli';

const REVIEW_IDS = [
  'cand-amb-001',
  'cand-amb-003',
  'cand-amb-007',
  'cand-amb-009',
  'cand-amb-011'
] as const;

function makeAdjudication() {
  const finalCases = Array.from({ length: 103 }, (_, index) => ({
    id: `final-${index + 1}`,
    sourceText: `متن ${index + 1}`,
    category: 'TERM',
    disposition: 'FINAL' as const,
    canonical: `canonical-${index + 1}`
  }));

  const reviewCases = REVIEW_IDS.map((id, index) => ({
    id,
    sourceText: `مبهم ${index + 1}`,
    category: 'AMBIGUITY',
    disposition: 'REVIEW_REQUIRED' as const,
    allowedCanonicals: [`reading-${index + 1}-a`, `reading-${index + 1}-b`]
  }));

  return {
    metadata: {
      version: '1.0.2-draft',
      status: 'EXPERT_ADJUDICATED_PENDING_HUMAN_SIGNOFF',
      humanSignoff: null,
      engineEvaluationPerformed: false
    },
    summary: {},
    cases: [...finalCases, ...reviewCases]
  };
}

function makeAcquisition(adjudication: ReturnType<typeof makeAdjudication>) {
  return adjudication.cases.map((item) => ({
    id: item.id,
    sourceText: item.sourceText,
    category: item.category
  }));
}

describe('Phase 4.6B adjudication integrity', () => {
  it('accepts the frozen 103 FINAL / 5 REVIEW_REQUIRED shape without engine evaluation', () => {
    const adjudication = makeAdjudication();
    expect(() => validateEffectiveAdjudication(adjudication)).not.toThrow();
    expect(() => validateAcquisitionAlignment(adjudication, makeAcquisition(adjudication))).not.toThrow();
  });

  it('fails closed when sourceText drifts from the frozen acquisition corpus', () => {
    const adjudication = makeAdjudication();
    const acquisition = makeAcquisition(adjudication);
    acquisition[0] = { ...acquisition[0], sourceText: 'متن متفاوت' };

    expect(() => validateAcquisitionAlignment(adjudication, acquisition)).toThrow(
      'ADJUDICATION_SOURCE_TEXT_DRIFT:final-1'
    );
  });

  it('fails closed when category drifts from the frozen acquisition corpus', () => {
    const adjudication = makeAdjudication();
    const acquisition = makeAcquisition(adjudication);
    acquisition[0] = { ...acquisition[0], category: 'PLACE' };

    expect(() => validateAcquisitionAlignment(adjudication, acquisition)).toThrow(
      'ADJUDICATION_CATEGORY_DRIFT:final-1:PLACE:TERM'
    );
  });

  it('requires historical corrections to be present in the consolidated artifact', () => {
    const adjudication = makeAdjudication();
    adjudication.cases[0].canonical = 'corrected';
    const amendments = {
      metadata: {
        status: 'CONSOLIDATED',
        consolidatedIntoVersion: '1.0.2-draft',
        engineEvaluationPerformed: false
      },
      corrections: [
        {
          id: 'final-1',
          field: 'canonical',
          from: 'canonical-1',
          to: 'corrected'
        }
      ]
    };

    expect(() => validateConsolidatedAmendmentLedger(adjudication, amendments)).not.toThrow();

    adjudication.cases[0].canonical = 'canonical-1';
    expect(() => validateConsolidatedAmendmentLedger(adjudication, amendments)).toThrow(
      /ADJUDICATION_AMENDMENT_NOT_CONSOLIDATED/
    );
  });

  it('rejects premature human sign-off metadata', () => {
    const adjudication = makeAdjudication();
    adjudication.metadata.humanSignoff = { reviewer: 'someone' };

    expect(() => validateEffectiveAdjudication(adjudication)).toThrow(
      'ADJUDICATION_PREMATURE_HUMAN_SIGNOFF'
    );
  });

  it('rejects REVIEW_REQUIRED without at least two recorded alternatives', () => {
    const adjudication = makeAdjudication();
    const reviewCase = adjudication.cases.find((item) => item.id === 'cand-amb-001');
    if (!reviewCase) throw new Error('test fixture missing review case');
    reviewCase.allowedCanonicals = ['only-one'];

    expect(() => validateEffectiveAdjudication(adjudication)).toThrow(
      'ADJUDICATION_REVIEW_REQUIRED_WITHOUT_ALTERNATIVES:cand-amb-001'
    );
  });

  it('rejects an amendment ledger that claims consolidation into another version', () => {
    const adjudication = makeAdjudication();
    const amendments = {
      metadata: {
        status: 'CONSOLIDATED',
        consolidatedIntoVersion: 'different-version',
        engineEvaluationPerformed: false
      },
      corrections: []
    };

    expect(() => validateConsolidatedAmendmentLedger(adjudication, amendments)).toThrow(
      /ADJUDICATION_AMENDMENT_VERSION_MISMATCH/
    );
  });
});
