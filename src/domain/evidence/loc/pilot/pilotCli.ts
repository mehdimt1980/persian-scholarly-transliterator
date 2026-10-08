/**
 * CLI Runner for Phase 7G Track B: Library of Congress Evidence Feasibility Pilot.
 *
 * Usage:
 *   npx tsx src/domain/evidence/loc/pilot/pilotCli.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { runLocFeasibilityPilot, formatLocFeasibilityMarkdownReport } from './pilotRunner';

export function runLocPilotCli(): void {
  console.log('[Phase 7G] Running Library of Congress Evidence Feasibility Pilot...');
  const report = runLocFeasibilityPilot();

  const mdOut = path.resolve(process.cwd(), 'docs', 'experiments', 'PHASE_7G_LOC_FEASIBILITY.md');
  fs.mkdirSync(path.dirname(mdOut), { recursive: true });
  const mdContent = formatLocFeasibilityMarkdownReport(report);
  fs.writeFileSync(mdOut, mdContent, 'utf8');

  console.log(`[Phase 7G] Saved LoC Feasibility Report to ${mdOut}`);
  console.log('[Phase 7G] LoC Pilot completed successfully.');
}

if (process.argv[1] && process.argv[1].endsWith('pilotCli.ts')) {
  try {
    runLocPilotCli();
    process.exit(0);
  } catch (err) {
    console.error('[Phase 7G] LoC Pilot failed:', err);
    process.exit(1);
  }
}
