import { describe, expect, it } from 'vitest';
import {
  assertFrozenBenchmarkIntegrity,
  computeGitBlobSha1,
  loadGoldFreeze,
  loadHumanSignoff,
  validateHumanSignoff,
  BENCHMARK_PATH
} from './goldFreezeV2';

describe('Phase 4.6B human sign-off and gold freeze', () => {
  it('records explicit human APPROVE while preserving AI specialist case provenance', () => {
    const signoff = loadHumanSignoff();
    expect(signoff.decision).toBe('APPROVE');
    expect(signoff.reviewer.githubLogin).toBe('mehdimt1980');
    expect(signoff.scope.caseByCaseReAdjudicationClaimed).toBe(false);
    expect(signoff.caseLevelPrimaryReviewer).toContain('AI_SPECIALIST');
  });

  it('rejects a false claim of human case-by-case re-adjudication', () => {
    const signoff = loadHumanSignoff();
    const invalid = {
      ...signoff,
      scope: {
        ...signoff.scope,
        caseByCaseReAdjudicationClaimed: true
      }
    };
    expect(() => validateHumanSignoff(invalid)).toThrow(/CASE_BY_CASE_CLAIM_FORBIDDEN/u);
  });

  it('binds the frozen promotion to the exact reviewed benchmark Git blob', () => {
    const freeze = assertFrozenBenchmarkIntegrity();
    expect(freeze.sourceBenchmarkGitBlobSha1).toBe(computeGitBlobSha1(BENCHMARK_PATH));
    expect(freeze.promotedGoldVersion).toBe('2.0.0');
    expect(freeze.promotionStatus).toBe('HUMAN_APPROVED_FROZEN');
    expect(freeze.engineEvaluationPerformedAtFreeze).toBe(false);
    expect(freeze.phase46CAuthorized).toBe(true);
  });

  it('keeps the exact five review-required IDs frozen', () => {
    const freeze = loadGoldFreeze();
    expect([...freeze.reviewRequiredIds].sort()).toEqual([
      'cand-amb-001',
      'cand-amb-003',
      'cand-amb-007',
      'cand-amb-009',
      'cand-amb-011'
    ]);
  });
});
