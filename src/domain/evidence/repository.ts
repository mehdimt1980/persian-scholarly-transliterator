import { normalizePersian } from '../normalization';
import { validateCandidateLifecycle } from './candidate';
import {
  LexicalCandidate,
  LexicalCandidateStatus,
  LexicalEvidence
} from './types';

export interface SerializedEvidenceStore {
  version: 1;
  evidence: LexicalEvidence[];
  candidates: LexicalCandidate[];
}

export interface EvidenceIntegrityReport {
  valid: boolean;
  errors: string[];
}

export class EvidenceIntegrityError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super(
      `Lexical evidence repository integrity failure with ${errors.length} error(s):\n${errors
        .map((e) => `  - ${e}`)
        .join('\n')}`
    );
    this.name = 'EvidenceIntegrityError';
    this.errors = errors;
  }
}

export class EvidenceImmutabilityViolationError extends Error {
  public readonly evidenceId: string;

  constructor(evidenceId: string) {
    super(
      `Evidence record with ID "${evidenceId}" already exists with different observation data. Lexical evidence records are immutable historical observations and cannot be altered or overwritten.`
    );
    this.name = 'EvidenceImmutabilityViolationError';
    this.evidenceId = evidenceId;
  }
}

/**
 * Defensive deep clone helper ensuring complete isolation of stored repository records
 * from caller-owned mutable object references.
 */
