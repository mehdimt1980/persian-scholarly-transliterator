import crypto from 'node:crypto';
import { normalizePersian } from '../normalization';
import {
  ConflictingObservation,
  LexicalCandidate,
  LexicalCandidateStatus,
  LexicalEntityType,
  LexicalEvidence
} from './types';

/**
 * Generate a deterministic identifier for a lexical evidence record.
 */
export function generateEvidenceId(params: {
  sourceId: string;
  sourceRecordId: string | null;
  sourceField: string | null;
  persianForm: string;
  observedRomanization: string | null;
  romanizationScheme: string;
}): string {
  const hash = crypto.createHash('sha256');
  hash.update(params.sourceId.trim());
  hash.update('|');
  hash.update(params.sourceRecordId ? params.sourceRecordId.trim() : '');
  hash.update('|');
  hash.update(params.sourceField ? params.sourceField.trim() : '');
  hash.update('|');
  hash.update(params.persianForm.trim());
  hash.update('|');
  hash.update(params.observedRomanization ? params.observedRomanization.trim() : '');
  hash.update('|');
  hash.update(params.romanizationScheme.trim());
  const digest = hash.digest('hex').slice(0, 16);
  return `evi-${params.sourceId.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${digest}`;
}

/**
 * Generate a deterministic identifier for a candidate constructed from Persian form and evidence IDs.
 */
export function generateCandidateId(persianForm: string, evidenceIds: string[]): string {
  const hash = crypto.createHash('sha256');
  hash.update(persianForm.trim());
  const sortedIds = [...evidenceIds].sort();
  for (const id of sortedIds) {
    hash.update('|');
    hash.update(id);
  }
  const digest = hash.digest('hex').slice(0, 16);
  return `cand-${digest}`;
}

export interface CandidateSynthesisOptions {
  proposedCanonical?: string | null;
  proposedProfile?: 'ijmes_full' | 'ijmes_title';
  entityType?: LexicalEntityType;
  notes?: string;
  derivedAt?: string;
}

/**
 * Synthesize a LexicalCandidate from one or more LexicalEvidence records.
 *
 * Core invariant:
 *   Constructing a candidate aggregates external observations and flags conflicts,
 *   but DOES NOT grant authoritative status. The candidate status starts as
 *   UNREVIEWED (or REVIEW_REQUIRED if conflicting romanizations are observed).
 */
export function synthesizeCandidateFromEvidence(
  persianForm: string,
  evidenceList: LexicalEvidence[],
  options?: CandidateSynthesisOptions
): LexicalCandidate {
  if (!evidenceList || evidenceList.length === 0) {
    throw new Error(`Cannot synthesize candidate for "${persianForm}" without supporting evidence.`);
  }

  const normalized = normalizePersian(persianForm).normalizedInput;
  const evidenceIds = evidenceList.map((e) => e.id);

  // Detect conflicting observations
  const conflicts: ConflictingObservation[] = [];
  const romanizations = new Map<string, LexicalEvidence[]>();

  for (const evi of evidenceList) {
    const romKey = evi.observedRomanization ? evi.observedRomanization.trim() : '__NO_ROMANIZATION__';
    const group = romanizations.get(romKey) ?? [];
    group.push(evi);
    romanizations.set(romKey, group);
  }

  // If there are multiple distinct non-null romanizations observed across evidence, record conflicts
  const distinctRomanizations = [...romanizations.keys()].filter((k) => k !== '__NO_ROMANIZATION__');
  if (distinctRomanizations.length > 1) {
    for (const evi of evidenceList) {
      if (evi.observedRomanization) {
        conflicts.push({
          evidenceId: evi.id,
          persianForm: evi.persianForm,
          observedRomanization: evi.observedRomanization,
          romanizationScheme: evi.romanizationScheme,
          conflictReason: `Disagrees with alternative external romanization(s): ${distinctRomanizations
            .filter((r) => r !== evi.observedRomanization)
            .join(', ')}`
        });
      }
    }
  }

  const defaultEntityType: LexicalEntityType = evidenceList[0].entityType ?? 'WORD';
  const resolvedEntityType: LexicalEntityType = options?.entityType ?? defaultEntityType;

  const status: LexicalCandidateStatus = conflicts.length > 0 ? 'REVIEW_REQUIRED' : 'UNREVIEWED';

  const candidateId = generateCandidateId(persianForm, evidenceIds);

  return {
    id: candidateId,
    persianForm,
    normalizedForm: normalized,
    proposedCanonical: options?.proposedCanonical ?? null,
    proposedProfile: options?.proposedProfile,
    entityType: resolvedEntityType,
    evidenceIds,
    conflicts,
    status,
    derivationProvenance: {
      derivedAt: options?.derivedAt ?? new Date().toISOString(),
      strategy: evidenceList.length > 1 ? 'MULTI_EVIDENCE_SYNTHESIS' : 'SINGLE_EVIDENCE',
      notes: options?.notes
    },
    notes: options?.notes
  };
}
