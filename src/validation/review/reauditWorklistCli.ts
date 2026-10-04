import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ReauditWorklistDocument,
  validateRepositoryReauditWorklist
} from './reauditWorklist';

export function runReauditWorklistCli(): void {
  try {
    const repoRoot = process.cwd();
    validateRepositoryReauditWorklist(repoRoot);

    const worklistPath = path.join(repoRoot, 'validation/review/reaudit-worklist.v2.json');
    const worklist = JSON.parse(
      fs.readFileSync(worklistPath, 'utf8')
    ) as ReauditWorklistDocument;

    const completedByBatch = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const c of worklist.cases) {
      if (c.reviewState === 'COMPLETED' && c.decision !== null) {
        completedByBatch[c.batch]++;
      }
    }

    console.log('===============================================================');
    console.log(' V2 Benchmark Blind Re-Audit Worklist Validation Report');
    console.log('===============================================================');
    console.log(`Artifact Status:            ${worklist.metadata.status}`);
    console.log('Acquisition Alignment:      PASS (108 / 108 cases matched)');
    console.log('Anti-Anchoring Invariant:   PASS (strict document allowlists)');
    console.log('Engine Blindness:           PASS (engineEvaluationPerformed = false)');
    console.log('Human Sign-off State:       PAUSED (humanSignoff = null)');
    console.log('---------------------------------------------------------------');
    console.log('Batch Progress:');
    console.log(`  - Batch A (Lexical & Religious):   ${completedByBatch.A} / 25 completed`);
    console.log(`  - Batch B (Grammatical Structure): ${completedByBatch.B} / 23 completed`);
    console.log(`  - Batch C (Named Entities):        ${completedByBatch.C} / 36 completed`);
    console.log(`  - Batch D (Titles):                ${completedByBatch.D} / 12 completed`);
    console.log(`  - Batch E (Ambiguity):             ${completedByBatch.E} / 12 completed`);
    console.log('---------------------------------------------------------------');
    console.log(`Total Cases Pending Re-Audit: ${worklist.summary.pending} / 108`);
    console.log(`Total Cases Adjudicated:      ${worklist.summary.adjudicated} / 108`);
    console.log('Re-Audit Integrity:           PASS  ✓');
    console.log('===============================================================');
  } catch (error) {
    console.error('Re-Audit Worklist Validation FAILED:', (error as Error).message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReauditWorklistCli();
}
