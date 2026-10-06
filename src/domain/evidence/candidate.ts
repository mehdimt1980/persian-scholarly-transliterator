import crypto from 'node:crypto';
import { normalizePersian } from '../normalization';
import type { ProfileId } from '../types';
import {
  ConflictingObservation,
  LexicalCandidate,
  LexicalCandidateStatus,
  LexicalEntityType,
  LexicalEvidence,
  LexicalEvidenceDerivation,
  RomanizationScheme
} from './types';

/**
 * Standard explicitly-defined romanization schemes where two records claiming
 * the same scheme can be meaningfully compared for direct conflicting readings.
 *
 * UNKNOWN (unidentified scheme) and LOCAL (source-specific/unstandardized)
 * do not establish a shared transliteration contract across observations,
 * and therefore do not produce direct same-scheme conflicts.
 */
export const COMPARABLE_SCHEMES = new Set<RomanizationScheme>([
  'ALA_LC',
  'IJMES',
  'IRANICA',
  'ISO',
  'DMG'
]);

export class CandidateLifecycleError extends Error {
  public readonly candidateId: string;
  public readonly status: LexicalCandidateStatus;

  constructor(candidateId: string, status: LexicalCandidateStatus, message: string) {
    super(`[Candidate ${candidateId} (${status})] Lifecycle violation: ${message}`);
    this.name = 'CandidateLifecycleError';
    this.candidateId = candidateId;
    this.status = status;
  }
}

/**
 * Validate that candidate status is strictly consistent with its human adjudication record.
 *
 * Invariants:
 *   - ACCEPTED requires adjudication.disposition === 'ACCEPTED'
 *   - REJECTED requires adjudication.disposition === 'REJECTED'
 *   - UNREVIEWED and REVIEW_REQUIRED must not carry an adjudication record
 */
export function validateCandidateLifecycle(candidate: LexicalCandidate): void {
  if (candidate.status === 'ACCEPTED') {
    if (!candidate.adjudication) {
      throw new CandidateLifecycleError(
        candidate.id,
        candidate.status,
        'Candidate with status ACCEPTED must contain a completed adjudication record.'
      );
    }
    if (candidate.adjudication.disposition !== 'ACCEPTED') {
      throw new CandidateLifecycleError(
        candidate.id,
        candidate.status,
        `Candidate with status ACCEPTED cannot have adjudication disposition '${candidate.adjudication.disposition}'.`
      );
    }
  } else if (candidate.status === 'REJECTED') {
    if (!candidate.adjudication) {
      throw new CandidateLifecycleError(
        candidate.id,
        candidate.status,
        'Candidate with status REJECTED must contain a completed adjudication record.'
      );
    }
    if (candidate.adjudication.disposition !== 'REJECTED') {
      throw new CandidateLifecycleError(
        candidate.id,
        candidate.status,
        `Candidate with status REJECTED cannot have adjudication disposition '${candidate.adjudication.disposition}'.`
      );
    }
  } else if (candidate.status === 'UNREVIEWED' || candidate.status === 'REVIEW_REQUIRED') {
    if (candidate.adjudication) {
      throw new CandidateLifecycleError(
        candidate.id,
        candidate.status,
        `Candidate with status ${candidate.status} cannot carry a completed adjudication record.`
      );
    }
  }
}

/**
 * Generate a deterministic identifier for a lexical evidence record.
 *
 * Preserves exact raw observation inputs without lossy trimming or silent mutation.
 * For derived aligned segments, includes parent lineage and exact substring spans to prevent
 * cross-position collisions.
 * Uses null-byte delimiters to prevent cross-field concatenation collisions.
 */
export function generateEvidenceId(params: {
  sourceId: string;
  sourceRecordId: string | null;
  sourceField: string | null;
  persianForm: string;
  observedRomanization: string | null;
  romanizationScheme: string;
  derivation?: LexicalEvidenceDerivation;
}): string {
  const hash = crypto.createHash('sha256');
  hash.update(params.sourceId);
  hash.update('\0');
  hash.update(params.sourceRecordId ?? '');
  hash.update('\0');
  hash.update(params.sourceField ?? '');
  hash.update('\0');
  hash.update(params.persianForm);
  hash.update('\0');
  hash.update(params.observedRomanization ?? '');
  hash.update('\0');
  hash.update(params.romanizationScheme);

  if (params.derivation) {
    hash.update('\0');
    hash.update(params.derivation.kind);
    hash.update('\0');
    hash.update(params.derivation.parentEvidenceId);
    hash.update('\0');
    hash.update(String(params.derivation.segmentIndex));
    hash.update('\0');
    hash.update(`${params.derivation.persianSpan.start}:${params.derivation.persianSpan.end}`);
    hash.update('\0');
    hash.update(`${params.derivation.romanizationSpan.start}:${params.derivation.romanizationSpan.end}`);
    hash.update('\0');
    hash.update(params.derivation.alignmentStrategy);
    hash.update('\0');
    hash.update(params.derivation.alignerVersion ?? '');
  }

  const digest = hash.digest('hex').slice(0, 16);
  const cleanSourceId = params.sourceId.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return params.derivation ? `evi-align-${cleanSourceId}-${digest}` : `evi-${cleanSourceId}-${digest}`;
}

/**
 * Generate a deterministic identifier for a candidate constructed from Persian form and evidence IDs.
 */
export function generateCandidateId(persianForm: string, evidenceIds: string[]): string {
  const hash = crypto.createHash('sha256');
  hash.update(persianForm);
  const sortedIds = [...evidenceIds].sort();
  for (const id of sortedIds) {
    hash.update('\0');
    hash.update(id);
  }
  const digest = hash.digest('hex').slice(0, 16);
  return `cand-${digest}`;
}

