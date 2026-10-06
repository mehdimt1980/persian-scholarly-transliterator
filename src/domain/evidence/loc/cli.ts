import fs from 'node:fs';
import path from 'node:path';
import { LocClient } from './client';
import { extractEvidenceFromMarcRecord } from './extractor';
import { resolveMarc880Linkages } from './linkage';
import { parseMarcXml } from './xmlParser';

function printHeader(): void {
  console.log('========================================================================');
  console.log(' Library of Congress Lexical Evidence Pilot Connector (Phase 5B)');
  console.log('========================================================================');
  console.log(' [!] STATUS: NON-AUTHORITATIVE EXTERNAL EVIDENCE');
  console.log('     Library records represent external cataloging observations.');
  console.log('     They do NOT constitute project scholarly transliteration authority.');
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
      console.log('  tsx src/domain/evidence/loc/cli.ts [--lccn <LCCN>] [--fixture <path>]');
      console.log('Examples:');
      console.log('  tsx src/domain/evidence/loc/cli.ts --lccn 2016404617');
      console.log('  tsx src/domain/evidence/loc/cli.ts --fixture src/domain/evidence/loc/fixtures/2016404617.marcxml.xml');
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

  for (let idx = 0; idx < records.length; idx++) {
    const rec = records[idx];
    console.log(`------------------------------------------------------------------------`);
    console.log(`Record #${idx + 1}: LCCN ${rec.lccn ?? 'UNKNOWN'} | Language: ${rec.language ?? 'N/A'}`);
    console.log(`URI: ${rec.sourceUri ?? 'N/A'}`);
    console.log(`Control Fields: ${rec.controlFields.length} | Data Fields: ${rec.dataFields.length}`);

    const linkedPairs = resolveMarc880Linkages(rec);
    console.log(`Discovered 880 Linkages (${linkedPairs.length}):`);
    for (const pair of linkedPairs) {
      const linkRaw = pair.linkage ? `$6 ${pair.linkage.raw}` : '[No linkage]';
      console.log(
        `  - Tag: ${pair.tag} ↔ 880 (occ: ${pair.occurrenceNumber}, status: ${pair.status}, linkage: ${linkRaw})`
      );
      if (pair.regularField) {
        for (const sf of pair.regularField.subfields) {
          console.log(`      Regular  $${sf.code}: "${sf.value}"`);
        }
      } else {
        console.log(`      Regular: [None - status: ${pair.status}]`);
      }
      for (const sf of pair.alternateField.subfields) {
        if (sf.code !== '6') {
          console.log(`      Alternate $${sf.code}: "${sf.value}"`);
        }
      }
    }

    const evidence = extractEvidenceFromMarcRecord(rec, {
      now: () => new Date().toISOString()
    });

    console.log(`\nExtracted LexicalEvidence (${evidence.length} observations):`);
    for (const ev of evidence) {
      console.log(`  [Observation ID] ${ev.id}`);
      console.log(`    Field:      ${ev.sourceField}`);
      console.log(`    Entity:     ${ev.entityType}`);
      console.log(`    Scheme:     ${ev.romanizationScheme}`);
      console.log(`    Persian:    "${ev.persianForm}"`);
      console.log(`    Observed:   ${ev.observedRomanization ? `"${ev.observedRomanization}"` : '[None]'}`);
      console.log(`    Provenance: ${ev.provenance.sourceTitle} (${ev.provenance.retrievalMethod} @ ${ev.provenance.retrievedAt})`);
      console.log();
    }
  }

  console.log('========================================================================');
  console.log(' [✓] Extraction complete. All observations preserved as external evidence.');
  console.log('========================================================================\n');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n[ERROR] ${err.message}\n`);
    process.exit(1);
  });
}
