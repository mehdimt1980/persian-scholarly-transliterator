import fs from 'node:fs';
import path from 'node:path';
import { extractEvidenceFromMarcRecord } from '../loc/extractor';
import { parseMarcXml } from '../loc/xmlParser';
import { LocClient } from '../loc/client';
import { processEvidenceAlignmentBatch } from '../alignment/batchOrchestrator';
import { LexicalEvidence } from '../types';
import { analyzeCandidateSchemeEvidence } from './aggregator';
import { auditIjmesRuntimePolicy } from './policyAudit';

function printHeader(): void {
  console.log('========================================================================');
  console.log(' Scheme-Aware Evidence Aggregation Pilot (Phase 5D)');
  console.log('========================================================================');
  console.log(' [!] STATUS: NON-AUTHORITATIVE SCHEME INTERPRETATION & HYPOTHESIS ANALYSIS');
  console.log('     External ALA-LC romanization is interpreted relative to IJMES target scheme.');
  console.log('     Candidate proposedCanonical remains strictly null.');
  console.log('     This tool does NOT mutate or write to the authoritative lexicon.');
  console.log('========================================================================\n');
}

async function main(): Promise<void> {
  printHeader();

  const args = process.argv.slice(2);
  let lccn = '2016404617';
  let fixturePath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lccn' && args[i + 1]) {
      lccn = args[i + 1];
      i++;
    } else if (args[i] === '--fixture' && args[i + 1]) {
      fixturePath = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage:');
      console.log('  npm run evidence:scheme:pilot -- [--fixture <path>] [--lccn <LCCN>]');
      console.log('Examples:');
      console.log('  npm run evidence:scheme:pilot -- --fixture src/domain/evidence/loc/fixtures/2016404617.marcxml.xml');
      console.log('  npm run evidence:scheme:pilot -- --lccn 2016404617');
      return;
    }
  }

  let rawXml: string;
  let sourceOrigin: string;

  if (fixturePath) {
    console.log(`[Source] Reading local fixture: ${fixturePath}`);
    rawXml = fs.readFileSync(path.resolve(fixturePath), 'utf8');
    sourceOrigin = `Fixture: ${fixturePath}`;
  } else {
    console.log(`[Source] Querying live Library of Congress SRU for LCCN: ${lccn}`);
    const client = new LocClient();
    const result = await client.fetchLccn(lccn);
    rawXml = result.payload;
    sourceOrigin = `LoC SRU (LCCN ${lccn})`;
  }

  const records = parseMarcXml(rawXml);
  console.log(`[Parser] Parsed ${records.length} MARC record(s) from ${sourceOrigin}.\n`);

  const allParentEvidence: LexicalEvidence[] = [];
  for (const rec of records) {
    const parentEvidenceList = extractEvidenceFromMarcRecord(rec, {
      now: () => new Date().toISOString()
    });
    allParentEvidence.push(...parentEvidenceList);
  }

  // Run Phase 5C batch alignment
  const batchResult = processEvidenceAlignmentBatch(allParentEvidence);

  console.log('========================================================================');
  console.log(' Phase 5D: Scheme Interpretation & Consensus Analysis');
  console.log('========================================================================\n');

  let directCount = 0;
  let deterministicCount = 0;
  let contextRequiredCount = 0;
  let unsupportedCount = 0;

  const parentMap = new Map(allParentEvidence.map((p) => [p.id, p]));

  for (let cIdx = 0; cIdx < batchResult.candidates.length; cIdx++) {
    const candidate = batchResult.candidates[cIdx];
    const supportingEvidence = batchResult.derivedEvidence.filter((e) =>
      candidate.evidenceIds.includes(e.id)
    );

    const schemeAnalysis = analyzeCandidateSchemeEvidence(candidate, supportingEvidence, {
      parentLookup: (id) => parentMap.get(id)
    });

    console.log(`------------------------------------------------------------------------`);
    console.log(`Candidate #${cIdx + 1}: "${candidate.persianForm}" (normalized: "${candidate.normalizedForm}")`);
    console.log(`  Candidate Status:      ${candidate.status}`);
    console.log(`  Proposed Canonical:    ${candidate.proposedCanonical === null ? 'null (UNCHANGED)' : candidate.proposedCanonical}`);
    console.log(`  Consensus Status:      ${schemeAnalysis.consensusStatus}`);
    console.log(`  Consensus Hypothesis:  ${schemeAnalysis.consensusTargetHypothesis ? `"${schemeAnalysis.consensusTargetHypothesis}" [IJMES hypothesis]` : 'null'}`);
    console.log(`  Authority:             NON-AUTHORITATIVE`);
    console.log();
    console.log(`  Supporting Observations (${schemeAnalysis.interpretations.length}):`);

    for (const interp of schemeAnalysis.interpretations) {
      if (interp.status === 'DIRECT_EQUIVALENT') directCount++;
      else if (interp.status === 'DETERMINISTIC_EQUIVALENT') deterministicCount++;
      else if (interp.status === 'CONTEXT_REQUIRED') contextRequiredCount++;
      else if (interp.status === 'UNSUPPORTED') unsupportedCount++;

      console.log(`    - Evidence ID:       ${interp.evidenceId}`);
      console.log(`      Observed:          "${interp.rawObservedRomanization}" [${interp.sourceScheme}]`);
      console.log(`      Interpretation:    ${interp.targetHypothesis ? `"${interp.targetHypothesis}" [IJMES hypothesis]` : 'null'}`);
      console.log(`      Status:            ${interp.status}`);
      if (interp.appliedRuleIds.length > 0) {
        console.log(`      Rules Applied:     ${interp.appliedRuleIds.join(', ')}`);
      }
      if (interp.blockers.length > 0) {
        console.log(`      Blockers:          ${interp.blockers.map((b) => `[${b.kind}] ${b.reason}`).join('; ')}`);
      }
      console.log();
    }
  }

  console.log('========================================================================');
  console.log(' Summary Statistics');
  console.log('========================================================================');
  console.log(`  Candidate Groups:                  ${batchResult.candidates.length}`);
  console.log(`  Total Interpreted Observations:    ${batchResult.derivedEvidence.length}`);
  console.log(`  DIRECT_EQUIVALENT:                 ${directCount}`);
  console.log(`  DETERMINISTIC_EQUIVALENT:          ${deterministicCount}`);
  console.log(`  CONTEXT_REQUIRED:                  ${contextRequiredCount}`);
  console.log(`  UNSUPPORTED:                       ${unsupportedCount}\n`);

  // Run policy audit
  console.log('========================================================================');
  console.log(' Read-Only IJMES Runtime Policy Audit');
  console.log('========================================================================');
  const policyReport = auditIjmesRuntimePolicy();
  console.log(`  Total Policy Rules Checked:        ${policyReport.totalChecked}`);
  console.log(`  Matches with Runtime Tables:       ${policyReport.matches}`);
  console.log(`  Mismatches:                        ${policyReport.mismatches}`);
  console.log(`  Audit Summary:                     ${policyReport.summary}\n`);

  console.log('========================================================================');
  console.log(' [✓] Scheme analysis complete. Zero modifications to authoritative lexicon.');
  console.log('========================================================================\n');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n[ERROR] ${err.message}\n`);
    process.exit(1);
  });
}
