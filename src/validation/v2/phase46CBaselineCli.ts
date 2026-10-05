import { runPhase46CFrozenBaseline } from './phase46CBaseline';

function main(): void {
  const report = runPhase46CFrozenBaseline();

  console.log('Phase 4.6C frozen baseline');
  console.log(`Frozen benchmark Git blob: ${report.sourceBenchmarkGitBlobSha1}`);
  console.log(`Promoted gold version: ${report.promotedGoldVersion}`);
  console.log(JSON.stringify(report.summary, null, 2));

  const nonCorrect = report.results.filter(
    (result) =>
      result.classification !== 'CORRECT_AUTHORITATIVE' &&
      result.classification !== 'CORRECT_REVIEW_REQUIRED' &&
      result.classification !== 'CORRECT_UNRESOLVED'
  );

  for (const result of nonCorrect) {
    console.log(
      `[${result.classification}] ${result.caseId} | ${result.input} | ` +
        `canonical=${result.actualScholarlyCanonical ?? 'null'} | rendered=${result.actualRenderedOutput}`
    );
    for (const reason of result.reasons) console.log(`  - ${reason}`);
  }

  console.log(`PHASE46C_BASELINE_SUMMARY_JSON=${JSON.stringify(report.summary)}`);
}

main();
