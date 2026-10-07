#!/usr/bin/env node
/**
 * CLI tool for Kaikki / Wiktextract Persian lexical acquisition pilot.
 *
 * Usage:
 *   tsx src/domain/evidence/kaikki/cli.ts --input <path-to-jsonl> [--limit 10000] [--output <report.json>]
 *   npm run acquire:kaikki -- --input <path-to-jsonl>
 */

import fs from 'node:fs';
import path from 'node:path';
import { KaikkiEvidenceConnector } from './connector';
import { KAIKKI_SAMPLE_FIXTURE_PATH } from './fixtures';
import { formatKaikkiSummary } from './statistics';
import type { KaikkiParseOptions } from './types';

export interface CliArguments {
  input?: string;
  stdin?: boolean;
  limit?: number;
  offset?: number;
  output?: string;
  strict?: boolean;
  onlyLemmas?: boolean;
  json?: boolean;
  help?: boolean;
}

export function parseArgs(args: string[]): CliArguments {
  const parsed: CliArguments = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--input' || arg === '-i') {
      parsed.input = args[i + 1];
      i += 1;
    } else if (arg === '--limit' || arg === '-l') {
      parsed.limit = parseInt(args[i + 1], 10);
      i += 1;
    } else if (arg === '--offset' || arg === '-o') {
      parsed.offset = parseInt(args[i + 1], 10);
      i += 1;
    } else if (arg === '--output') {
      parsed.output = args[i + 1];
      i += 1;
    } else if (arg === '--strict') {
      parsed.strict = true;
    } else if (arg === '--only-lemmas') {
      parsed.onlyLemmas = true;
    } else if (arg === '--stdin') {
      parsed.stdin = true;
    } else if (arg === '--json') {
      parsed.json = true;
    }
  }

  return parsed;
}

export function printHelp(): void {
  console.log(`
Kaikki Persian Lexical Acquisition Pilot CLI

Usage:
  tsx src/domain/evidence/kaikki/cli.ts [options]

Options:
  --input, -i <path>     Path to Kaikki / Wiktextract Persian JSONL dataset file.
                         (Defaults to sample fixture if not specified)
  --stdin                Read JSONL input stream from stdin.
  --limit, -l <n>        Maximum number of valid records to process.
  --offset, -o <n>       Number of records to skip before processing.
  --output <path>        Path to write JSON acquisition report.
  --strict               Strict mode: fail closed on any malformed JSON record.
  --only-lemmas          Filter out entries with explicit form_of inflections.
  --json                 Output machine-readable JSON to stdout.
  --help, -h             Show this help message.
`);
}

export async function runKaikkiCli(rawArgs: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(rawArgs);

  if (args.help) {
    printHelp();
    return;
  }

  const connector = new KaikkiEvidenceConnector();
  const parseOptions: KaikkiParseOptions = {
    limit: args.limit,
    offset: args.offset,
    strict: args.strict,
    onlyLemmas: args.onlyLemmas
  };

  let result;
  if (args.stdin) {
    result = await connector.processStream(process.stdin, parseOptions);
  } else {
    const targetInput = args.input ?? KAIKKI_SAMPLE_FIXTURE_PATH;
    if (!fs.existsSync(targetInput)) {
      console.error(`Error: input file not found: ${targetInput}`);
      process.exit(1);
    }
    if (!args.json) {
      console.log(`Processing Kaikki dataset: ${path.basename(targetInput)}\n`);
    }
    result = await connector.processFile(targetInput, parseOptions);
  }

  if (args.json) {
    console.log(JSON.stringify(result.report, null, 2));
  } else {
    console.log(formatKaikkiSummary(result.report));
  }

  if (args.output) {
    const resolvedOut = path.resolve(process.cwd(), args.output);
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, JSON.stringify(result.report, null, 2), 'utf8');
    console.log(`\nMachine-readable report written to: ${resolvedOut}`);
  }
}

if (require.main === module || (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('cli.ts'))) {
  runKaikkiCli().catch((err) => {
    console.error(`[Kaikki CLI Error] ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    process.exit(1);
  });
}
