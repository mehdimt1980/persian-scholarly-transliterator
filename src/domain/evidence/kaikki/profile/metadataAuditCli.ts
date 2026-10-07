#!/usr/bin/env node
/**
 * CLI Entrypoint for Phase 7E Metadata Observability Audit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { MetadataObservabilityAuditor } from './audit';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let inputFilePath = 'artifacts/phase7d/kaikki.org-dictionary-Persian.jsonl';
  let outputDir = 'artifacts/phase7e';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      inputFilePath = args[i + 1];
      i++;
    } else if (args[i] === '--output-dir' && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    }
  }

  const auditor = new MetadataObservabilityAuditor();
  console.log('====================================================================');
  console.log(' Phase 7E: Metadata Observability Audit');
  console.log('====================================================================');
  console.log(`Input File: ${inputFilePath}`);

  const audit = await auditor.runAudit(inputFilePath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outPath = path.join(outputDir, 'profile-metadata-audit.json');
  fs.writeFileSync(outPath, JSON.stringify(audit, null, 2), 'utf8');

  console.log('\n--- Observability Audit Summary ---');
  console.log(`Total Persian Records:                 ${audit.totalPersianRecords.toLocaleString()}`);
  console.log(`Total Forms Count:                     ${audit.totalFormsCount.toLocaleString()}`);
  console.log(`Total Romanization Observations:       ${audit.totalRomanizationObservations.toLocaleString()}`);
  console.log(`Records with 1 Romanization:           ${audit.multiRomanizationCohort.recordsWith1Romanization.toLocaleString()}`);
  console.log(`Records with 2 Romanizations:          ${audit.multiRomanizationCohort.recordsWith2Romanizations.toLocaleString()}`);
  console.log(`Records with 3+ Romanizations:         ${audit.multiRomanizationCohort.recordsWith3PlusRomanizations.toLocaleString()}`);
  console.log(`Total Multi-Romanization Records:      ${audit.multiRomanizationCohort.totalMultiRomanizationRecords.toLocaleString()}`);
  console.log(`Paired Discriminating Candidates:      ${audit.multiRomanizationCohort.pairedDiscriminatingCandidates.toLocaleString()}`);
  console.log(`Records with Sounds:                   ${audit.recordsWithSounds.toLocaleString()}`);
  console.log(`Total Sound Blocks:                    ${audit.totalSoundBlocks.toLocaleString()}`);
  console.log(`Records with Head Templates:           ${audit.recordsWithHeadTemplates.toLocaleString()}`);
  console.log(`Output written to:                     ${outPath}`);
  console.log('====================================================================');
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => {
    console.error('Metadata Audit Error:', err);
    process.exit(1);
  });
}
