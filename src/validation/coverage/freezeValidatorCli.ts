/**
 * CLI for Phase 7F frozen corpus validation.
 *
 * Usage:
 *   npm run validate:phase7f-freeze
 */

import { validateCorpusFreeze } from './freezeValidator';

function main(): void {
  const result = validateCorpusFreeze();

  console.log('=== Phase 7F Frozen Corpus Integrity Gate ===');
  console.log(`Corpus Version:     ${result.corpusVersion}`);
  console.log(`Source:             ${result.source}`);
  console.log(`Selection Algo:     ${result.selectionAlgorithm}`);
  console.log(`Total Records:      ${result.totalRecords.toLocaleString()}`);
  console.log(`Diagnostic Split:   ${result.diagnosticCount.toLocaleString()} (80%)`);
  console.log(`Holdout Split:      ${result.lockedHoldoutCount.toLocaleString()} (20%)`);
  console.log(`Corpus SHA-256:     ${result.actualCorpusSha256}`);
  console.log(`Holdout SHA-256:    ${result.actualHoldoutSha256}`);

  if (!result.valid) {
    console.error('\n❌ FREEZE INTEGRITY VALIDATION FAILED:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log('\n✅ Phase 7F frozen coverage corpus is valid and immutable.');
}

if (require.main === module) {
  main();
}
