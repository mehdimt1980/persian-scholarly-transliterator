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
    const seenIds = new Set<string>();
    for (const [key, entry] of entries) {
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
      if (
        !entry.candidateAnalysisId ||
        entry.evidenceCount <= 0 ||
        !Array.isArray(entry.interpretations) ||
        entry.interpretations.length === 0
      ) {
        throw new Error(`EvidenceFallbackPack entry ${entry.id} has malformed provenance`);
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
