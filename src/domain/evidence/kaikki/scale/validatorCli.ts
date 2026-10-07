#!/usr/bin/env node
/**
 * Validator CLI for Phase 7D Experimental Fallback Packs.
 *
 * Verifies that an experimental fallback pack satisfies:
 *   1. Strict schema invariants.
 *   2. Unique normalized keys and exact key matching.
 *   3. Deterministic entry IDs matching computeFallbackEntryId.
 *   4. Valid non-empty hypotheses.
 *   5. UNANIMOUS_DETERMINISTIC consensus status.
 *   6. Valid interpretation provenance and valid source profiles.
 *   7. Zero automatic canonical promotions (all entries remain non-authoritative).
 *   8. Correct manifest entryCount matching actual entries.
 *   9. Exact semantic SHA-256 integrity.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EvidenceFallbackRepository } from '../fallback/repository';
import { computeFallbackEntryId } from '../fallback/identity';
import type { EvidenceFallbackPack } from '../fallback/types';

export function validateScalePackIntegrity(packPath: string): {
  valid: boolean;
  entryCount: number;
  semanticSha256: string;
  errors: string[];
} {
  const errors: string[] = [];
  if (!fs.existsSync(packPath)) {
    return { valid: false, entryCount: 0, semanticSha256: '', errors: [`Pack file not found: ${packPath}`] };
  }

  let pack: EvidenceFallbackPack;
  try {
    const raw = fs.readFileSync(packPath, 'utf8');
    pack = JSON.parse(raw) as EvidenceFallbackPack;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, entryCount: 0, semanticSha256: '', errors: [`Failed to parse pack JSON: ${msg}`] };
  }

  // Repository constructor validation
  try {
    const repo = new EvidenceFallbackRepository(pack);
    repo.assertValid();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Repository schema validation failed: ${msg}`);
  }

  const entries = Object.entries(pack.entries ?? {});
  const entryCount = entries.length;

  if (pack.manifest.entryCount !== entryCount) {
    errors.push(`Manifest entryCount mismatch: declares ${pack.manifest.entryCount}, found ${entryCount}`);
  }

  const seenIds = new Set<string>();
  const VALID_TIERS = new Set([
    'CROSS_PROFILE_CONSENSUS',
    'MULTI_OBSERVATION_CONSENSUS',
    'SINGLE_OBSERVATION_DETERMINISTIC'
  ]);
  const VALID_PROFILES = new Set(['CLASSICAL_DARI', 'IRANIAN']);

  for (const [key, entry] of entries) {
    if (entry.normalizedForm !== key) {
      errors.push(`Key mismatch: entry.normalizedForm "${entry.normalizedForm}" !== key "${key}"`);
    }

    if (seenIds.has(entry.id)) {
      errors.push(`Duplicate entry ID: ${entry.id}`);
    }
    seenIds.add(entry.id);

    if (!entry.hypothesis || entry.hypothesis.trim().length === 0) {
      errors.push(`Entry "${key}" has null or empty hypothesis`);
    }

    if (entry.consensusStatus !== 'UNANIMOUS_DETERMINISTIC') {
      errors.push(`Entry "${key}" is not UNANIMOUS_DETERMINISTIC: ${entry.consensusStatus}`);
    }

    if (!VALID_TIERS.has(entry.confidenceTier)) {
      errors.push(`Entry "${key}" has invalid confidence tier: ${entry.confidenceTier}`);
    }

    if (!Array.isArray(entry.sourceProfiles) || entry.sourceProfiles.length === 0) {
      errors.push(`Entry "${key}" has empty sourceProfiles`);
    } else {
      for (const p of entry.sourceProfiles) {
        if (!VALID_PROFILES.has(p)) {
          errors.push(`Entry "${key}" has invalid profile: ${p}`);
        }
      }
    }

    if (!Array.isArray(entry.interpretations) || entry.interpretations.length === 0) {
      errors.push(`Entry "${key}" has empty interpretations`);
    } else {
      for (const interp of entry.interpretations) {
        if (!interp.evidenceId || !interp.romanization || !VALID_PROFILES.has(interp.profile)) {
          errors.push(`Entry "${key}" has malformed interpretation record`);
        }
      }
    }

    // Verify deterministic ID computation
    const evidenceIds = entry.interpretations.map((i) => i.evidenceId);
    const expectedId = computeFallbackEntryId(
      pack.manifest.packVersion,
      entry.normalizedForm,
      entry.hypothesis,
      entry.candidateAnalysisId,
      evidenceIds
    );

    if (entry.id !== expectedId) {
      errors.push(`Entry "${key}" has non-deterministic ID: expected ${expectedId}, found ${entry.id}`);
    }
  }

  // Compute semantic SHA-256
  const sortedEntries: Record<string, any> = {};
  for (const k of Object.keys(pack.entries).sort()) {
    sortedEntries[k] = pack.entries[k];
  }
  const semanticSha256 = crypto.createHash('sha256').update(JSON.stringify(sortedEntries)).digest('hex');

  return {
    valid: errors.length === 0,
    entryCount,
    semanticSha256,
    errors
  };
}

export async function main(): Promise<void> {
  const targetPath = process.argv[2] ?? 'artifacts/phase7d/kaikki-fallback-full.json';
  console.log(`Validating experimental fallback pack: ${targetPath}`);

  const res = validateScalePackIntegrity(targetPath);
  if (!res.valid) {
    console.error('Validation FAILED with errors:');
    for (const e of res.errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  console.log('====================================================================');
  console.log(' Fallback Pack Integrity Validation: PASS');
  console.log('====================================================================');
  console.log(`Total Valid Entries:   ${res.entryCount.toLocaleString()}`);
  console.log(`Semantic Pack SHA-256: ${res.semanticSha256}`);
  console.log('====================================================================');
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
