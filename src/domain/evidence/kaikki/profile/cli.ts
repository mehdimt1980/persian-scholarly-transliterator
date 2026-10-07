/**
 * CLI runner for Phase 7E Profile Recovery Scale Experiment.
 */

import { ProfileRecoveryExperimentRunner } from './runner';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let inputFilePath = 'artifacts/phase7d/kaikki.org-dictionary-Persian.jsonl';
  let outputDir = 'artifacts/phase7e';
  let reportPath = 'docs/experiments/PHASE_7E_PROFILE_RECOVERY.md';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      inputFilePath = args[i + 1];
      i++;
    } else if (args[i] === '--output-dir' && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    } else if (args[i] === '--report' && args[i + 1]) {
      reportPath = args[i + 1];
      i++;
    }
  }

  const runner = new ProfileRecoveryExperimentRunner();
  console.log(`[Phase 7E] Running Profile Recovery Experiment on ${inputFilePath}...`);
  const summary = await runner.runExperiment({
    inputFilePath,
    outputDir,
    reportPath
  });

  console.log('\n================ PHASE 7E RECOVERY SUMMARY ================');
  console.log(`Total Records:          ${summary.totalPersianRecords}`);
  console.log(`Total Observations:     ${summary.totalObservations}`);
  console.log(`Baseline Unclassified:  ${summary.observationRecovery.baselineUnclassified}`);
  console.log(`Recovered Total:        ${summary.observationRecovery.recoveredTotal} (${summary.observationRecovery.recoveryYieldRate.toFixed(2)}%)`);
  console.log(`  - Iranian:            ${summary.observationRecovery.recoveredIranian}`);
  console.log(`  - Classical/Dari:     ${summary.observationRecovery.recoveredClassicalDari}`);
  console.log(`Still Unclassified:     ${summary.observationRecovery.stillUnclassified}`);
  console.log(`Fallback Eligible:      ${summary.fallbackEligibility.afterEligible} (novel: ${summary.fallbackEligibility.novelEligibleForms})`);
  console.log(`Reviewed Matches:       ${summary.fallbackEligibility.exactReviewedMatches} (divergences: ${summary.fallbackEligibility.reviewedDivergences}, rate: ${summary.fallbackEligibility.divergenceRate.toFixed(2)}%)`);
  console.log(`Experimental Pack:      ${summary.experimentalPack.fullEntryCount} entries, ${Math.round(summary.experimentalPack.fullGzipBytes / 1024)} KB gzip`);
  console.log(`Browser Feasibility:    ${summary.experimentalPack.browserPackFeasibility}`);
  console.log('===========================================================\n');
}

main().catch((err) => {
  console.error('[Phase 7E CLI Error]', err);
  process.exit(1);
});
