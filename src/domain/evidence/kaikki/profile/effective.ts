/**
 * Pure helper to resolve effective Wiktionary source profile for Phase 7E.
 *
 * Precedence:
 *   1. Explicit per-observation profile (EXPLICIT)
 *   2. Trusted structural recovery (RECOVERED_STRUCTURAL)
 *   3. Trusted paired recovery (RECOVERED_PAIRED)
 *   4. UNCLASSIFIED
 *
 * If explicit and recovered evidence disagree -> CONFLICTING.
 */

import { classifyWiktionaryProfile } from '../scheme/profileClassifier';
import type { WiktionaryPersianRomanizationProfile } from '../scheme/types';
import type { KaikkiEvidenceMetadata } from '../types';
import type { ProfileOrigin, WiktionaryProfileRecoveryResult } from './types';

export interface EffectiveProfileResolution {
  effectiveProfile: WiktionaryPersianRomanizationProfile;
  profileOrigin: ProfileOrigin;
  recoveryId?: string;
  isRecovered: boolean;
}

export function resolveEffectiveWiktionaryProfile(
  metadata: KaikkiEvidenceMetadata,
  recovery?: WiktionaryProfileRecoveryResult | null
): EffectiveProfileResolution {
  const explicitProfile = classifyWiktionaryProfile(metadata);

  if (explicitProfile === 'CONFLICTING') {
    return {
      effectiveProfile: 'CONFLICTING',
      profileOrigin: 'EXPLICIT',
      isRecovered: false
    };
  }

  // Tier 1: Explicit per-observation profile tag
  if (explicitProfile === 'CLASSICAL_DARI' || explicitProfile === 'IRANIAN') {
    if (
      recovery &&
      recovery.recoveryStatus === 'RECOVERED' &&
      recovery.recoveredProfile !== explicitProfile &&
      recovery.recoveredProfile !== 'UNCLASSIFIED'
    ) {
      // Conflict between explicit and recovered
      return {
        effectiveProfile: 'CONFLICTING',
        profileOrigin: 'EXPLICIT',
        recoveryId: recovery.id,
        isRecovered: false
      };
    }

    return {
      effectiveProfile: explicitProfile,
      profileOrigin: 'EXPLICIT',
      recoveryId: recovery?.id,
      isRecovered: false
    };
  }

  // Tier 2 & 3: Recovered Profile from Engine
  if (recovery && recovery.recoveryStatus === 'RECOVERED') {
    if (recovery.recoveredProfile === 'CLASSICAL_DARI' || recovery.recoveredProfile === 'IRANIAN') {
      return {
        effectiveProfile: recovery.recoveredProfile,
        profileOrigin: recovery.profileOrigin,
        recoveryId: recovery.id,
        isRecovered: true
      };
    }
  }

  return {
    effectiveProfile: 'UNCLASSIFIED',
    profileOrigin: 'UNCLASSIFIED',
    recoveryId: recovery?.id,
    isRecovered: false
  };
}
