/**
 * Pure resolver function for Phase 7C Evidence Fallback proposals.
 *
 * Core scholarly invariant:
 *   Produces a displayable, reviewable provisional proposal for genuine lexical misses.
 *   canonicalTransliteration remains STRICTLY null.
 *   automaticCanonical remains STRICTLY null.
 *   status remains STRICTLY UNRESOLVED.
 *   Zero modifications to authoritative lexicon.
 */

import { consonantalScaffold } from '../../../../data/ijmes-mappings';
import { RULES } from '../../../provenance';
import { renderCanonicalForProfile } from '../../../profiles';
import type {
  AutomaticTokenSnapshot,
  ProfileId,
  RuleDefinition,
  Token,
  TokenAnalysis,
  TokenResult
} from '../../../types';
import type { EvidenceFallbackRepository } from './repository';
import type { EvidenceDerivedProposal } from './types';

export function resolveEvidenceFallback(
  token: Token,
  analysis: TokenAnalysis,
  fallbackRepo: EvidenceFallbackRepository,
  profile: ProfileId
): TokenResult | null {
  const fallbackEntry = fallbackRepo.findByNormalized(analysis.lookupForm);
  if (!fallbackEntry) {
    return null;
  }

  const hypothesis = fallbackEntry.hypothesis;
  const renderedProposal = renderCanonicalForProfile(hypothesis, profile);

  const appliedRules: RuleDefinition[] = [
    RULES.consonantalScaffold,
    RULES.evidenceDerivedFallback,
    ...analysis.provenance
  ];

  const evidenceDerivedProposal: EvidenceDerivedProposal = {
    hypothesis,
    renderedProposal,
    source: 'KAIKKI_WIKTIONARY',
    consensusStatus: 'UNANIMOUS_DETERMINISTIC',
    confidenceTier: fallbackEntry.confidenceTier,
    candidateAnalysisId: fallbackEntry.candidateAnalysisId,
    fallbackEntryId: fallbackEntry.id,
    packVersion: fallbackRepo.getManifest().packVersion,
    evidenceCount: fallbackEntry.evidenceCount,
    sourceProfiles: [...fallbackEntry.sourceProfiles],
    evidenceRefs: [...fallbackEntry.interpretations]
  };

  const warnings = [
    'Evidence-derived reading shown; review is required before final copying.',
    ...analysis.warnings
  ];

  const scaffold = consonantalScaffold(token.normalizedSurface);

  const automatic: AutomaticTokenSnapshot = {
    status: 'UNRESOLVED',
    canonicalTransliteration: null,
    rendered: renderedProposal,
    diagnosticScaffold: scaffold,
    confidence: 0.5,
    appliedRules: [...appliedRules],
    lexicalSources: [
      `Wiktionary evidence (${fallbackEntry.confidenceTier.toLowerCase().replace(/_/g, ' ')}, ${fallbackEntry.evidenceCount} observation${fallbackEntry.evidenceCount === 1 ? '' : 's'})`
    ],
    warnings: [...warnings],
    alternatives: [hypothesis],
    blockingReason: 'EVIDENCE_DERIVED_REVIEW_REQUIRED',
    evidenceDerivedProposal
  };

  return {
    normalizedSurface: token.normalizedSurface,
    tokenType: token.type,
    canonicalTransliteration: null,
    rendered: renderedProposal,
    diagnosticScaffold: scaffold,
    status: 'UNRESOLVED',
    automaticStatus: 'UNRESOLVED',
    automaticCanonical: null,
    confidence: 0.5,
    appliedRules,
    lexicalSources: [
      `Wiktionary evidence (${fallbackEntry.confidenceTier.toLowerCase().replace(/_/g, ' ')}, ${fallbackEntry.evidenceCount} observation${fallbackEntry.evidenceCount === 1 ? '' : 's'})`
    ],
    warnings,
    alternatives: [hypothesis],
    normalizedStart: token.normalizedStart,
    normalizedEnd: token.normalizedEnd,
    automatic,
    blockingReason: 'EVIDENCE_DERIVED_REVIEW_REQUIRED',
    evidenceDerivedProposal
  };
}
