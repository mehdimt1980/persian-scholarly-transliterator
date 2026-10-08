/**
 * Safe fallback repository union builder for Phase 7F evaluation.
 *
 * Scholarly Invariant:
 *   - Experimental Phase 7E fallback pack is combined with production fallback ONLY via dependency injection.
 *   - Identical hypotheses on the same normalized form are deduplicated.
 *   - Conflicting hypotheses on the same normalized form are recorded as EVALUATION_FALLBACK_CONFLICT
 *     and blocked from entering the evaluation fallback union.
 *   - Production files and DEFAULT_EVIDENCE_FALLBACK_REPOSITORY are never mutated.
 */

import { EvidenceFallbackRepository } from '../evidence/kaikki/fallback/repository';
import type {
  EvidenceFallbackEntry,
  EvidenceFallbackPack
} from '../evidence/kaikki/fallback/types';
import type { FallbackUnionConflict } from './types';

export interface EvaluationFallbackUnionResult {
  repository: EvidenceFallbackRepository;
  pack: EvidenceFallbackPack;
  conflicts: FallbackUnionConflict[];
  totalEntries: number;
  deduplicatedCount: number;
}

export function buildEvaluationFallbackUnion(
  productionPack: EvidenceFallbackPack,
  phase7EPack: EvidenceFallbackPack
): EvaluationFallbackUnionResult {
  const conflicts: FallbackUnionConflict[] = [];
  const mergedEntries: Record<string, EvidenceFallbackEntry> = {};
  let deduplicatedCount = 0;

  const prodEntries = productionPack.entries ?? {};
  const expEntries = phase7EPack.entries ?? {};

  // First copy all production entries
  for (const [form, prodEntry] of Object.entries(prodEntries)) {
    mergedEntries[form] = { ...prodEntry };
  }

  // Next inspect Phase 7E experimental entries
  for (const [form, expEntry] of Object.entries(expEntries)) {
    if (mergedEntries[form]) {
      const prodHypothesis = mergedEntries[form].hypothesis;
      const expHypothesis = expEntry.hypothesis;

      if (prodHypothesis === expHypothesis) {
        // Safe deduplication: keep production entry, increment deduplicated count
        deduplicatedCount += 1;
      } else {
        // Conflicting hypotheses: remove from union, record conflict
        conflicts.push({
          normalizedForm: form,
          productionHypothesis: prodHypothesis,
          phase7EHypothesis: expHypothesis,
          reason: 'EVALUATION_FALLBACK_CONFLICT'
        });
        delete mergedEntries[form];
      }
    } else {
      mergedEntries[form] = { ...expEntry };
    }
  }

  const combinedPack: EvidenceFallbackPack = {
    manifest: {
      packVersion: '7f-evaluation-union',
      generatedAt: new Date().toISOString(),
      inputSha256: phase7EPack.manifest?.inputSha256 ?? 'evaluation-union',
      extractorVersion: phase7EPack.manifest?.extractorVersion ?? '1.0.0',
      interpreterVersion: phase7EPack.manifest?.interpreterVersion ?? '1.0.0',
      ruleSetVersion: phase7EPack.manifest?.ruleSetVersion ?? '1.0.0',
      aggregatorVersion: phase7EPack.manifest?.aggregatorVersion ?? '1.0.0',
      entryCount: Object.keys(mergedEntries).length
    },
    entries: mergedEntries
  };

  const repository = new EvidenceFallbackRepository(combinedPack);

  return {
    repository,
    pack: combinedPack,
    conflicts,
    totalEntries: Object.keys(mergedEntries).length,
    deduplicatedCount
  };
}
