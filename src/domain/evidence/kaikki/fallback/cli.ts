#!/usr/bin/env node
/**
 * CLI tool to build Phase 7C Evidence Fallback Packs.
 *
 * Usage:
 *   tsx src/domain/evidence/kaikki/fallback/cli.ts --input <path-to-jsonl> --output <output-pack.json>
 *   npm run build:kaikki-fallback -- --input <path-to-jsonl>
 */

import fs from 'node:fs';
import path from 'node:path';
import { generateFallbackPack } from './generator';
import { PHASE7B_SAMPLE_FIXTURES_PATH } from '../scheme/fixtures';

export const DEFAULT_FALLBACK_PACK_OUTPUT = path.resolve(
  process.cwd(),
  'src/data/generated/kaikki-fallback.v1.json'
);

export interface BuildFallbackCliArguments {
  input?: string;
  output?: string;
  version?: string;
  limit?: number;
  strict?: boolean;
  help?: boolean;
}

export function parseArgs(args: string[]): BuildFallbackCliArguments {
  const parsed: BuildFallbackCliArguments = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--input' || arg === '-i') {
      parsed.input = args[i + 1];
      i += 1;
    } else if (arg === '--output' || arg === '-o') {
      parsed.output = args[i + 1];
      i += 1;
    } else if (arg === '--version' || arg === '-v') {
      parsed.version = args[i + 1];
      i += 1;
    } else if (arg === '--limit' || arg === '-l') {
      parsed.limit = parseInt(args[i + 1], 10);
      i += 1;
    } else if (arg === '--strict') {
      parsed.strict = true;
    }
  }

  return parsed;
}

export function printHelp(): void {
  console.log(`
Build Kaikki / Wiktionary Evidence Fallback Pack (Phase 7C)

Usage:
  tsx src/domain/evidence/kaikki/fallback/cli.ts [options]
  npm run build:kaikki-fallback -- [options]

Options:
  --input, -i <path>     Path to input Kaikki Persian JSONL dataset file.
                         (Defaults to Phase 7B sample fixtures if omitted)
  --output, -o <path>    Path to write the generated JSON fallback pack.
                         (Defaults to src/data/generated/kaikki-fallback.v1.json)
  --version, -v <semver> Semantic version string for the generated pack (default: 1.0.0).
  --limit, -l <n>        Limit number of input records to process.
  --strict               Strict mode: fail on malformed JSON records.
  --help, -h             Show this help message.
`);
}

export async function runBuildFallbackCli(rawArgs: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(rawArgs);

  if (args.help) {
    printHelp();
    return;
  }

  const inputPath = args.input ?? PHASE7B_SAMPLE_FIXTURES_PATH;
  const outputPath = args.output ?? DEFAULT_FALLBACK_PACK_OUTPUT;

  console.log(`Generating Kaikki evidence fallback pack...`);
  console.log(`  Source dataset: ${inputPath}`);
  console.log(`  Output pack:    ${outputPath}`);

  const pack = await generateFallbackPack(inputPath, {
    packVersion: args.version ?? '1.0.0',
    limit: args.limit,
    strict: args.strict
  });

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const packJson = JSON.stringify(pack, null, 2);
  fs.writeFileSync(outputPath, packJson, 'utf8');

  const byteSize = Buffer.byteLength(packJson, 'utf8');
  console.log(`\nPack generation complete:`);
  console.log(`  Pack version:   ${pack.manifest.packVersion}`);
  console.log(`  Eligible entries: ${pack.manifest.entryCount}`);
  console.log(`  Pack size:      ${(byteSize / 1024).toFixed(2)} KB (${byteSize} bytes)`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('cli.ts')) {
  runBuildFallbackCli().catch((err) => {
    console.error('Fatal error building fallback pack:', err);
    process.exit(1);
  });
}
