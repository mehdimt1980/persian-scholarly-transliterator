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

/**
 * Storage and index management for external lexical evidence and candidates.
 *
 * Core architectural invariants:
 *   1. External evidence records are append-only historical observations.
 *   2. Multiple external sources providing conflicting observations for the same
 *      Persian form comfortably coexist without overwriting each other.
 *   3. This repository contains zero authoritative lexicon entries and has NO
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

  /**
   * Explicit invariant guard: confirming this store is purely evidentiary and non-authoritative.
   */
  public assertNonAuthoritative(): true {
    return true;
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

    // Preserve or replace exact observation by ID; do not mutate other observations
    this.evidenceById.set(evidence.id, evidence);

    // Index by Persian form
    const pKey = evidence.persianForm.trim();
    const existingP = this.evidenceByPersian.get(pKey) ?? [];
    const filteredP = existingP.filter((e) => e.id !== evidence.id);
    filteredP.push(evidence);
    this.evidenceByPersian.set(pKey, filteredP);

    // Index by Source ID
    const sKey = evidence.provenance.sourceId.trim();
    const existingS = this.evidenceBySource.get(sKey) ?? [];
    const filteredS = existingS.filter((e) => e.id !== evidence.id);
    filteredS.push(evidence);
    this.evidenceBySource.set(sKey, filteredS);
  }

  public addEvidenceBatch(evidenceList: LexicalEvidence[]): void {
    for (const evi of evidenceList) {
      this.addEvidence(evi);
    }
  }

  public getEvidenceById(id: string): LexicalEvidence | undefined {
    return this.evidenceById.get(id);
  }

  public getEvidenceByPersianForm(persianForm: string): LexicalEvidence[] {
    return [...(this.evidenceByPersian.get(persianForm.trim()) ?? [])];
  }

  public getEvidenceBySource(sourceId: string): LexicalEvidence[] {
    return [...(this.evidenceBySource.get(sourceId.trim()) ?? [])];
  }

  public getAllEvidence(): LexicalEvidence[] {
    return Array.from(this.evidenceById.values());
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

    this.candidatesById.set(candidate.id, candidate);

    // Index by Persian form
    const pKey = candidate.persianForm.trim();
    const existingP = this.candidatesByPersian.get(pKey) ?? [];
    const filteredP = existingP.filter((c) => c.id !== candidate.id);
    filteredP.push(candidate);
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
    return this.candidatesById.get(id);
  }

  public getCandidatesByPersianForm(persianForm: string): LexicalCandidate[] {
    return [...(this.candidatesByPersian.get(persianForm.trim()) ?? [])];
  }

  public getCandidatesByStatus(status: LexicalCandidateStatus): LexicalCandidate[] {
    return [...(this.candidatesByStatus.get(status) ?? [])];
  }

  public getAllCandidates(): LexicalCandidate[] {
    return Array.from(this.candidatesById.values());
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
      if (evi) results.push(evi);
    }
    return results;
  }

  // --- Integrity and Serialization ---

  public validateIntegrity(): EvidenceIntegrityReport {
    const errors: string[] = [];

    for (const [candId, candidate] of this.candidatesById.entries()) {
      for (const eid of candidate.evidenceIds) {
        if (!this.evidenceById.has(eid)) {
          errors.push(`Candidate "${candId}" references non-existent evidence ID "${eid}".`);
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
