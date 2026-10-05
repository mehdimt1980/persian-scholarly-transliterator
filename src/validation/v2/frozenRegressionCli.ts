import { runPhase46CFrozenBaseline } from './phase46CBaseline';

function main(): void {
  const report = runPhase46CFrozenBaseline();
  const c = report.summary.classifications;
  const failures: string[] = [];

  if (report.summary.total !== 108) failures.push(`total=${report.summary.total}`);
  if (report.summary.authoritativeCases !== 103) {
    failures.push(`authoritativeCases=${report.summary.authoritativeCases}`);
  }
  if (report.summary.reviewRequiredCases !== 5) {
    failures.push(`reviewRequiredCases=${report.summary.reviewRequiredCases}`);
  }
  if (c.CORRECT_AUTHORITATIVE !== 103) {
    failures.push(`CORRECT_AUTHORITATIVE=${c.CORRECT_AUTHORITATIVE}`);
  }
  if (c.CORRECT_REVIEW_REQUIRED !== 5) {
    failures.push(`CORRECT_REVIEW_REQUIRED=${c.CORRECT_REVIEW_REQUIRED}`);
  }

  const mustBeZero = [
    'FALSE_AUTHORITATIVE',
    'CORRECT_UNRESOLVED',
    'OVER_BLOCKED',
    'UNDER_BLOCKED',
    'ISSUE_TYPE_MISMATCH',
    'INVALID_GOLD_CASE'
  ] as const;
  for (const key of mustBeZero) {
    if (c[key] !== 0) failures.push(`${key}=${c[key]}`);
  }

  if (report.summary.authoritativeExactMatchRate !== 1) {
    failures.push(`authoritativeExactMatchRate=${report.summary.authoritativeExactMatchRate}`);
  }
  if (report.summary.safeBehaviorRate !== 1) {
    failures.push(`safeBehaviorRate=${report.summary.safeBehaviorRate}`);
  }
  if (
    report.summary.canonicalMismatchCount !== 0 ||
    report.summary.renderingMismatchCount !== 0 ||
    report.summary.bothCanonicalAndRenderingMismatchCount !== 0
  ) {
    failures.push(
      `mismatches=${report.summary.canonicalMismatchCount}/${report.summary.renderingMismatchCount}/${report.summary.bothCanonicalAndRenderingMismatchCount}`
    );
  }

  if (failures.length > 0) {
    throw new Error(`FROZEN_V2_REGRESSION_FAILED:${failures.join(',')}`);
  }

  console.log(
    'Frozen V2 regression PASS: 103/103 authoritative exact matches; ' +
      '5/5 review-required cases correctly blocked; FALSE_AUTHORITATIVE=0; UNDER_BLOCKED=0.'
  );
}

main();
