/**
 * Pilot inspection CLI for Phase 5E Human Adjudication & Promotion.
 *
 * Core invariant:
 *   Inspection ONLY. Does not create decisions, prompt with default ACCEPT,
 *   mutate lexicon, or write review files automatically.
 */

import fs from 'node:fs';
import path from 'node:path';
import { extractEvidenceFromMarcRecord } from '../loc/extractor';
import { parseMarcXml } from '../loc/xmlParser';
import { LocClient } from '../loc/client';
import { processEvidenceAlignmentBatch } from '../alignment/batchOrchestrator';
import { LexicalEvidence } from '../types';
import { LexicalEvidenceRepository } from '../repository';
import { prepareCandidateReviewPacket } from './reviewPacket';
import { AdjudicationLedger } from './ledger';

function printHeader(): void {
  console.log('========================================================================');
  console.log(' Human Adjudication & Promotion Inspection Pilot (Phase 5E)');
  console.log('========================================================================');
  console.log(' [!] STATUS: READ-ONLY AUDIT & REVIEW-PACKET INSPECTION');
  console.log('     Scheme consensus carries ZERO automatic lexicon authority.');
  console.log('     Human decisions and promotions require explicit separate actions.');
  console.log('     This tool does NOT create decisions or mutate the authoritative lexicon.');
  console.log('========================================================================\n');
}

export async function runAdjudicationPilot(args: string[] = process.argv.slice(2)): Promise<void> {
  printHeader();

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
      console.log('  npm run evidence:adjudication:pilot -- [--fixture <path>] [--lccn <LCCN>]');
      console.log('Examples:');
      console.log('  npm run evidence:adjudication:pilot -- --fixture src/domain/evidence/loc/fixtures/2016404617.marcxml.xml');
      console.log('  npm run evidence:adjudication:pilot -- --lccn 2016404617');
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

  // Ingest into isolated LexicalEvidenceRepository
  const evidenceRepo = new LexicalEvidenceRepository({
    evidence: [...allParentEvidence, ...batchResult.derivedEvidence],
    candidates: batchResult.candidates
  });

  const ledger = new AdjudicationLedger();

  console.log('========================================================================');
  console.log(' Phase 5E: Review Packets & Authority Status');
  console.log('========================================================================\n');

  let unanimousCount = 0;
  let blockedCount = 0;
  let conflictingCount = 0;
  let partialCount = 0;

  for (let cIdx = 0; cIdx < batchResult.candidates.length; cIdx++) {
    const candidate = batchResult.candidates[cIdx];
    const packet = prepareCandidateReviewPacket(candidate.id, evidenceRepo);
    const analysis = packet.schemeAnalysisSnapshot;

    if (analysis.consensusStatus === 'UNANIMOUS_DETERMINISTIC') unanimousCount++;
    else if (analysis.consensusStatus === 'BLOCKED') blockedCount++;
    else if (analysis.consensusStatus === 'CONFLICTING_DETERMINISTIC') conflictingCount++;
    else if (analysis.consensusStatus === 'PARTIAL') partialCount++;

    const recordedDecisions = ledger.getDecisionsByCandidateId(candidate.id);

    console.log(`------------------------------------------------------------------------`);
    console.log(`Candidate #${cIdx + 1}: "${candidate.persianForm}" (normalized: "${candidate.normalizedForm}")`);
    console.log(`  Candidate ID:          ${candidate.id}`);
    console.log(`  Candidate Status:      ${candidate.status}`);
    console.log(`  Proposed Canonical:    ${candidate.proposedCanonical === null ? 'null (NON-AUTHORITATIVE)' : candidate.proposedCanonical}`);
    console.log(`  Packet ID:             ${packet.id}`);
    console.log(`  Review Fingerprint:    ${packet.reviewBasisFingerprint}`);
    console.log(`  Consensus Status:      ${analysis.consensusStatus}`);
    console.log(`  Consensus Hypothesis:  ${analysis.consensusTargetHypothesis ? `"${analysis.consensusTargetHypothesis}" [IJMES hypothesis]` : 'null'}`);
    console.log(`  Deterministic Targets: [${analysis.deterministicTargetHypotheses.join(', ')}]`);
    if (analysis.blockers.length > 0) {
      console.log(`  Blockers:              ${analysis.blockers.map((b) => `[${b.kind}] ${b.reason}`).join('; ')}`);
    }
    console.log(`  Human Decision:        ${recordedDecisions.length > 0 ? recordedDecisions.map((d) => d.disposition).join(', ') : 'NONE'}`);
    console.log(`  Authority Status:      NOT PROMOTED`);
    console.log();
  }

  console.log('========================================================================');
  console.log(' Summary Statistics');
  console.log('========================================================================');
  console.log(`  Total Candidate Groups:            ${batchResult.candidates.length}`);
  console.log(`  UNANIMOUS_DETERMINISTIC:           ${unanimousCount}`);
  console.log(`  BLOCKED:                           ${blockedCount}`);
  console.log(`  CONFLICTING_DETERMINISTIC:         ${conflictingCount}`);
  console.log(`  PARTIAL:                           ${partialCount}`);
  console.log(`  Human ACCEPT Decisions:            0`);
  console.log(`  Promoted Lexicon Readings:         0`);
  console.log(`  Authoritative Lexicon Changes:     0\n`);
  console.log('========================================================================');
  console.log(' [✓] Phase 5E inspection complete. Zero modifications to authoritative lexicon.');
  console.log('========================================================================\n');
}

if (require.main === module) {
  runAdjudicationPilot().catch((err) => {
    console.error(`\n[ERROR] ${err.message}\n`);
    process.exit(1);
  });
}
