import fs from 'node:fs';
import path from 'node:path';
import { extractEvidenceFromMarcRecord } from '../loc/extractor';
import { parseMarcXml } from '../loc/xmlParser';
import { LocClient } from '../loc/client';
import { alignLexicalEvidence } from './positionalAligner';
import { extractCandidatesFromAlignedEvidence } from './candidateExtractor';
import { LexicalEvidence } from '../types';

function printHeader(): void {
  console.log('========================================================================');
  console.log(' Lexical Alignment & Candidate Extraction Pilot (Phase 5C)');
  console.log('========================================================================');
  console.log(' [!] STATUS: NON-AUTHORITATIVE DERIVED ALIGNMENT & CANDIDATE PROPOSALS');
  console.log('     Aligned segment evidence is computationally derived from parent observations.');
  console.log('     Candidates have proposedCanonical: null (no ALA-LC to IJMES conversion).');
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
      console.log('  npm run evidence:alignment:pilot -- [--fixture <path>] [--lccn <LCCN>]');
      console.log('Examples:');
      console.log('  npm run evidence:alignment:pilot -- --fixture src/domain/evidence/loc/fixtures/2016404617.marcxml.xml');
      console.log('  npm run evidence:alignment:pilot -- --lccn 2016404617');
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
  const allDerivedEvidence: LexicalEvidence[] = [];
  let unalignedCount = 0;

  for (let rIdx = 0; rIdx < records.length; rIdx++) {
    const rec = records[rIdx];
    console.log(`------------------------------------------------------------------------`);
    console.log(`Record #${rIdx + 1}: LCCN ${rec.lccn ?? 'UNKNOWN'} | Language: ${rec.language ?? 'N/A'}`);
    console.log(`------------------------------------------------------------------------\n`);

    const parentEvidenceList = extractEvidenceFromMarcRecord(rec, {
      now: () => new Date().toISOString()
    });

    for (const parent of parentEvidenceList) {
      allParentEvidence.push(parent);
      console.log(`[Parent Evidence] ${parent.id}`);
      console.log(`  Field:    ${parent.sourceField}`);
      console.log(`  Persian:  "${parent.persianForm}"`);
      console.log(`  Roman:    ${parent.observedRomanization ? `"${parent.observedRomanization}"` : '[None]'}`);

      const alignResult = alignLexicalEvidence(parent);

      console.log(`  Persian Tokens: [${alignResult.persianTokens.map((t) => `"${t.text}"`).join(', ')}]`);
      console.log(`  Roman Tokens:   [${alignResult.romanTokens.map((t) => `"${t.text}"`).join(', ')}]`);

      if (!alignResult.success) {
        unalignedCount++;
        console.log(`  Alignment Status: UNALIGNED (${alignResult.diagnostic?.kind}: ${alignResult.diagnostic?.message})`);
      } else {
        console.log(`  Alignment Status: SUCCESS (${alignResult.pairs.length} segment(s) aligned via POSITIONAL_EQUAL_COUNT)`);
        for (const pair of alignResult.pairs) {
          allDerivedEvidence.push(pair.derivedEvidence);
          console.log(`    ↳ Segment #${pair.segmentIndex + 1}: "${pair.persianToken.text}" ↔ "${pair.romanToken.text}"`);
          console.log(`      Derived Evidence ID: ${pair.derivedEvidence.id}`);
          console.log(`      Spans: Persian [${pair.persianToken.start}..${pair.persianToken.end}], Roman [${pair.romanToken.start}..${pair.romanToken.end}]`);
          console.log(`      Eligibility: ${pair.candidateEligibility}${pair.exclusionReason ? ` (${pair.exclusionReason})` : ''}`);
        }
      }
      console.log();
    }
  }

  // Cross-record candidate extraction
  console.log('========================================================================');
  console.log(' Candidate Extraction & Synthesis');
  console.log('========================================================================\n');

  const extractionResult = extractCandidatesFromAlignedEvidence(allDerivedEvidence, {
    notes: 'Generated via Phase 5C pilot CLI'
  });

  console.log(`Summary Statistics:`);
  console.log(`  Parent observations:         ${allParentEvidence.length}`);
  console.log(`  Aligned derived segments:    ${extractionResult.derivedSegmentsCount}`);
  console.log(`  Candidate-eligible segments: ${extractionResult.eligibleSegmentsCount}`);
  console.log(`  Context-bound segments:      ${extractionResult.contextBoundSegmentsCount}`);
  console.log(`  Unaligned observations:      ${unalignedCount}`);
  console.log(`  Synthesized candidate groups:${extractionResult.candidates.length}\n`);

  for (let cIdx = 0; cIdx < extractionResult.candidates.length; cIdx++) {
    const cand = extractionResult.candidates[cIdx];
    console.log(`------------------------------------------------------------------------`);
    console.log(`Candidate #${cIdx + 1}: [NON-AUTHORITATIVE CANDIDATE]`);
    console.log(`  ID:                ${cand.id}`);
    console.log(`  Persian Form:      "${cand.persianForm}" (normalized: "${cand.normalizedForm}")`);
    console.log(`  ProposedCanonical: ${cand.proposedCanonical === null ? 'null (NO CONVERSION TO IJMES)' : cand.proposedCanonical}`);
    console.log(`  Entity Type:       ${cand.entityType}`);
    console.log(`  Status:            ${cand.status}`);
    console.log(`  Supporting Evi IDs (${cand.evidenceIds.length}):`);
    for (const eid of cand.evidenceIds) {
      const evi = allDerivedEvidence.find((e) => e.id === eid);
      console.log(`    - ${eid} (${evi?.persianForm} ↔ "${evi?.observedRomanization}")`);
    }
    if (cand.conflicts.length > 0) {
      console.log(`  Conflicts / Variants (${cand.conflicts.length}):`);
      for (const conf of cand.conflicts) {
        console.log(`    - [${conf.conflictKind}] ${conf.conflictReason}`);
      }
    }
    console.log();
  }

  console.log('========================================================================');
  console.log(' [✓] Pipeline complete. Zero modifications made to authoritative lexicon.');
  console.log('========================================================================\n');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n[ERROR] ${err.message}\n`);
    process.exit(1);
  });
}
