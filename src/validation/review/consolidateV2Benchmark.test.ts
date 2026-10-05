import { describe, expect, it } from 'vitest';
import { validateSingleValidationCorpusV2 } from '../v2/schema';
import {
  EXPECTED_REVIEW_REQUIRED_IDS,
  buildConsolidatedV2Benchmark,
  loadReauditWorklist
} from './consolidateV2Benchmark';

describe('Phase 4.6B consolidated V2 benchmark', () => {
  it('builds exactly 108 cases with the frozen pre-signoff disposition counts', () => {
    const corpus = buildConsolidatedV2Benchmark(loadReauditWorklist());
    const counts = corpus.cases.reduce(
      (summary, testCase) => {
        summary[testCase.expected.disposition] += 1;
        return summary;
      },
      { FINAL: 0, REVIEW_REQUIRED: 0, UNRESOLVED: 0 }
    );

    expect(corpus.schemaVersion).toBe(2);
    expect(corpus.cases).toHaveLength(108);
    expect(counts).toEqual({ FINAL: 103, REVIEW_REQUIRED: 5, UNRESOLVED: 0 });
  });

  it('uses truthful external-benchmark and AI-specialist-pending-human metadata', () => {
    const corpus = buildConsolidatedV2Benchmark(loadReauditWorklist());

    expect(corpus.metadata.tier).toBe('EXTERNAL_BENCHMARK');
    expect(corpus.metadata.reviewStatus).toBe('AI_SPECIALIST_REVIEWED_PENDING_HUMAN');
    expect(corpus.metadata.reviewer).toContain('AI_SPECIALIST');
    expect(corpus.metadata.reviewNote).toContain('humanSignoff=null');
    expect(corpus.metadata.reviewNote).toContain('gold is not frozen');
    expect(corpus.metadata.reviewNote).toContain('engineEvaluationPerformed=false');
  });

  it('preserves exactly the five genuinely ambiguous cases as non-authoritative', () => {
    const corpus = buildConsolidatedV2Benchmark(loadReauditWorklist());
    const reviewCases = corpus.cases.filter(
      (testCase) => testCase.expected.disposition === 'REVIEW_REQUIRED'
    );

    expect(reviewCases.map((testCase) => testCase.id).sort()).toEqual(
      [...EXPECTED_REVIEW_REQUIRED_IDS].sort()
    );

    for (const testCase of reviewCases) {
      expect(testCase.expected.scholarlyCanonical).toBeUndefined();
      expect(testCase.expected.allowedScholarlyCanonicals).toBeUndefined();
      expect(testCase.expected.renderedOutput).toBeUndefined();
      expect(testCase.expected.allowedRenderedOutputs).toBeUndefined();
      expect(testCase.expected.requiredIssueTypes).toEqual(['LEXICAL_AMBIGUITY']);
    }
  });

  it('copies FINAL canonical and rendered dimensions independently from the worklist', () => {
    const worklist = loadReauditWorklist();
    const corpus = buildConsolidatedV2Benchmark(worklist);
    const worklistCase = worklist.cases.find((testCase) => testCase.id === 'cand-pers-004');
    const corpusCase = corpus.cases.find((testCase) => testCase.id === 'cand-pers-004');

    expect(worklistCase?.decision?.disposition).toBe('FINAL');
    expect(corpusCase?.expected.disposition).toBe('FINAL');
    if (worklistCase?.decision?.disposition !== 'FINAL' || !corpusCase) {
      throw new Error('Expected cand-pers-004 to be FINAL in both artifacts');
    }

    expect(corpusCase.expected.scholarlyCanonical).toBe(
      worklistCase.decision.scholarlyCanonical
    );
    expect(corpusCase.expected.renderedOutput).toBe(worklistCase.decision.renderedOutput);
    expect(corpusCase.expected.scholarlyCanonical).not.toBe(corpusCase.expected.renderedOutput);
  });

  it('rejects AI-specialist review status when reviewer provenance is not explicit', () => {
    const corpus = buildConsolidatedV2Benchmark(loadReauditWorklist());
    const invalid = {
      ...corpus,
      metadata: {
        ...corpus.metadata,
        reviewer: 'OpenAI GPT-5.6 Sol'
      }
    };

    expect(() => validateSingleValidationCorpusV2(invalid)).toThrow(
      /AI_SPECIALIST provenance/
    );
  });
});
