/**
 * Deterministic selection of 100 DIAGNOSTIC scholarly titles for the LoC Feasibility Pilot.
 *
 * Selection Rules:
 *   1. DIAGNOSTIC partition ONLY (LOCKED_HOLDOUT is strictly untouched).
 *   2. Must remain unresolved after Phase 7E experimental fallback.
 *   3. Deterministic SHA-256 hash ranking (case.id + salt).
 *   4. Exactly 100 titles selected without cherry-picking.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LEXICON_REPOSITORY } from '../../../../data/lexicon';
import { DEFAULT_EVIDENCE_FALLBACK_PACK } from '../../../../data/fallback';
import { transliterate } from '../../../engine';
import { buildEvaluationFallbackUnion } from '../../../coverage/fallbackUnion';
import { EvidenceFallbackRepository } from '../../kaikki/fallback/repository';
import type { CoverageCorpusFile, CoverageCorpusCase } from '../../../coverage/types';
import type { EvidenceFallbackPack } from '../../kaikki/fallback/types';
import type { LocPilotTitleCase } from './types';
import { normalizePersian } from '../../../normalization';

export const LOC_PILOT_SELECTION_VERSION = '1.1.0';
export const LOC_PILOT_TARGET_COUNT = 100;
const SELECTION_SALT = 'phase7g-loc-diagnostic-pilot-v1';

export function selectLocPilotTitles(
  corpusPath?: string,
  phase7EPackPath?: string,
  targetCount: number = LOC_PILOT_TARGET_COUNT
): LocPilotTitleCase[] {
  const defaultCorpusPath =
    corpusPath ??
    path.resolve(
      process.cwd(),
      'validation',
      'coverage',
      'phase7f-openalex-persian-titles.v1.json'
    );
  const defaultPhase7EPath =
    phase7EPackPath ??
    path.resolve(
      process.cwd(),
      'artifacts',
      'phase7e',
      'kaikki-fallback-recovered-full.json'
    );

  if (!fs.existsSync(defaultCorpusPath)) {
    throw new Error(`[FAIL CLOSED] Corpus file not found at ${defaultCorpusPath}`);
  }

  const rawCorpus = JSON.parse(
    fs.readFileSync(defaultCorpusPath, 'utf8')
  ) as CoverageCorpusFile;

  let fallbackRepo = new EvidenceFallbackRepository(DEFAULT_EVIDENCE_FALLBACK_PACK);
  if (fs.existsSync(defaultPhase7EPath)) {
    const pack = JSON.parse(fs.readFileSync(defaultPhase7EPath, 'utf8')) as EvidenceFallbackPack;
    const union = buildEvaluationFallbackUnion(DEFAULT_EVIDENCE_FALLBACK_PACK, pack);
    fallbackRepo = union.repository;
  }

  // 1. Filter strictly for DIAGNOSTIC cases
  const diagnosticCases = rawCorpus.cases.filter((c: CoverageCorpusCase) => c.split === 'DIAGNOSTIC');

  // 2. Identify cases that contain genuine unresolved lexical tokens at runtime
  const candidateCases: Array<{
    caseId: string;
    sourceId: string;
    sourceTitle: string;
    normalizedTitle: string;
    workType: string;
    publicationYear?: number;
    unresolvedLexicalMisses: string[];
    selectionHash: string;
  }> = [];

  for (const c of diagnosticCases) {
    const normalized = normalizePersian(c.rawText).normalizedInput;
    const result = transliterate(
      c.rawText,
      'ijmes_citation_title',
      [],
      DEFAULT_LEXICON_REPOSITORY,
      fallbackRepo
    );

    // Find actual unresolved Persian lexical tokens
    const unresolvedTokens = result.tokens.filter(
      (token) => token.tokenType === 'persian-word' && token.status === 'UNRESOLVED'
    );

    if (unresolvedTokens.length > 0) {
      const unresolvedMisses = Array.from(
        new Set(unresolvedTokens.map((t) => t.normalizedSurface))
      );

      const hash = crypto
        .createHash('sha256')
        .update(`${SELECTION_SALT}:${c.id}:${c.sourceId}`)
        .digest('hex');

      candidateCases.push({
        caseId: c.id,
        sourceId: c.sourceId,
        sourceTitle: c.rawText,
        normalizedTitle: normalized,
        workType: String(c.metadata?.workType ?? 'article'),
        publicationYear: c.metadata?.publicationYear,
        unresolvedLexicalMisses: unresolvedMisses,
        selectionHash: hash
      });
    }
  }

  // 3. Deterministic SHA-256 sort
  candidateCases.sort((a, b) => a.selectionHash.localeCompare(b.selectionHash));

  // 4. Take top targetCount
  const selected = candidateCases.slice(0, targetCount).map((c, index) => ({
    rank: index + 1,
    ...c
  }));

  return selected;
}
