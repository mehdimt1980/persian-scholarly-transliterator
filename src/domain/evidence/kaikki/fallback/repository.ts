/**
 * Runtime read-only repository for Phase 7C Evidence Fallback entries.
 *
 * Core scholarly invariant:
 *   Evidence fallback repository is completely separate from LexiconRepository.
 *   Provides non-authoritative candidate hypotheses for genuine lexical misses.
 *   Zero mutations to authoritative lexicon.
 */

import type {
  EvidenceFallbackEntry,
  EvidenceFallbackPack,
  EvidenceFallbackPackManifest
} from './types';

export class EvidenceFallbackRepository {
  private readonly manifest: EvidenceFallbackPackManifest;
  private readonly entryMap: Map<string, EvidenceFallbackEntry>;

  constructor(pack?: EvidenceFallbackPack) {
    if (!pack) {
      this.manifest = {
        packVersion: '0.0.0',
        generatedAt: new Date(0).toISOString(),
        inputSha256: '',
        extractorVersion: '1.0.0',
        interpreterVersion: '1.0.0',
        ruleSetVersion: '1.0.0',
        aggregatorVersion: '1.0.0',
        entryCount: 0
      };
      this.entryMap = new Map();
      return;
    }

    this.validatePack(pack);
    this.manifest = Object.freeze({ ...pack.manifest });
    this.entryMap = new Map();
    for (const [key, entry] of Object.entries(pack.entries)) {
      this.entryMap.set(key, Object.freeze({ ...entry }));
    }
  }

  private validatePack(pack: EvidenceFallbackPack): void {
    if (!pack || !pack.manifest || !pack.entries) {
      throw new Error('Invalid EvidenceFallbackPack: missing manifest or entries');
    }
    if (!pack.manifest.packVersion || typeof pack.manifest.entryCount !== 'number') {
      throw new Error('Invalid EvidenceFallbackPack: malformed manifest');
    }
    const entries = Object.entries(pack.entries);
    if (entries.length !== pack.manifest.entryCount) {
      throw new Error(
        `EvidenceFallbackPack entryCount mismatch: manifest declares ${pack.manifest.entryCount}, but found ${entries.length}`
      );
    }
    const VALID_CONFIDENCE_TIERS = new Set([
      'CROSS_PROFILE_CONSENSUS',
      'MULTI_OBSERVATION_CONSENSUS',
      'SINGLE_OBSERVATION_DETERMINISTIC'
    ]);
    const VALID_SOURCE_PROFILES = new Set(['CLASSICAL_DARI', 'IRANIAN']);

    const seenIds = new Set<string>();
    for (const [key, entry] of entries) {
      if (!entry.id || typeof entry.id !== 'string' || entry.id.trim().length === 0) {
        throw new Error('EvidenceFallbackPack entry has empty id');
      }
      if (entry.normalizedForm !== key) {
        throw new Error(
          `EvidenceFallbackPack key mismatch: entry.normalizedForm "${entry.normalizedForm}" !== key "${key}"`
        );
      }
      if (seenIds.has(entry.id)) {
        throw new Error(`EvidenceFallbackPack duplicate entry id: ${entry.id}`);
      }
      seenIds.add(entry.id);
      if (entry.consensusStatus !== 'UNANIMOUS_DETERMINISTIC') {
        throw new Error(
          `EvidenceFallbackPack entry ${entry.id} is not UNANIMOUS_DETERMINISTIC (${entry.consensusStatus})`
        );
      }
      if (!entry.hypothesis || typeof entry.hypothesis !== 'string' || entry.hypothesis.trim().length === 0) {
        throw new Error(`EvidenceFallbackPack entry ${entry.id} has null or empty hypothesis`);
      }
      if (!entry.confidenceTier || !VALID_CONFIDENCE_TIERS.has(entry.confidenceTier)) {
        throw new Error(`EvidenceFallbackPack entry ${entry.id} has invalid confidenceTier: ${entry.confidenceTier}`);
      }
      if (!Array.isArray(entry.sourceProfiles) || entry.sourceProfiles.length === 0) {
        throw new Error(`EvidenceFallbackPack entry ${entry.id} has empty sourceProfiles`);
      }
      for (const p of entry.sourceProfiles) {
        if (!VALID_SOURCE_PROFILES.has(p)) {
          throw new Error(`EvidenceFallbackPack entry ${entry.id} has invalid sourceProfile: ${p}`);
        }
      }
      if (!Array.isArray(entry.interpretations) || entry.interpretations.length === 0) {
        throw new Error(`EvidenceFallbackPack entry ${entry.id} has empty interpretations`);
      }
      if (entry.evidenceCount !== entry.interpretations.length) {
        throw new Error(
          `EvidenceFallbackPack entry ${entry.id} evidenceCount mismatch: declares ${entry.evidenceCount}, interpretations length is ${entry.interpretations.length}`
        );
      }
      for (const interp of entry.interpretations) {
        if (!interp.evidenceId || typeof interp.evidenceId !== 'string' || interp.evidenceId.trim().length === 0) {
          throw new Error(`EvidenceFallbackPack entry ${entry.id} has empty interpretation evidenceId`);
        }
        if (!interp.romanization || typeof interp.romanization !== 'string' || interp.romanization.trim().length === 0) {
          throw new Error(`EvidenceFallbackPack entry ${entry.id} has empty interpretation romanization`);
        }
        if (!VALID_SOURCE_PROFILES.has(interp.profile)) {
          throw new Error(`EvidenceFallbackPack entry ${entry.id} has invalid interpretation profile: ${interp.profile}`);
        }
      }
      if (!entry.candidateAnalysisId || typeof entry.candidateAnalysisId !== 'string' || entry.candidateAnalysisId.trim().length === 0) {
        throw new Error(`EvidenceFallbackPack entry ${entry.id} has empty candidateAnalysisId`);
      }
      if (
        !entry.generatedFrom ||
        !entry.generatedFrom.acquisitionVersion ||
        !entry.generatedFrom.interpreterVersion ||
        !entry.generatedFrom.ruleSetVersion ||
        !entry.generatedFrom.aggregatorVersion
      ) {
        throw new Error(`EvidenceFallbackPack entry ${entry.id} has incomplete generatedFrom version metadata`);
      }
    }
  }

  public findByNormalized(normalizedForm: string): EvidenceFallbackEntry | undefined {
    return this.entryMap.get(normalizedForm);
  }

  public getManifest(): EvidenceFallbackPackManifest {
    return this.manifest;
  }

  public getEntryCount(): number {
    return this.entryMap.size;
  }

  public assertValid(): void {
    if (this.entryMap.size !== this.manifest.entryCount) {
      throw new Error('EvidenceFallbackRepository internal count mismatch');
    }
  }
}
