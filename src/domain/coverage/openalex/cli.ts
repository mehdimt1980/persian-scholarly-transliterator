/**
 * OpenAlex acquisition and deterministic corpus freezing CLI for Phase 7F.
 *
 * Usage:
 *   npm run acquire:phase7f-openalex
 *   npm run acquire:phase7f-openalex -- --output artifacts/phase7f/openalex-persian-works.jsonl --target 5000
 */

import fs from 'node:fs';
import path from 'node:path';
import { OpenAlexWorksClient } from './client';
import { evaluateTitleEligibility } from './eligibility';
import {
  computeSelectionHash,
  selectAndSplitCorpus,
  type CandidatePoolItem,
  type RawOpenAlexRecord
} from './selection';
import type { CoverageCorpusFile } from '../types';

export const OPENALEX_CORPUS_VERSION = 'phase7f-openalex-persian-titles-v1';
export const OPENALEX_SELECTION_ALGO_VERSION = 'sha256-ranked-v1';

export async function runOpenAlexAcquisition(options: {
  maxScan?: number;
  targetCount?: number;
  outputPoolPath?: string;
  corpusOutputPath?: string;
  sourceManifestPath?: string;
  selectionManifestPath?: string;
} = {}): Promise<{
  totalScanned: number;
  eligiblePoolCount: number;
  selectedCount: number;
  diagnosticCount: number;
  lockedHoldoutCount: number;
  corpusSha256: string;
  holdoutSha256: string;
}> {
  const targetCount = options.targetCount ?? 5000;
  const maxScan = options.maxScan ?? 15000;
  const client = new OpenAlexWorksClient();

  const retrievedAt = new Date().toISOString();
  const seenNormalized = new Set<string>();
  const eligiblePool: CandidatePoolItem[] = [];
  const scannedRecords: RawOpenAlexRecord[] = [];

  console.log(`[Phase 7F] Starting OpenAlex acquisition (target: ${targetCount} eligible titles)...`);

  let scanned = 0;
  for await (const record of client.streamPersianWorks({ maxRecordsToScan: maxScan })) {
    scanned += 1;
    scannedRecords.push(record);

    const eligibility = evaluateTitleEligibility(
      record.title,
      record.language,
      seenNormalized
    );

    if (eligibility.eligible) {
      seenNormalized.add(eligibility.normalizedTitle);
      const openAlexId = record.id;
      const selectionHash = computeSelectionHash(openAlexId);

      eligiblePool.push({
        openAlexId,
        rawTitle: record.title.trim(),
        normalizedTitle: eligibility.normalizedTitle,
        language: record.language ?? 'fa',
        workType: record.type ?? 'unknown',
        publicationYear: record.publication_year,
        doi: record.doi,
        updatedDate: record.updated_date,
        selectionHash
      });
    }

    if (scanned % 500 === 0) {
      console.log(`  Scanned ${scanned} works -> ${eligiblePool.length} eligible Persian titles...`);
    }

    // Stop scanning once we have comfortably exceeded target count for deterministic selection
    if (eligiblePool.length >= targetCount + 1000) {
      break;
    }
  }

  console.log(`[Phase 7F] Scanned ${scanned} works. Total eligible pool: ${eligiblePool.length}.`);

  const {
    selectedCases,
    diagnosticCases,
    holdoutCases,
    corpusSha256,
    holdoutSha256
  } = selectAndSplitCorpus(eligiblePool, Math.min(targetCount, eligiblePool.length));

  console.log(`[Phase 7F] Selected ${selectedCases.length} titles (${diagnosticCases.length} DIAGNOSTIC, ${holdoutCases.length} LOCKED_HOLDOUT).`);
  console.log(`[Phase 7F] Corpus SHA-256: ${corpusSha256}`);
  console.log(`[Phase 7F] Holdout SHA-256: ${holdoutSha256}`);

  // 1. Write raw scanned pool to artifacts
  const poolOutputPath =
    options.outputPoolPath ??
    path.resolve(process.cwd(), 'artifacts', 'phase7f', 'openalex-persian-works.jsonl');
  fs.mkdirSync(path.dirname(poolOutputPath), { recursive: true });
  fs.writeFileSync(
    poolOutputPath,
    scannedRecords.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf8'
  );

  // 2. Write frozen corpus
  const corpusOutputPath =
    options.corpusOutputPath ??
    path.resolve(
      process.cwd(),
      'validation',
      'coverage',
      'phase7f-openalex-persian-titles.v1.json'
    );
  fs.mkdirSync(path.dirname(corpusOutputPath), { recursive: true });

  const corpusFile: CoverageCorpusFile = {
    manifest: {
      corpusVersion: OPENALEX_CORPUS_VERSION,
      source: 'OPENALEX',
      generatedAt: retrievedAt,
      selectionAlgorithm: OPENALEX_SELECTION_ALGO_VERSION,
      totalRecords: selectedCases.length,
      diagnosticCount: diagnosticCases.length,
      lockedHoldoutCount: holdoutCases.length,
      corpusSha256,
      holdoutSha256
    },
    cases: selectedCases
  };

  fs.writeFileSync(corpusOutputPath, JSON.stringify(corpusFile, null, 2), 'utf8');

  // 3. Write source manifest
  const sourceManifestPath =
    options.sourceManifestPath ??
    path.resolve(process.cwd(), 'validation', 'coverage', 'source-manifest.json');
  const sourceManifest = {
    source: 'OpenAlex',
    retrievedAt,
    queryFilter: 'filter=language:fa',
    selectedFields: [
      'id',
      'title',
      'language',
      'type',
      'publication_year',
      'doi',
      'updated_date'
    ],
    recordsScanned: scanned,
    eligiblePersianPoolCount: eligiblePool.length,
    selectedCorpusCount: selectedCases.length,
    openAlexLicense: 'CC0-1.0',
    builderVersion: '1.0.0'
  };
  fs.writeFileSync(sourceManifestPath, JSON.stringify(sourceManifest, null, 2), 'utf8');

  // 4. Write selection manifest
  const selectionManifestPath =
    options.selectionManifestPath ??
    path.resolve(process.cwd(), 'validation', 'coverage', 'selection-manifest.json');
  const selectionManifest = {
    corpusVersion: OPENALEX_CORPUS_VERSION,
    selectionAlgorithm: OPENALEX_SELECTION_ALGO_VERSION,
    selectionFormula: 'SHA-256("phase7f-openalex-v1:" + openAlexId) ascending',
    splitFormula: 'SHA-256("phase7f-split-v1:" + openAlexId) -> 80% DIAGNOSTIC / 20% LOCKED_HOLDOUT',
    totalRecords: selectedCases.length,
    diagnosticCount: diagnosticCases.length,
    lockedHoldoutCount: holdoutCases.length,
    corpusSha256,
    holdoutSha256,
    createdAt: retrievedAt
  };
  fs.writeFileSync(
    selectionManifestPath,
    JSON.stringify(selectionManifest, null, 2),
    'utf8'
  );

  return {
    totalScanned: scanned,
    eligiblePoolCount: eligiblePool.length,
    selectedCount: selectedCases.length,
    diagnosticCount: diagnosticCases.length,
    lockedHoldoutCount: holdoutCases.length,
    corpusSha256,
    holdoutSha256
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let targetCount = 5000;
  let maxScan = 15000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && args[i + 1]) {
      targetCount = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--max-scan' && args[i + 1]) {
      maxScan = parseInt(args[i + 1], 10);
      i++;
    }
  }

  try {
    await runOpenAlexAcquisition({ targetCount, maxScan });
    console.log('[Phase 7F] OpenAlex acquisition and corpus freeze completed successfully.');
  } catch (err) {
    console.error('[Phase 7F] Acquisition failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
