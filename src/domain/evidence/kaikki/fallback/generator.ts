/**
 * Generator for Phase 7C Evidence Fallback Packs.
 *
 * Pipeline:
 *   Kaikki JSONL Dataset
 *          ↓
 *   Phase 7A Extraction & Candidate Synthesis
 *          ↓
 *   Phase 7B Source Scheme Interpretation
 *          ↓
 *   Phase 7B Exact-Closure Consensus Aggregation
 *          ↓
 *   Eligibility Filtering (Strict Unanimous Deterministic Only)
 *          ↓
 *   Compact Immutable Runtime Fallback Pack
 */

import fs from 'node:fs';
import { computeFileSha256 } from '../statistics';
import { KaikkiEvidenceConnector } from '../connector';
import { WiktionaryPersianSchemeInterpreter } from '../scheme/interpreter';
import { KaikkiCandidateSchemeAggregator } from '../scheme/aggregator';
import { computeFallbackEntryId, deriveConfidenceTier } from './identity';
import type {
  EvidenceDerivedReference,
  EvidenceFallbackEntry,
  EvidenceFallbackPack,
  EvidenceFallbackPackManifest
} from './types';
import type { KaikkiParseOptions } from '../types';

export interface FallbackGeneratorOptions extends KaikkiParseOptions {
  packVersion?: string;
  wiktionaryDumpDate?: string;
  wiktextractVersion?: string;
  maxPackBytes?: number;
}

export const DEFAULT_MAX_PACK_BYTES = 5 * 1024 * 1024; // 5 MB ceiling for browser bundle guard

export async function generateFallbackPack(
  inputFilePath: string,
  options: FallbackGeneratorOptions = {}
): Promise<EvidenceFallbackPack> {
  if (!fs.existsSync(inputFilePath)) {
    throw new Error(`Input file not found: ${inputFilePath}`);
  }

  const inputSha256 = await computeFileSha256(inputFilePath);

  const connector = new KaikkiEvidenceConnector();
  const parseResult = await connector.processFile(inputFilePath, options);

  const interpreter = new WiktionaryPersianSchemeInterpreter();
  const aggregator = new KaikkiCandidateSchemeAggregator();

  const candidates = parseResult.candidates ?? [];
  const observations = parseResult.observations ?? [];
  const observationMap = new Map(observations.map((o) => [o.evidence.id, o]));

  const entries: Record<string, EvidenceFallbackEntry> = {};
  const packVersion = options.packVersion ?? '1.0.0';

  for (const candidate of candidates) {
    const candidateObservations = [];
    for (const eId of candidate.evidenceIds) {
      const obs = observationMap.get(eId);
      if (obs) candidateObservations.push(obs);
    }

    // Must satisfy exact closure
    if (candidateObservations.length !== candidate.evidenceIds.length) {
      continue;
    }

    const analysis = aggregator.analyzeCandidate(candidate, candidateObservations, interpreter);

    // Strict eligibility check for runtime fallback
    if (
      analysis.consensusStatus !== 'UNANIMOUS_DETERMINISTIC' ||
      !analysis.consensusTargetHypothesis ||
      candidate.proposedCanonical !== null
    ) {
      continue;
    }

    // Verify all contributing interpretations are non-blocked deterministic equivalents
    const allValid = analysis.interpretations.every(
      (interp) =>
        interp.targetHypothesis !== null &&
        interp.blockers.length === 0 &&
        (interp.status === 'DIRECT_EQUIVALENT' || interp.status === 'DETERMINISTIC_EQUIVALENT')
    );

    if (!allValid || analysis.interpretations.length === 0) {
      continue;
    }

    const sourceProfiles = Array.from(
      new Set(
        analysis.interpretations
          .map((i) => i.sourceProfile)
          .filter((p): p is 'CLASSICAL_DARI' | 'IRANIAN' => p === 'CLASSICAL_DARI' || p === 'IRANIAN')
      )
    ).sort();

    if (sourceProfiles.length === 0) {
      continue;
    }

    const evidenceRefs: EvidenceDerivedReference[] = analysis.interpretations.map((interp) => {
      const obs = observationMap.get(interp.evidenceId);
      return {
        evidenceId: interp.evidenceId,
        sourceRecordId: obs?.metadata.rawSourceWord,
        romanization: interp.rawObservedRomanization,
        profile: interp.sourceProfile as 'CLASSICAL_DARI' | 'IRANIAN',
        sourceUri: obs?.metadata.rawSourceWord
          ? `https://en.wiktionary.org/wiki/${encodeURIComponent(obs.metadata.rawSourceWord)}`
          : undefined
      };
    });

    const confidenceTier = deriveConfidenceTier(sourceProfiles, evidenceRefs.length);

    const entryId = computeFallbackEntryId(
      packVersion,
      candidate.normalizedForm,
      analysis.consensusTargetHypothesis,
      analysis.id,
      candidate.evidenceIds
    );

    const fallbackEntry: EvidenceFallbackEntry = {
      id: entryId,
      normalizedForm: candidate.normalizedForm,
      hypothesis: analysis.consensusTargetHypothesis,
      consensusStatus: 'UNANIMOUS_DETERMINISTIC',
      confidenceTier,
      candidateAnalysisId: analysis.id,
      evidenceCount: evidenceRefs.length,
      sourceProfiles,
      interpretations: evidenceRefs,
      generatedFrom: {
        acquisitionVersion: '1.0.0',
        interpreterVersion: analysis.interpretations[0]?.interpreterVersion ?? '1.0.0',
        ruleSetVersion: analysis.interpretations[0]?.ruleSetVersion ?? '1.0.0',
        aggregatorVersion: analysis.aggregatorVersion
      }
    };

    entries[candidate.normalizedForm] = fallbackEntry;
  }

  const manifest: EvidenceFallbackPackManifest = {
    packVersion,
    generatedAt: new Date().toISOString(),
    inputSha256,
    wiktionaryDumpDate: options.wiktionaryDumpDate,
    wiktextractVersion: options.wiktextractVersion,
    extractorVersion: '1.0.0',
    interpreterVersion: '1.0.0',
    ruleSetVersion: '1.0.0',
    aggregatorVersion: '1.0.0',
    entryCount: Object.keys(entries).length
  };

  const pack: EvidenceFallbackPack = {
    manifest,
    entries
  };

  const packJson = JSON.stringify(pack, null, 2);
  const maxBytes = options.maxPackBytes ?? DEFAULT_MAX_PACK_BYTES;
  const actualBytes = Buffer.byteLength(packJson, 'utf8');

  if (actualBytes > maxBytes) {
    throw new Error(
      `Generated fallback pack exceeds size ceiling: ${actualBytes} bytes > allowed ${maxBytes} bytes`
    );
  }

  return pack;
}
