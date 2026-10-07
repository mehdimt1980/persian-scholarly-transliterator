/**
 * Deterministic identity and confidence tier derivation for Phase 7C fallback entries.
 */

import type { EvidenceDerivedConfidenceTier } from './types';

export function computeDeterministicFingerprint(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function deriveConfidenceTier(
  sourceProfiles: Array<'CLASSICAL_DARI' | 'IRANIAN'>,
  evidenceCount: number
): EvidenceDerivedConfidenceTier {
  const hasClassical = sourceProfiles.includes('CLASSICAL_DARI');
  const hasIranian = sourceProfiles.includes('IRANIAN');

  if (hasClassical && hasIranian) {
    return 'CROSS_PROFILE_CONSENSUS';
  }

  if (evidenceCount >= 2) {
    return 'MULTI_OBSERVATION_CONSENSUS';
  }

  return 'SINGLE_OBSERVATION_DETERMINISTIC';
}

export function computeFallbackEntryId(
  packVersion: string,
  normalizedForm: string,
  hypothesis: string,
  candidateAnalysisId: string,
  evidenceIds: string[]
): string {
  const sortedEvidence = [...evidenceIds].sort().join(',');
  const basis = `${packVersion}|${normalizedForm}|${hypothesis}|${candidateAnalysisId}|${sortedEvidence}`;
  return `fb-kaikki-${computeDeterministicFingerprint(basis)}`;
}
