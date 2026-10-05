import { describe, expect, it } from 'vitest';
import { runPhase46CFrozenBaseline } from './phase46CBaseline';

describe('Phase 4.6C frozen baseline runner', () => {
  it('evaluates exactly the frozen 108-case gold without changing gold semantics', () => {
    const report = runPhase46CFrozenBaseline();

    expect(report.artifactType).toBe('PHASE_4_6C_FROZEN_BASELINE');
    expect(report.promotedGoldVersion).toBe('2.0.0');
    expect(report.sourceBenchmarkGitBlobSha1).toBe(
      'be46b312e2cb82cc4ec0f95ed1c019f8f5e27162'
    );
    expect(report.engineEvaluationPerformed).toBe(true);
    expect(report.results).toHaveLength(108);
    expect(report.summary.total).toBe(108);
    expect(report.summary.authoritativeCases).toBe(103);
    expect(report.summary.reviewRequiredCases).toBe(5);
    expect(report.summary.classifications.INVALID_GOLD_CASE).toBe(0);

    const classified = Object.values(report.summary.classifications).reduce(
      (sum, count) => sum + count,
      0
    );
    expect(classified).toBe(108);
  });

  it('keeps baseline measurement observational rather than encoding target metrics', () => {
    const report = runPhase46CFrozenBaseline();

    expect(report.summary.authoritativeExactMatchRate).not.toBeUndefined();
    expect(report.summary.safeBehaviorRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.safeBehaviorRate).toBeLessThanOrEqual(1);
    expect(
      report.summary.falseAuthoritativeCaseIds.length +
        report.summary.underBlockedCaseIds.length +
        report.summary.overBlockedCaseIds.length +
        report.summary.issueTypeMismatchCaseIds.length
    ).toBeGreaterThanOrEqual(0);
  });
});
