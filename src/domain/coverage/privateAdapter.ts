/**
 * Adapter for loading and evaluating local private corpora (dissertations, bibliographies, etc.)
 *
 * Core Invariant:
 *   - Allows evaluation on user-supplied local files without committing them.
 *   - Supports both JSONL and raw plain-text line files.
 *   - Reuses the same coverage evaluator and metrics pipeline.
 */

import fs from 'node:fs';
import path from 'node:path';
import { normalizePersian } from '../normalization';
import { computeSplitHash } from './openalex/selection';
import type { CoverageCaseKind, CoverageCorpusCase, CoverageCorpusSplit } from './types';

export interface LocalCorpusItemJsonl {
  id?: string;
  text?: string;
  title?: string;
  kind?: string;
  metadata?: Record<string, unknown>;
}

export function loadPrivateCorpus(filePath: string): CoverageCorpusCase[] {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Local corpus file not found at: ${resolvedPath}`);
  }

  const rawContent = fs.readFileSync(resolvedPath, 'utf8');
  const lines = rawContent.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const cases: CoverageCorpusCase[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    let rawText = line;
    let customId = `local-${String(index + 1).padStart(5, '0')}`;
    let kind: CoverageCaseKind = 'TITLE';
    let metadata: Record<string, unknown> = { sourceFile: path.basename(filePath) };

    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const parsed = JSON.parse(line) as LocalCorpusItemJsonl;
        rawText = parsed.text ?? parsed.title ?? line;
        if (parsed.id) customId = parsed.id;
        if (parsed.kind && ['TITLE', 'BIBLIOGRAPHY', 'PROSE', 'OTHER'].includes(parsed.kind)) {
          kind = parsed.kind as CoverageCaseKind;
        }
        if (parsed.metadata) {
          metadata = { ...metadata, ...parsed.metadata };
        }
      } catch {
        // Fallback to plain text line
      }
    }

    const normalized = normalizePersian(rawText).normalizedInput.trim();
    const splitHash = computeSplitHash(customId);
    // Split deterministic: 80% diagnostic / 20% holdout based on hex hash
    const hashInt = parseInt(splitHash.slice(0, 8), 16);
    const split: CoverageCorpusSplit =
      hashInt / 0xffffffff < 0.8 ? 'DIAGNOSTIC' : 'LOCKED_HOLDOUT';

    cases.push({
      id: customId,
      source: 'LOCAL',
      sourceId: customId,
      rawText,
      normalizedText: normalized,
      kind,
      metadata,
      split
    });
  }

  return cases;
}
