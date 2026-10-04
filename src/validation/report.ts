import {
  BibliographyCaseEvaluationResult,
  CaseEvaluationResult,
  CombinedValidationMetrics,
  CorpusManifest,
  CorpusMetadata,
  ReleaseGateResult
} from './types';

export interface ReportSources {
  manifest?: CorpusManifest;
  singleMetadata?: CorpusMetadata;
  bibliographyMetadata?: CorpusMetadata;
}

export function generateTextReport(
  sources: ReportSources | CorpusMetadata,
  singleResults: CaseEvaluationResult[],
  metrics: CombinedValidationMetrics,
  gateResult: ReleaseGateResult,
  bibliographyResults: BibliographyCaseEvaluationResult[] = []
): string {
  const lines: string[] = [];

  const manifest: CorpusManifest | undefined =
    'id' in sources && !('singleMetadata' in sources)
      ? {
          id: (sources as CorpusMetadata).id,
          version: (sources as CorpusMetadata).version,
          description: (sources as CorpusMetadata).description,
          tier: (sources as CorpusMetadata).tier,
          reviewStatus: (sources as CorpusMetadata).reviewStatus,
          reviewer: (sources as CorpusMetadata).reviewer,
          reviewedAt: (sources as CorpusMetadata).reviewedAt,
          reviewNote: (sources as CorpusMetadata).reviewNote
        }
      : (sources as ReportSources).manifest;

  const singleMeta = 'singleMetadata' in sources ? (sources as ReportSources).singleMetadata : ('id' in sources ? (sources as CorpusMetadata) : undefined);
  const bibMeta = 'bibliographyMetadata' in sources ? (sources as ReportSources).bibliographyMetadata : undefined;

  const titleId = manifest?.id || singleMeta?.id || 'corpus';
  const version = manifest?.version || singleMeta?.version || 'v1';

  lines.push('===============================================================');
  lines.push(` Scholarly Corpus Validation — ${titleId} (${version})`);
  lines.push('===============================================================');
  if (manifest?.description) {
    lines.push(`Description:   ${manifest.description}`);
  }
  if (manifest?.tier) {
    lines.push(`Tier:          ${manifest.tier}`);
  }
  if (manifest?.reviewStatus) {
    lines.push(`Review Status: ${manifest.reviewStatus}`);
  }
  if (manifest?.reviewer) {
    lines.push(`Reviewer:      ${manifest.reviewer}`);
  }
  if (manifest?.reviewedAt) {
    lines.push(`Reviewed At:   ${manifest.reviewedAt}`);
  }

  lines.push('---------------------------------------------------------------');
  lines.push('Corpus Composition:');
  if (singleMeta) {
    lines.push(`  Single corpus:       ${singleMeta.id} / ${metrics.single.total} cases`);
  }
  if (bibMeta) {
    lines.push(`  Bibliography corpus: ${bibMeta.id} / ${metrics.bibliography.total} cases`);
  }
  lines.push(`  Combined Total:      ${metrics.total} cases`);

  lines.push('---------------------------------------------------------------');
  lines.push('Combined Safety Metrics:');
  lines.push(`  Total Evaluated:        ${metrics.total}`);
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
  if (metrics.single.authoritativeCases > 0 && metrics.single.authoritativeExactMatchRate !== null) {
    lines.push(
      `Single Auth Match Rate:   ${metrics.single.correctAuthoritative} / ${metrics.single.authoritativeCases} (${(metrics.single.authoritativeExactMatchRate * 100).toFixed(1)}%)`
    );
  }
  lines.push('---------------------------------------------------------------');
  lines.push(`Safety Gate:              ${gateResult.safetyPassed ? 'PASS' : 'FAIL'}`);
  lines.push(`Requested Target:         ${gateResult.context.releaseTarget}`);
  lines.push(`Target Satisfaction:      ${gateResult.targetSatisfied ? 'PASS' : 'FAIL'}`);
  lines.push(`Readiness State:          ${gateResult.readiness}`);
  if (gateResult.violations.length > 0) {
    lines.push('Safety Violations:');
    for (const v of gateResult.violations) {
      lines.push(`  - ${v}`);
    }
  }
  if (gateResult.blockers.length > 0 && !gateResult.targetSatisfied) {
    lines.push('Target Blockers:');
    for (const b of gateResult.blockers) {
      lines.push(`  - ${b}`);
    }
  }
  lines.push('---------------------------------------------------------------');

  // Breakdown by category (Single items only - no fabricated bibliography categories)
  lines.push('Single Cases Breakdown by Category:');
  for (const [cat, m] of Object.entries(metrics.single.byCategory)) {
    const matchStr =
      m.authoritativeCases > 0 && m.authoritativeExactMatchRate !== null
        ? `${(m.authoritativeExactMatchRate * 100).toFixed(0)}% auth match`
        : 'N/A';
    lines.push(
      `  - ${cat.padEnd(16)} total: ${m.total.toString().padStart(2)} | auth: ${m.correctAuthoritative} | rev: ${m.correctReviewRequired} | unres: ${m.correctUnresolved} | over: ${m.overBlocked} | FALSE: ${m.falseAuthoritative} | UNDER: ${m.underBlocked} (${matchStr})`
    );
  }

  // Bibliography breakdown if bibliography cases exist
  if (metrics.bibliography.total > 0) {
    lines.push('---------------------------------------------------------------');
    lines.push('Bibliography Records Summary:');
    lines.push(
      `  Total: ${metrics.bibliography.total} | Auth Ready: ${metrics.bibliography.correctAuthoritative} | Rev Req: ${metrics.bibliography.correctReviewRequired} | Unres: ${metrics.bibliography.correctUnresolved} | FALSE: ${metrics.bibliography.falseAuthoritative} | UNDER: ${metrics.bibliography.underBlocked}`
    );
  }

  lines.push('---------------------------------------------------------------');

  // Failures / Non-safe / Critical cases detail from Single items
  const singleIssues = singleResults.filter(
    (r) =>
      r.classification === 'FALSE_AUTHORITATIVE' ||
      r.classification === 'UNDER_BLOCKED' ||
      r.classification === 'OVER_BLOCKED' ||
      r.classification === 'ISSUE_TYPE_MISMATCH' ||
      r.classification === 'INVALID_GOLD_CASE'
  );

  const bibIssues = bibliographyResults.filter(
    (r) =>
      r.classification === 'FALSE_AUTHORITATIVE' ||
      r.classification === 'UNDER_BLOCKED' ||
      r.classification === 'OVER_BLOCKED' ||
      r.classification === 'ISSUE_TYPE_MISMATCH' ||
      r.classification === 'INVALID_GOLD_CASE'
  );

  if (singleIssues.length > 0 || bibIssues.length > 0) {
    lines.push('Detailed Case Diagnostics:');
    for (const issue of singleIssues) {
      lines.push(`  [${issue.classification}] Single Case ID: ${issue.caseId}`);
      lines.push(`    Category:     ${issue.category} | Profile: ${issue.profile}`);
      lines.push(`    Input:        "${issue.input}"`);
      lines.push(`    Expected:     ${issue.expectedDisposition} -> [${issue.expectedCanonicals.join(', ')}]`);
      lines.push(`    Actual:       status=${issue.actualStatus}, copyable=${issue.actualCopyable}, output="${issue.actualOutput}"`);
      lines.push(`    Actual Issues:[${issue.actualReviewIssueTypes.join(', ')}]`);
      if (issue.reasons.length > 0) {
        lines.push(`    Reasons:      ${issue.reasons.join(' | ')}`);
      }
      lines.push(`    Provenance:   ${issue.provenance.sources.map((s) => `${s.kind}: ${s.citation}${s.locator ? ` (${s.locator})` : ''}`).join('; ')}`);
      lines.push('');
    }
    for (const bIssue of bibIssues) {
      lines.push(`  [${bIssue.classification}] Bibliography Case ID: ${bIssue.caseId} (Record ID: ${bIssue.recordId})`);
      lines.push(`    Expected:     ${bIssue.expectedReadiness}`);
      lines.push(`    Actual:       ${bIssue.actualReadiness}`);
      if (bIssue.reasons.length > 0) {
        lines.push(`    Reasons:      ${bIssue.reasons.join(' | ')}`);
      }
      lines.push(`    Provenance:   ${bIssue.provenance.sources.map((s) => `${s.kind}: ${s.citation}${s.locator ? ` (${s.locator})` : ''}`).join('; ')}`);
      lines.push('');
    }
  }

  lines.push('===============================================================');

  return lines.join('\n');
}

export function generateJsonReport(
  sources: ReportSources | CorpusMetadata,
  singleResults: CaseEvaluationResult[],
  metrics: CombinedValidationMetrics,
  gateResult: ReleaseGateResult,
  bibliographyResults: BibliographyCaseEvaluationResult[] = []
): object {
  return {
    sources,
    metrics,
    gateResult,
    singleResults,
    bibliographyResults
  };
}
