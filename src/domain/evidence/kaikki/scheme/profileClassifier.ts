/**
 * Evidence-based source profile classifier for Wiktionary Persian romanizations.
 *
 * Core scholarly invariant:
 *   Profile classification MUST derive from explicit source metadata and tags.
 *   NEVER infer source profile from typography (e.g. â vs ā) alone.
 *   Fail closed: untagged records are UNCLASSIFIED; mixed tags are CONFLICTING.
 */

import type { KaikkiEvidenceMetadata } from '../types';
import type { WiktionaryPersianRomanizationProfile } from './types';

const CLASSICAL_DARI_TAGS = new Set([
  'classical-persian',
  'classical',
  'early-classical-persian',
  'dari',
  'hazaragi'
]);

const IRANIAN_TAGS = new Set([
  'iranian-persian',
  'iranian',
  'tehrani',
  'standard-iranian',
  'iran'
]);

/**
 * Classify the source romanization profile from verified per-observation metadata tags.
 */
export function classifyWiktionaryProfile(
  metadata: Partial<KaikkiEvidenceMetadata>
): WiktionaryPersianRomanizationProfile {
  // Check specific romanization tags first, then fall back to variety tags if empty
  const tagsToCheck =
    metadata.romanizationTags && metadata.romanizationTags.length > 0
      ? metadata.romanizationTags
      : metadata.varietyTags;

  if (!tagsToCheck || tagsToCheck.length === 0) {
    return 'UNCLASSIFIED';
  }

  let hasClassicalDari = false;
  let hasIranian = false;

  for (const rawTag of tagsToCheck) {
    const normalized = rawTag.trim().toLowerCase();
    if (CLASSICAL_DARI_TAGS.has(normalized)) {
      hasClassicalDari = true;
    }
    if (IRANIAN_TAGS.has(normalized)) {
      hasIranian = true;
    }
  }

  if (hasClassicalDari && hasIranian) {
    return 'CONFLICTING';
  }

  if (hasClassicalDari) {
    return 'CLASSICAL_DARI';
  }

  if (hasIranian) {
    return 'IRANIAN';
  }

  return 'UNCLASSIFIED';
}

export class WiktionaryPersianProfileClassifier {
  public classifyProfile(tags?: string[]): WiktionaryPersianRomanizationProfile {
    return classifyWiktionaryProfile({ romanizationTags: tags });
  }

  public classifyMetadata(metadata: KaikkiEvidenceMetadata): WiktionaryPersianRomanizationProfile {
    return classifyWiktionaryProfile(metadata);
  }
}

