import { describe, expect, it } from 'vitest';
import {
  NEGATIVE_PORTABILITY_CASES,
  POSITIVE_PORTABILITY_CASES,
  runReleasePortabilityGate
} from './releasePortabilityGate';

describe('release portability / anti-overreach gate', () => {
  it('keeps the portability set outside the frozen authority and passes all cases', () => {
    const report = runReleasePortabilityGate();

    expect(report.authorityOverlapCount).toBe(0);
    expect(report.positivePassed).toBe(POSITIVE_PORTABILITY_CASES.length);
    expect(report.negativePassed).toBe(NEGATIVE_PORTABILITY_CASES.length);
    expect(report.total).toBe(
      POSITIVE_PORTABILITY_CASES.length + NEGATIVE_PORTABILITY_CASES.length
    );
  });

  it('contains both compositional generalization checks and fail-closed checks', () => {
    expect(POSITIVE_PORTABILITY_CASES.length).toBeGreaterThanOrEqual(8);
    expect(NEGATIVE_PORTABILITY_CASES.length).toBeGreaterThanOrEqual(5);
    expect(POSITIVE_PORTABILITY_CASES.some((item) => item.requireMorphology)).toBe(true);
    expect(POSITIVE_PORTABILITY_CASES.some((item) => item.requireRelations)).toBe(true);
    expect(NEGATIVE_PORTABILITY_CASES.some((item) => item.id.includes('near-miss'))).toBe(true);
    expect(NEGATIVE_PORTABILITY_CASES.some((item) => item.id.includes('wrong-profile'))).toBe(true);
  });
});
