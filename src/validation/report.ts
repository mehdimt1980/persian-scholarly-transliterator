import {
  CaseEvaluationResult,
  CorpusMetadata,
  ReleaseGateResult,
  ValidationMetrics
} from './types';

export function generateTextReport(
  metadata: CorpusMetadata,
  results: CaseEvaluationResult[],
  metrics: ValidationMetrics,
  gateResult: ReleaseGateResult
): string {
  const lines: string[] = [];

  lines.push('===============================================================');
  lines.push(` Scholarly Corpus Validation — ${metadata.id} (${metadata.version})`);
  lines.push('===============================================================');
  lines.push(`Description: ${metadata.description}`);
  if (metadata.reviewer) {
    lines.push(`Reviewer:    ${metadata.reviewer}`);
  }
  if (metadata.reviewedAt) {
    lines.push(`Reviewed At: ${metadata.reviewedAt}`);
  }
  lines.push('---------------------------------------------------------------');
  lines.push(`Total Cases:              ${metrics.total}`);
  lines.push('');
  lines.push(`  Correct Authoritative:  ${metrics.correctAuthoritative}`);
  lines.push(`  Correct Review-Required:${metrics.correctReviewRequired}`);
  lines.push(`  Correct Unresolved:     ${metrics.correctUnresolved}`);
  lines.push(`  Over-Blocked (Coverage):${metrics.overBlocked}`);
  lines.push('');
  lines.push(`  FALSE AUTHORITATIVE:    ${metrics.falseAuthoritative}  ${metrics.falseAuthoritative === 0 ? '✓' : '✗ [CRITICAL]'}`);
  lines.push(`  UNDER-BLOCKED:          ${metrics.underBlocked}  ${metrics.underBlocked === 0 ? '✓' : '✗ [CRITICAL]'}`);
  lines.push(`  Issue Type Mismatch:    ${metrics.issueTypeMismatch}`);
  lines.push(`  Invalid Gold Cases:     ${metrics.invalidGoldCases}`);
  lines.push('---------------------------------------------------------------');
  lines.push(`Safe Behavior:            ${metrics.safeBehaviorCount} / ${metrics.total} (${(metrics.safeBehaviorRate * 100).toFixed(1)}%)`);
  if (metrics.authoritativeCases > 0 && metrics.authoritativeExactMatchRate !== null) {
    lines.push(
      `Authoritative Match Rate: ${metrics.correctAuthoritative} / ${metrics.authoritativeCases} (${(metrics.authoritativeExactMatchRate * 100).toFixed(1)}%)`
    );
  }
  lines.push('---------------------------------------------------------------');
  lines.push(`Release Gate Status:      ${gateResult.passed ? 'PASS' : 'FAIL'} (${gateResult.readiness})`);
  if (gateResult.violations.length > 0) {
    lines.push('Violations:');
    for (const v of gateResult.violations) {
      lines.push(`  - ${v}`);
    }
  }
  lines.push('---------------------------------------------------------------');

  // Breakdown by category
  lines.push('Breakdown by Category:');
  for (const [cat, m] of Object.entries(metrics.byCategory)) {
    const matchStr =
      m.authoritativeCases > 0 && m.authoritativeExactMatchRate !== null
        ? `${(m.authoritativeExactMatchRate * 100).toFixed(0)}% auth match`
        : 'N/A';
    lines.push(
      `  - ${cat.padEnd(16)} total: ${m.total.toString().padStart(2)} | auth: ${m.correctAuthoritative} | rev: ${m.correctReviewRequired} | unres: ${m.correctUnresolved} | over: ${m.overBlocked} | FALSE: ${m.falseAuthoritative} | UNDER: ${m.underBlocked} (${matchStr})`
    );
  }
  lines.push('---------------------------------------------------------------');

  // Failures / Non-safe / Critical cases detail
  const issues = results.filter(
    (r) =>
      r.classification === 'FALSE_AUTHORITATIVE' ||
      r.classification === 'UNDER_BLOCKED' ||
      r.classification === 'OVER_BLOCKED' ||
      r.classification === 'ISSUE_TYPE_MISMATCH' ||
      r.classification === 'INVALID_GOLD_CASE'
  );

  if (issues.length > 0) {
    lines.push('Detailed Case Diagnostics:');
    for (const issue of issues) {
      lines.push(`  [${issue.classification}] Case ID: ${issue.caseId}`);
      lines.push(`    Category:     ${issue.category} | Profile: ${issue.profile}`);
      lines.push(`    Input:        "${issue.input}"`);
      lines.push(`    Expected:     ${issue.expectedDisposition} -> [${issue.expectedCanonicals.join(', ')}]`);
      lines.push(`    Actual:       status=${issue.actualStatus}, copyable=${issue.actualCopyable}, output="${issue.actualOutput}"`);
      lines.push(`    Actual Issues:[${issue.actualReviewIssueTypes.join(', ')}]`);
      if (issue.reasons.length > 0) {
        lines.push(`    Reasons:      ${issue.reasons.join(' | ')}`);
      }
      lines.push(`    Provenance:   ${issue.provenance.kind}: ${issue.provenance.citation}${issue.provenance.locator ? ` (${issue.provenance.locator})` : ''}`);
      lines.push('');
    }
  }

  lines.push('===============================================================');

  return lines.join('\n');
}

export function generateJsonReport(
  metadata: CorpusMetadata,
  results: CaseEvaluationResult[],
  metrics: ValidationMetrics,
  gateResult: ReleaseGateResult
): object {
  return {
    metadata,
    metrics,
    gateResult,
    results
  };
}
