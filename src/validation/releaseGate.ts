import { ReleaseGateResult, ReleaseReadiness, ValidationMetrics } from './types';

export interface ReleaseGateOptions {
  isPilot?: boolean;
}

export function evaluateReleaseGates(
  metrics: ValidationMetrics,
  options: ReleaseGateOptions = {}
): ReleaseGateResult {
  const violations: string[] = [];

  if (metrics.falseAuthoritative > 0) {
    violations.push(
      `CRITICAL SAFETY FAILURE: Found ${metrics.falseAuthoritative} FALSE_AUTHORITATIVE case(s) where engine produced incorrect copyable transliteration.`
    );
  }

  if (metrics.underBlocked > 0) {
    violations.push(
      `CRITICAL SAFETY FAILURE: Found ${metrics.underBlocked} UNDER_BLOCKED case(s) where unauthoritative/review-requiring input was made copyable.`
    );
  }

  if (metrics.invalidGoldCases > 0) {
    violations.push(
      `DATA INTEGRITY FAILURE: Found ${metrics.invalidGoldCases} INVALID_GOLD_CASE definition(s).`
    );
  }

  const passed = violations.length === 0;

  let readiness: ReleaseReadiness;
  if (!passed) {
    readiness = 'BLOCKED';
  } else if (options.isPilot) {
    readiness = 'PILOT_PASS';
  } else {
    readiness = 'RC_READY';
  }

  return {
    readiness,
    passed,
    violations,
    metrics
  };
}
