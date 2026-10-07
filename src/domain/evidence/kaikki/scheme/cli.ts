#!/usr/bin/env node
/**
 * CLI tool for Phase 7B: Kaikki / Wiktionary Persian Source-Scheme Interpretation & IJMES Hypothesis Generation.
 *
 * Usage:
 *   tsx src/domain/evidence/kaikki/scheme/cli.ts --input <path-to-jsonl> [--limit 1000] [--output <report.json>]
 *   npm run interpret:kaikki -- --input <path-to-jsonl>
 */

import fs from 'node:fs';
import path from 'node:path';
import { KaikkiEvidenceConnector } from '../connector';
import { PHASE7B_SAMPLE_FIXTURES_PATH } from './fixtures';
import { WiktionaryPersianSchemeInterpreter } from './interpreter';
import { KaikkiCandidateSchemeAggregator } from './aggregator';
import {
  evaluateCandidateAgainstReviewedLexicon,
  computeKaikkiInterpretationReport,
  formatKaikkiInterpretationSummary
} from './statistics';
import type { KaikkiParseOptions } from '../types';
import type { KaikkiCandidateSchemeAnalysis, CandidateLexiconEvaluation } from './types';

export interface InterpretationCliArguments {
  input?: string;
  limit?: number;
  offset?: number;
  output?: string;
  strict?: boolean;
  onlyLemmas?: boolean;
  json?: boolean;
  help?: boolean;
}

export function parseArgs(args: string[]): InterpretationCliArguments {
  const parsed: InterpretationCliArguments = {};

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
    } else if (arg === '--json') {
      parsed.json = true;
    }
  }

  return parsed;
}

export function printHelp(): void {
  console.log(`
Kaikki / Wiktionary Persian Source-Scheme Interpretation & IJMES Hypothesis Generation CLI

Usage:
  tsx src/domain/evidence/kaikki/scheme/cli.ts [options]
  npm run interpret:kaikki -- [options]

Options:
  --input, -i <path>     Path to Kaikki / Wiktextract Persian JSONL dataset file.
                         (Defaults to Phase 7B sample fixtures if not specified)
  --limit, -l <n>        Maximum number of valid records to process.
  --offset, -o <n>       Number of records to skip before processing.
  --output <path>        Path to write machine-readable JSON interpretation report.
  --strict               Strict mode: fail closed on any malformed JSON record.
  --only-lemmas          Filter out entries with explicit form_of inflections.
  --json                 Output machine-readable JSON to stdout.
  --help, -h             Show this help message.
`);
}

export async function runInterpretationCli(rawArgs: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(rawArgs);

  if (args.help) {
    printHelp();
    return;
  }

  const targetInput = args.input ?? PHASE7B_SAMPLE_FIXTURES_PATH;
  if (!fs.existsSync(targetInput)) {
    console.error(`Error: input file not found: ${targetInput}`);
    process.exit(1);
  }

  if (!args.json) {
    console.log(`Interpreting Wiktionary source scheme: ${path.basename(targetInput)}\n`);
  }

  const connector = new KaikkiEvidenceConnector();
  const parseOptions: KaikkiParseOptions = {
    limit: args.limit,
    offset: args.offset,
    strict: args.strict,
    onlyLemmas: args.onlyLemmas
  };

  const parseResult = await connector.processFile(targetInput, parseOptions);

  const interpreter = new WiktionaryPersianSchemeInterpreter();
  const aggregator = new KaikkiCandidateSchemeAggregator();

  const candidates = parseResult.candidates ?? [];
  const observations = parseResult.observations ?? [];
  const evidence = parseResult.evidence ?? [];

  const candidateAnalyses: KaikkiCandidateSchemeAnalysis[] = [];
  const candidateEvaluations: CandidateLexiconEvaluation[] = [];

  for (const candidate of candidates) {
    const analysis = aggregator.analyzeCandidate(candidate, observations, interpreter);
    candidateAnalyses.push(analysis);
    const evaluation = evaluateCandidateAgainstReviewedLexicon(analysis);
    candidateEvaluations.push(evaluation);
  }

  const report = computeKaikkiInterpretationReport({
    datasetName: path.basename(targetInput),
    candidates,
    evidence,
    candidateAnalyses,
    candidateEvaluations
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatKaikkiInterpretationSummary(report));
  }

  if (args.output) {
    const resolvedOut = path.resolve(process.cwd(), args.output);
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, JSON.stringify(report, null, 2), 'utf8');
    if (!args.json) {
      console.log(`\nMachine-readable report written to: ${resolvedOut}`);
    }
  }
}

if (require.main === module || (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('cli.ts'))) {
  runInterpretationCli().catch((err) => {
    console.error(`[Interpretation CLI Error] ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    process.exit(1);
  });
}