export function deepClone<T>(obj: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Deterministic equality comparison for LexicalEvidence records.
 * Independent of object key order and handles optional/undefined fields deterministically.
 */
export function isExactSameEvidence(a: LexicalEvidence, b: LexicalEvidence): boolean {
  if (a.id !== b.id) return false;
  if (a.sourceType !== b.sourceType) return false;
  if (a.sourceRecordId !== b.sourceRecordId) return false;
  if (a.sourceUri !== b.sourceUri) return false;
  if (a.sourceField !== b.sourceField) return false;
  if (a.persianForm !== b.persianForm) return false;
  if (a.observedRomanization !== b.observedRomanization) return false;
  if (a.romanizationScheme !== b.romanizationScheme) return false;
  if (a.entityType !== b.entityType) return false;
  if (a.context !== b.context) return false;
  if (a.status !== b.status) return false;

  const pa = a.provenance;
  const pb = b.provenance;
  if (pa.sourceId !== pb.sourceId) return false;
  if ((pa.sourceTitle ?? null) !== (pb.sourceTitle ?? null)) return false;
  if ((pa.sourceOrganization ?? null) !== (pb.sourceOrganization ?? null)) return false;
  if (pa.retrievalMethod !== pb.retrievalMethod) return false;
  if (pa.retrievedAt !== pb.retrievedAt) return false;
  if ((pa.extractorVersion ?? null) !== (pb.extractorVersion ?? null)) return false;
  if ((pa.notes ?? null) !== (pb.notes ?? null)) return false;

  const da = a.derivation;
  const db = b.derivation;
  if (!da && !db) return true;
  if (!da || !db) return false;
  if (da.kind !== db.kind) return false;
  if (da.parentEvidenceId !== db.parentEvidenceId) return false;
  if (da.segmentIndex !== db.segmentIndex) return false;
  if (da.persianSpan.start !== db.persianSpan.start || da.persianSpan.end !== db.persianSpan.end) return false;
  if (da.romanizationSpan.start !== db.romanizationSpan.start || da.romanizationSpan.end !== db.romanizationSpan.end) return false;
  if (da.alignmentStrategy !== db.alignmentStrategy) return false;
  if (da.candidateEligibility !== db.candidateEligibility) return false;
  if ((da.exclusionReason ?? null) !== (db.exclusionReason ?? null)) return false;

  return true;
}

/**
 * Validate provenance lineage and exact source-span integrity for derived segment evidence.
 */
export function validateDerivedEvidenceLineage(
  child: LexicalEvidence,
  parentLookup: (id: string) => LexicalEvidence | undefined
): void {
  if (!child.derivation) return;

  const d = child.derivation;
  if (d.kind !== 'ALIGNED_SEGMENT') {
    throw new Error(`Evidence "${child.id}" has unsupported derivation kind "${(d as any).kind}".`);
  }

  if (d.parentEvidenceId === child.id) {
    throw new Error(`Evidence "${child.id}" cannot derive from itself.`);
  }

  const parent = parentLookup(d.parentEvidenceId);
  if (!parent) {
    throw new Error(
      `Evidence "${child.id}" references non-existent parent evidence "${d.parentEvidenceId}".`
    );
  }

  if (parent.derivation) {
    throw new Error(
      `Evidence "${child.id}" cannot derive from another derived evidence record "${parent.id}". Recursive derivation is prohibited.`
    );
  }

  // 1. Validate Persian span
  const { start: pStart, end: pEnd } = d.persianSpan;
  if (pStart < 0 || pEnd < pStart || pEnd > parent.persianForm.length) {
    throw new Error(
      `Evidence "${child.id}" persianSpan [${pStart}, ${pEnd}] is out of bounds for parent length ${parent.persianForm.length}.`
    );
  }
  const expectedPersian = parent.persianForm.slice(pStart, pEnd);
  if (expectedPersian !== child.persianForm) {
    throw new Error(
      `Evidence "${child.id}" persianForm "${child.persianForm}" does not match parent substring slice [${pStart}, ${pEnd}] "${expectedPersian}".`
    );
  }

  // 2. Validate Romanization span
  if (parent.observedRomanization !== null) {
    const { start: rStart, end: rEnd } = d.romanizationSpan;
    if (rStart < 0 || rEnd < rStart || rEnd > parent.observedRomanization.length) {
      throw new Error(
        `Evidence "${child.id}" romanizationSpan [${rStart}, ${rEnd}] is out of bounds for parent observedRomanization length ${parent.observedRomanization.length}.`
      );
    }
    const expectedRoman = parent.observedRomanization.slice(rStart, rEnd);
    if (expectedRoman !== child.observedRomanization) {
      throw new Error(
        `Evidence "${child.id}" observedRomanization "${child.observedRomanization}" does not match parent substring slice [${rStart}, ${rEnd}] "${expectedRoman}".`
      );
    }
  } else {
    if (child.observedRomanization !== null) {
      throw new Error(
        `Evidence "${child.id}" specifies observedRomanization "${child.observedRomanization}" but parent "${parent.id}" has no observed romanization.`
      );
    }
  }

  // 3. Validate consistency of source metadata
  if (child.provenance.sourceId !== parent.provenance.sourceId) {
    throw new Error(
      `Evidence "${child.id}" sourceId "${child.provenance.sourceId}" does not match parent sourceId "${parent.provenance.sourceId}".`
    );
  }
  if (child.sourceRecordId !== parent.sourceRecordId) {
    throw new Error(
      `Evidence "${child.id}" sourceRecordId "${child.sourceRecordId}" does not match parent sourceRecordId "${parent.sourceRecordId}".`
    );
  }
  if (child.romanizationScheme !== parent.romanizationScheme) {
    throw new Error(
      `Evidence "${child.id}" romanizationScheme "${child.romanizationScheme}" does not match parent romanizationScheme "${parent.romanizationScheme}".`
    );
  }
  if (child.sourceUri !== parent.sourceUri) {
    throw new Error(
      `Evidence "${child.id}" sourceUri "${child.sourceUri}" does not match parent sourceUri "${parent.sourceUri}".`
    );
  }
}

/**
 * Storage and index management for external lexical evidence and candidates.
 *
 * Core architectural invariants:
 *   1. External evidence records are strictly append-only and immutable historical observations.
 *      Defensive cloning on ingress and egress ensures caller mutations cannot affect stored records.
 *   2. Re-adding an identical evidence record is an idempotent no-op. Attempting to add an
 *      existing evidence ID with altered content fails closed with EvidenceImmutabilityViolationError.
 *   3. Derived aligned evidence records must strictly satisfy parent lineage and exact source-span constraints.
 *   4. Candidates require all referenced evidence IDs to exist at insertion time (fail-closed).
 *   5. Candidate lifecycle states (ACCEPTED / REJECTED) are strictly validated and protected from
 *      unauthorized reference mutations.
 *   6. This repository contains zero authoritative lexicon entries and has NO
 *      direct mutation path into LexiconRepository.
 */
export class LexicalEvidenceRepository {
  private readonly evidenceById: Map<string, LexicalEvidence> = new Map();
  private readonly evidenceByPersian: Map<string, LexicalEvidence[]> = new Map();
  private readonly evidenceBySource: Map<string, LexicalEvidence[]> = new Map();

  private readonly candidatesById: Map<string, LexicalCandidate> = new Map();
  private readonly candidatesByPersian: Map<string, LexicalCandidate[]> = new Map();
  private readonly candidatesByStatus: Map<LexicalCandidateStatus, LexicalCandidate[]> = new Map();

  constructor(initialData?: { evidence?: LexicalEvidence[]; candidates?: LexicalCandidate[] }) {
    if (initialData?.evidence) {
      this.addEvidenceBatch(initialData.evidence);
    }
    if (initialData?.candidates) {
      this.addCandidateBatch(initialData.candidates);
    }
  }

  // --- Evidence Operations ---

  public addEvidence(evidence: LexicalEvidence): void {
    if (!evidence.id || evidence.id.trim() === '') {
      throw new Error('Evidence record must have a non-empty id.');
    }
    if (!evidence.persianForm || evidence.persianForm.trim() === '') {
      throw new Error(`Evidence "${evidence.id}" must contain a non-empty persianForm.`);
    }
    if (!evidence.provenance?.sourceId) {
      throw new Error(`Evidence "${evidence.id}" must specify provenance.sourceId.`);
    }

    const snapshot = deepClone(evidence);

    // Validate derived evidence lineage and span consistency
    if (snapshot.derivation) {
      validateDerivedEvidenceLineage(snapshot, (id) => this.evidenceById.get(id));
    }

    const existing = this.evidenceById.get(snapshot.id);
    if (existing) {
      // Idempotent re-ingestion check: identical content succeeds as no-op; altered content fails closed
      if (isExactSameEvidence(existing, snapshot)) {
        return;
      }
      throw new EvidenceImmutabilityViolationError(snapshot.id);
    }

    // Append-only insertion of defensive snapshot
    this.evidenceById.set(snapshot.id, snapshot);

    // Index by Persian form
    const pKey = snapshot.persianForm.trim();
    const existingP = this.evidenceByPersian.get(pKey) ?? [];
    existingP.push(snapshot);
    this.evidenceByPersian.set(pKey, existingP);

    // Index by Source ID
    const sKey = snapshot.provenance.sourceId.trim();
    const existingS = this.evidenceBySource.get(sKey) ?? [];
    existingS.push(snapshot);
    this.evidenceBySource.set(sKey, existingS);
  }

  public addEvidenceBatch(evidenceList: LexicalEvidence[]): void {
    for (const evi of evidenceList) {
      this.addEvidence(evi);
    }
  }

  public getEvidenceById(id: string): LexicalEvidence | undefined {
    const evi = this.evidenceById.get(id);
    return evi ? deepClone(evi) : undefined;
  }

  public getEvidenceByPersianForm(persianForm: string): LexicalEvidence[] {
    const list = this.evidenceByPersian.get(persianForm.trim()) ?? [];
    return deepClone(list);
  }

  public getEvidenceBySource(sourceId: string): LexicalEvidence[] {
    const list = this.evidenceBySource.get(sourceId.trim()) ?? [];
    return deepClone(list);
  }

  public getAllEvidence(): LexicalEvidence[] {
    return deepClone(Array.from(this.evidenceById.values()));
  }

  public getEvidenceCount(): number {
    return this.evidenceById.size;
  }

  // --- Candidate Operations ---

  public addCandidate(candidate: LexicalCandidate): void {
    if (!candidate.id || candidate.id.trim() === '') {
      throw new Error('Candidate record must have a non-empty id.');
    }
    if (!candidate.persianForm || candidate.persianForm.trim() === '') {
      throw new Error(`Candidate "${candidate.id}" must contain a non-empty persianForm.`);
    }
    if (!candidate.evidenceIds || candidate.evidenceIds.length === 0) {
      throw new Error(`Candidate "${candidate.id}" must reference at least one supporting evidence ID.`);
    }

    const snapshot = deepClone(candidate);

    // 1. Enforce candidate Persian identity consistency
    const expectedNormalized = normalizePersian(snapshot.persianForm).normalizedInput;
    if (snapshot.normalizedForm !== expectedNormalized) {
      throw new Error(
        `Candidate "${snapshot.id}" normalizedForm "${snapshot.normalizedForm}" does not match normalized persianForm "${expectedNormalized}".`
      );
    }

    // 2. Fail closed immediately on any missing evidence reference or Persian identity mismatch
    for (const eid of snapshot.evidenceIds) {
      const evi = this.evidenceById.get(eid);
      if (!evi) {
        throw new Error(`Candidate "${snapshot.id}" references non-existent evidence ID "${eid}".`);
      }
      const evidenceNormalized = normalizePersian(evi.persianForm).normalizedInput;
      if (evidenceNormalized !== expectedNormalized) {
        throw new Error(
          `Candidate "${snapshot.id}" Persian identity mismatch: evidence "${eid}" has normalized form "${evidenceNormalized}", but candidate has "${expectedNormalized}".`
        );
      }
    }

    // 3. Validate lifecycle rules on defensive snapshot
    validateCandidateLifecycle(snapshot);

    this.candidatesById.set(snapshot.id, snapshot);

    // Index by Persian form
    const pKey = snapshot.persianForm.trim();
    const existingP = this.candidatesByPersian.get(pKey) ?? [];
    const filteredP = existingP.filter((c) => c.id !== snapshot.id);
    filteredP.push(snapshot);
    this.candidatesByPersian.set(pKey, filteredP);

    // Index by Status
    this.rebuildStatusIndex();
  }

  public addCandidateBatch(candidates: LexicalCandidate[]): void {
    for (const cand of candidates) {
      this.addCandidate(cand);
    }
  }

  public getCandidateById(id: string): LexicalCandidate | undefined {
    const cand = this.candidatesById.get(id);
    return cand ? deepClone(cand) : undefined;
  }

  public getCandidatesByPersianForm(persianForm: string): LexicalCandidate[] {
    const list = this.candidatesByPersian.get(persianForm.trim()) ?? [];
    return deepClone(list);
  }

  public getCandidatesByStatus(status: LexicalCandidateStatus): LexicalCandidate[] {
    const list = this.candidatesByStatus.get(status) ?? [];
    return deepClone(list);
  }

  public getAllCandidates(): LexicalCandidate[] {
    return deepClone(Array.from(this.candidatesById.values()));
  }

  public getCandidateCount(): number {
    return this.candidatesById.size;
  }

  /**
   * Retrieve all supporting LexicalEvidence records for a given candidate.
   */
  public getSupportingEvidence(candidateId: string): LexicalEvidence[] {
    const candidate = this.candidatesById.get(candidateId);
    if (!candidate) return [];
    const results: LexicalEvidence[] = [];
    for (const eid of candidate.evidenceIds) {
      const evi = this.evidenceById.get(eid);
      if (evi) results.push(deepClone(evi));
    }
    return results;
  }

  /**
   * Retrieve parent LexicalEvidence for a derived aligned segment observation.
   */
  public getParentEvidence(derivedEvidenceId: string): LexicalEvidence | undefined {
    const child = this.evidenceById.get(derivedEvidenceId);
    if (!child?.derivation?.parentEvidenceId) return undefined;
    return this.getEvidenceById(child.derivation.parentEvidenceId);
  }

  // --- Integrity and Serialization ---

  public validateIntegrity(): EvidenceIntegrityReport {
    const errors: string[] = [];

    // 1. Validate derived evidence lineage and source-span integrity
    for (const [eviId, evidence] of this.evidenceById.entries()) {
      if (evidence.derivation) {
        try {
          validateDerivedEvidenceLineage(evidence, (id) => this.evidenceById.get(id));
        } catch (err: any) {
          errors.push(`Evidence "${eviId}" derivation error: ${err.message}`);
        }
      }
    }

    // 2. Validate candidate integrity and Persian identity
    for (const [candId, candidate] of this.candidatesById.entries()) {
      try {
        validateCandidateLifecycle(candidate);
      } catch (err: any) {
        errors.push(err.message);
      }

      const expectedNormalized = normalizePersian(candidate.persianForm).normalizedInput;
      if (candidate.normalizedForm !== expectedNormalized) {
        errors.push(
          `Candidate "${candId}" normalizedForm "${candidate.normalizedForm}" does not match normalized persianForm "${expectedNormalized}".`
        );
      }

      for (const eid of candidate.evidenceIds) {
        const evi = this.evidenceById.get(eid);
        if (!evi) {
          errors.push(`Candidate "${candId}" references non-existent evidence ID "${eid}".`);
        } else {
          const evidenceNormalized = normalizePersian(evi.persianForm).normalizedInput;
          if (evidenceNormalized !== expectedNormalized) {
            errors.push(
              `Candidate "${candId}" Persian identity mismatch: evidence "${eid}" has normalized form "${evidenceNormalized}", but candidate has "${expectedNormalized}".`
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  public serialize(): SerializedEvidenceStore {
    return {
      version: 1,
      evidence: this.getAllEvidence(),
      candidates: this.getAllCandidates()
    };
  }

  public static deserialize(data: SerializedEvidenceStore): LexicalEvidenceRepository {
    if (data.version !== 1) {
      throw new Error(`Unsupported evidence store version: ${(data as any).version}`);
    }
    const repo = new LexicalEvidenceRepository({
      evidence: data.evidence,
      candidates: data.candidates
    });
    const integrity = repo.validateIntegrity();
    if (!integrity.valid) {
      throw new EvidenceIntegrityError(integrity.errors);
    }
    return repo;
  }

  private rebuildStatusIndex(): void {
    this.candidatesByStatus.clear();
    for (const cand of this.candidatesById.values()) {
      const list = this.candidatesByStatus.get(cand.status) ?? [];
      list.push(cand);
      this.candidatesByStatus.set(cand.status, list);
    }
  }
}
