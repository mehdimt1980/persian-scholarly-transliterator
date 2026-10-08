/**
 * Deterministic selection and split logic for OpenAlex coverage corpus.
 *
 * Core Scholarly Invariants:
 *   - No Math.random() and no API-order bias.
 *   - Selected deterministically via SHA-256("phase7f-openalex-v1" + OpenAlex ID).
 *   - Split 80% DIAGNOSTIC / 20% LOCKED_HOLDOUT via SHA-256("phase7f-split-v1" + OpenAlex ID).
 *   - Computes reproducible SHA-256 hashes for freeze validation.
 */

import crypto from 'node:crypto';
import type { CoverageCorpusCase, CoverageCorpusSplit } from '../types';

export interface RawOpenAlexRecord {
  id: string; // e.g. "https://openalex.org/W12345678" or "W12345678"
  title: string;
  language?: string;
  type?: string;
  publication_year?: number;
  doi?: string;
  updated_date?: string;
}

export interface CandidatePoolItem {
  openAlexId: string;
  rawTitle: string;
  normalizedTitle: string;
  language: string;
  workType: string;
  publicationYear?: number;
  doi?: string;
  updatedDate?: string;
  selectionHash: string;
}

export function computeSelectionHash(openAlexId: string): string {
  return crypto
    .createHash('sha256')
    .update(`phase7f-openalex-v1:${openAlexId}`)
    .digest('hex');
}

export function computeSplitHash(openAlexId: string): string {
  return crypto
    .createHash('sha256')
    .update(`phase7f-split-v1:${openAlexId}`)
    .digest('hex');
}

export function computeCorpusSha256(cases: CoverageCorpusCase[]): string {
  // Sort cases by ID for deterministic hashing
  const sorted = [...cases].sort((a, b) => a.id.localeCompare(b.id));
  const payload = JSON.stringify(
    sorted.map((c) => ({
      id: c.id,
      sourceId: c.sourceId,
      rawText: c.rawText,
      normalizedText: c.normalizedText,
      kind: c.kind,
      split: c.split,
      metadata: c.metadata
    }))
  );
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function computeHoldoutSha256(cases: CoverageCorpusCase[]): string {
  const holdoutCases = cases
    .filter((c) => c.split === 'LOCKED_HOLDOUT')
    .sort((a, b) => a.id.localeCompare(b.id));
  const payload = JSON.stringify(
    holdoutCases.map((c) => ({
      id: c.id,
      sourceId: c.sourceId,
      rawText: c.rawText,
      normalizedText: c.normalizedText,
      kind: c.kind,
      split: c.split,
      metadata: c.metadata
    }))
  );
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function selectAndSplitCorpus(
  pool: CandidatePoolItem[],
  targetCount: number = 5000,
  diagnosticRatio: number = 0.8
): {
  selectedCases: CoverageCorpusCase[];
  diagnosticCases: CoverageCorpusCase[];
  holdoutCases: CoverageCorpusCase[];
  corpusSha256: string;
  holdoutSha256: string;
} {
  // 1. Deterministic ranking by selectionHash (lowest hashes first)
  const sortedPool = [...pool].sort((a, b) =>
    a.selectionHash.localeCompare(b.selectionHash)
  );

  const selectedPool = sortedPool.slice(0, targetCount);

  // 2. Deterministic split ranking by splitHash
  const withSplitHash = selectedPool.map((item) => ({
    item,
    splitHash: computeSplitHash(item.openAlexId)
  }));

  withSplitHash.sort((a, b) => a.splitHash.localeCompare(b.splitHash));

  const diagnosticCutoff = Math.round(selectedPool.length * diagnosticRatio);

  const cases: CoverageCorpusCase[] = withSplitHash.map((entry, index) => {
    const split: CoverageCorpusSplit =
      index < diagnosticCutoff ? 'DIAGNOSTIC' : 'LOCKED_HOLDOUT';
    const rawId = entry.item.openAlexId.replace('https://openalex.org/', '');

    return {
      id: `openalex-${rawId}`,
      source: 'OPENALEX',
      sourceId: entry.item.openAlexId,
      rawText: entry.item.rawTitle,
      normalizedText: entry.item.normalizedTitle,
      kind: 'TITLE',
      metadata: {
        workType: entry.item.workType || 'unknown',
        publicationYear: entry.item.publicationYear,
        language: entry.item.language || 'fa',
        doi: entry.item.doi,
        updatedDate: entry.item.updatedDate
      },
      split
    };
  });

  // Sort cases back by ID for canonical stable representation
  cases.sort((a, b) => a.id.localeCompare(b.id));

  const diagnosticCases = cases.filter((c) => c.split === 'DIAGNOSTIC');
  const holdoutCases = cases.filter((c) => c.split === 'LOCKED_HOLDOUT');

  const corpusSha256 = computeCorpusSha256(cases);
  const holdoutSha256 = computeHoldoutSha256(cases);

  return {
    selectedCases: cases,
    diagnosticCases,
    holdoutCases,
    corpusSha256,
    holdoutSha256
  };
}
