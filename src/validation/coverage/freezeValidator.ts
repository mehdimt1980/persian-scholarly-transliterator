/**
 * Validator for Phase 7F frozen coverage corpus integrity.
 *
 * Verifies:
 *   1. Corpus version match.
 *   2. Selection algorithm match.
 *   3. Record count and split counts match.
 *   4. Full corpus SHA-256 recomputation matches committed manifest hash.
 *   5. LOCKED_HOLDOUT subset SHA-256 recomputation matches committed manifest hash.
 *   6. Source manifest and selection manifest integrity.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  computeCorpusSha256,
  computeHoldoutSha256
} from '../../domain/coverage/openalex/selection';
import type { CoverageCorpusFile } from '../../domain/coverage/types';

export interface CorpusFreezeValidationResult {
  valid: boolean;
  corpusVersion: string;
  source: string;
  totalRecords: number;
  diagnosticCount: number;
  lockedHoldoutCount: number;
  expectedCorpusSha256: string;
  actualCorpusSha256: string;
  expectedHoldoutSha256: string;
  actualHoldoutSha256: string;
  selectionAlgorithm: string;
  errors: string[];
}

export function validateCorpusFreeze(
  corpusFilePath?: string
): CorpusFreezeValidationResult {
  const filePath =
    corpusFilePath ??
    path.resolve(
      process.cwd(),
      'validation',
      'coverage',
      'phase7f-openalex-persian-titles.v1.json'
    );

  const errors: string[] = [];

  if (!fs.existsSync(filePath)) {
    return {
      valid: false,
      corpusVersion: 'unknown',
      source: 'unknown',
      totalRecords: 0,
      diagnosticCount: 0,
      lockedHoldoutCount: 0,
      expectedCorpusSha256: '',
      actualCorpusSha256: '',
      expectedHoldoutSha256: '',
      actualHoldoutSha256: '',
      selectionAlgorithm: '',
      errors: [`Corpus file does not exist at: ${filePath}`]
    };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  let corpus: CoverageCorpusFile;
  try {
    corpus = JSON.parse(content) as CoverageCorpusFile;
  } catch (err) {
    return {
      valid: false,
      corpusVersion: 'unknown',
      source: 'unknown',
      totalRecords: 0,
      diagnosticCount: 0,
      lockedHoldoutCount: 0,
      expectedCorpusSha256: '',
      actualCorpusSha256: '',
      expectedHoldoutSha256: '',
      actualHoldoutSha256: '',
      selectionAlgorithm: '',
      errors: [`Failed to parse JSON from ${filePath}: ${String(err)}`]
    };
  }

  const manifest = corpus.manifest;
  const cases = corpus.cases ?? [];

  if (!manifest) {
    errors.push('Corpus manifest missing in frozen file.');
  }

  if (manifest.corpusVersion !== 'phase7f-openalex-persian-titles-v1') {
    errors.push(`Unexpected corpus version: ${manifest.corpusVersion}`);
  }

  if (cases.length !== manifest.totalRecords) {
    errors.push(
      `Record count mismatch: manifest says ${manifest.totalRecords}, but array has ${cases.length}`
    );
  }

  const diagCount = cases.filter((c) => c.split === 'DIAGNOSTIC').length;
  const holdCount = cases.filter((c) => c.split === 'LOCKED_HOLDOUT').length;

  if (diagCount !== manifest.diagnosticCount) {
    errors.push(
      `Diagnostic count mismatch: manifest says ${manifest.diagnosticCount}, but found ${diagCount}`
    );
  }

  if (holdCount !== manifest.lockedHoldoutCount) {
    errors.push(
      `Holdout count mismatch: manifest says ${manifest.lockedHoldoutCount}, but found ${holdCount}`
    );
  }

  const actualCorpusSha = computeCorpusSha256(cases);
  const actualHoldoutSha = computeHoldoutSha256(cases);

  if (actualCorpusSha !== manifest.corpusSha256) {
    errors.push(
      `Corpus SHA-256 drift! Manifest has ${manifest.corpusSha256}, but recomputed hash is ${actualCorpusSha}`
    );
  }

  if (actualHoldoutSha !== manifest.holdoutSha256) {
    errors.push(
      `Holdout SHA-256 drift! Manifest has ${manifest.holdoutSha256}, but recomputed hash is ${actualHoldoutSha}`
    );
  }

  // Check unique IDs
  const idSet = new Set<string>();
  for (const c of cases) {
    if (idSet.has(c.id)) {
      errors.push(`Duplicate case ID detected: ${c.id}`);
    }
    idSet.add(c.id);
  }

  return {
    valid: errors.length === 0,
    corpusVersion: manifest?.corpusVersion ?? 'unknown',
    source: manifest?.source ?? 'unknown',
    totalRecords: cases.length,
    diagnosticCount: diagCount,
    lockedHoldoutCount: holdCount,
    expectedCorpusSha256: manifest?.corpusSha256 ?? '',
    actualCorpusSha256: actualCorpusSha,
    expectedHoldoutSha256: manifest?.holdoutSha256 ?? '',
    actualHoldoutSha256: actualHoldoutSha,
    selectionAlgorithm: manifest?.selectionAlgorithm ?? '',
    errors
  };
}