export interface CandidateSynthesisOptions {
  proposedCanonical?: string | null;
  proposedProfile?: ProfileId;
  entityType?: LexicalEntityType;
  notes?: string;
  derivedAt?: string;
}

/**
 * Synthesize a LexicalCandidate from one or more LexicalEvidence records.
 *
 * Core invariants:
 *   1. Persian identity validation: Every supporting evidence record must normalize
 *      to the exact same Persian form as the candidate. Unrelated evidence is rejected fail-closed.
 *   2. Scheme-aware conflict detection:
 *      - Direct conflicts are detected only within the SAME explicitly comparable romanization scheme.
 *      - UNKNOWN and generic LOCAL observations do not produce direct same-scheme conflicts.
 *      - Differing observations across DIFFERENT schemes coexist independently as VARIANT_ACROSS_SCHEMES.
 *      - Both conflict dimensions (same-scheme conflicts and cross-scheme variants) are retained independently.
 *   3. Non-authoritative: The resulting candidate starts as UNREVIEWED (or REVIEW_REQUIRED
 *      if same-scheme conflicts exist) and is NEVER authoritative.
 */
export function synthesizeCandidateFromEvidence(
  persianForm: string,
  evidenceList: LexicalEvidence[],
  options?: CandidateSynthesisOptions
): LexicalCandidate {
  if (!persianForm || persianForm.trim() === '') {
    throw new Error('Cannot synthesize candidate with empty persianForm.');
  }
  if (!evidenceList || evidenceList.length === 0) {
    throw new Error(`Cannot synthesize candidate for "${persianForm}" without supporting evidence.`);
  }

  const candidateNormalized = normalizePersian(persianForm).normalizedInput;

  // 1. Validate Persian Identity for all supporting evidence
  for (const evi of evidenceList) {
    const evidenceNormalized = normalizePersian(evi.persianForm).normalizedInput;
    if (evidenceNormalized !== candidateNormalized) {
      throw new Error(
        `Cannot attach evidence "${evi.id}" (Persian: "${evi.persianForm}", normalized: "${evidenceNormalized}") to candidate "${persianForm}" (normalized: "${candidateNormalized}"): Persian forms do not match.`
      );
    }
  }

  const evidenceIds = evidenceList.map((e) => e.id);

  // 2. Scheme-Aware Conflict & Variant Analysis
  const conflicts: ConflictingObservation[] = [];

  // Group evidence by romanization scheme
  const schemeGroups = new Map<RomanizationScheme, LexicalEvidence[]>();
  for (const evi of evidenceList) {
    const scheme = evi.romanizationScheme;
    const group = schemeGroups.get(scheme) ?? [];
    group.push(evi);
    schemeGroups.set(scheme, group);
  }

  let hasSameSchemeConflict = false;

  // A. Check for direct conflicts WITHIN explicitly comparable schemes
  for (const [scheme, evis] of schemeGroups.entries()) {
    if (!COMPARABLE_SCHEMES.has(scheme)) {
      // UNKNOWN or generic LOCAL are not comparable standards and do not produce direct same-scheme conflict
      continue;
    }

    const distinctRomanizations = Array.from(
      new Set(evis.map((e) => e.observedRomanization).filter((r): r is string => r !== null && r !== ''))
    );

    if (distinctRomanizations.length > 1) {
      hasSameSchemeConflict = true;
      for (const evi of evis) {
        if (evi.observedRomanization) {
          conflicts.push({
            evidenceId: evi.id,
            persianForm: evi.persianForm,
            observedRomanization: evi.observedRomanization,
            romanizationScheme: evi.romanizationScheme,
            conflictKind: 'CONFLICT_WITHIN_SCHEME',
            conflictReason: `Disagrees with alternative observation(s) under the same comparable scheme (${scheme}): ${distinctRomanizations
              .filter((r) => r !== evi.observedRomanization)
              .join(', ')}`
          });
        }
      }
    }
  }

  // B. Check for cross-scheme variations independently (retaining both dimensions)
  const allDistinctRomanizations = Array.from(
    new Set(evidenceList.map((e) => e.observedRomanization).filter((r): r is string => r !== null && r !== ''))
  );

  // If there are multiple distinct romanizations across different schemes or non-comparable schemes, record them
  if (allDistinctRomanizations.length > 1 && (schemeGroups.size > 1 || !hasSameSchemeConflict)) {
    for (const evi of evidenceList) {
      if (evi.observedRomanization) {
        conflicts.push({
          evidenceId: evi.id,
          persianForm: evi.persianForm,
          observedRomanization: evi.observedRomanization,
          romanizationScheme: evi.romanizationScheme,
          conflictKind: 'VARIANT_ACROSS_SCHEMES',
          conflictReason: `External variant across observations (${Array.from(schemeGroups.keys()).join(', ')})`
        });
      }
    }
  }

  const defaultEntityType: LexicalEntityType = evidenceList[0].entityType ?? 'WORD';
  const resolvedEntityType: LexicalEntityType = options?.entityType ?? defaultEntityType;

  // Only actual comparable same-scheme disagreements require review blocking
  const status: LexicalCandidateStatus = hasSameSchemeConflict ? 'REVIEW_REQUIRED' : 'UNREVIEWED';

  const candidateId = generateCandidateId(persianForm, evidenceIds);

  const candidate: LexicalCandidate = {
    id: candidateId,
    persianForm,
    normalizedForm: candidateNormalized,
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

  validateCandidateLifecycle(candidate);
  return candidate;
}
