/**
 * Deterministic identity generators for Kaikki scheme interpretations and candidate analyses (Phase 7B).
 */

import crypto from 'node:crypto';
import type { KaikkiEvidenceMetadata } from '../types';
import type { WiktionaryPersianRomanizationProfile } from './types';

/**
 * Compute deterministic hash fingerprint of source metadata.
 */
export function computeMetadataFingerprint(metadata: KaikkiEvidenceMetadata): string {
  const hash = crypto.createHash('sha256');
  hash.update(metadata.rawSourceWord ?? '');
  hash.update('\0');
  hash.update(metadata.pos ?? '');
  hash.update('\0');
  hash.update(String(metadata.etymologyNumber ?? ''));
  hash.update('\0');
  hash.update(String(metadata.headNr ?? ''));
  hash.update('\0');
  hash.update(metadata.lemmaStatus ?? '');
  hash.update('\0');

  const tags = [...(metadata.romanizationTags ?? []), ...(metadata.varietyTags ?? [])].sort();
  for (const t of tags) {
    hash.update(t);
    hash.update('\0');
  }

  return hash.digest('hex').slice(0, 16);
}

/**
 * Generate deterministic identifier for an individual scheme interpretation.
 */
export function generateKaikkiInterpretationId(params: {
  evidenceId: string;
  sourceProfile: WiktionaryPersianRomanizationProfile;
  sourceMetadataFingerprint: string;
  targetScheme: 'IJMES';
  interpreterVersion: string;
  ruleSetVersion: string;
  persianForm: string;
  observedRomanization: string;
}): string {
  const hash = crypto.createHash('sha256');
  hash.update(params.evidenceId);
  hash.update('\0');
  hash.update(params.sourceProfile);
  hash.update('\0');
  hash.update(params.sourceMetadataFingerprint);
  hash.update('\0');
  hash.update(params.targetScheme);
  hash.update('\0');
  hash.update(params.interpreterVersion);
  hash.update('\0');
  hash.update(params.ruleSetVersion);
  hash.update('\0');
  hash.update(params.persianForm);
  hash.update('\0');
  hash.update(params.observedRomanization);

  const digest = hash.digest('hex').slice(0, 16);
  return `interp-wikt-${digest}`;
}

/**
 * Generate deterministic identifier for a candidate-level scheme analysis.
 */
export function generateKaikkiCandidateAnalysisId(params: {
  candidateId: string;
  interpretationIds: string[];
  aggregatorVersion: string;
}): string {
  const hash = crypto.createHash('sha256');
  hash.update(params.candidateId);
  hash.update('\0');
  hash.update(params.aggregatorVersion);

  const sortedIds = [...params.interpretationIds].sort();
  for (const id of sortedIds) {
    hash.update('\0');
    hash.update(id);
  }

  const digest = hash.digest('hex').slice(0, 16);
  return `analysis-wikt-${digest}`;
}
