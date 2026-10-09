import type { LexicalCandidate } from '../../validation/lexical-evidence/types';

export type SnapshotUpdateMode = 'INCREMENTAL' | 'FULL_REBUILD';
export type RunStatus = 'RUNNING' | 'COMPLETE' | 'FAILED';
export interface AcquisitionRun { runId: string; provider: 'BSB_SRU_MARCXML'; queryPlan: unknown; requestBudget: number; recordBudget: number; status: RunStatus; startedAt: string; endedAt: string | null; error: string | null; }
export interface RawSourceObject { checksum: string; provider: 'BSB_SRU_MARCXML'; blobPath: string; contentLength: number; contentType: 'application/marcxml+xml'; retrievedAt: string; licenseUrl: string; runId: string; }
export interface RecordVersion { versionId: string; provider: 'BSB_SRU_MARCXML'; sourceRecordId: string; recordChecksum: string; rawChecksum: string; marc: unknown; languageEvidence: string[]; firstSeenAt: string; lastSeenAt: string; current: boolean; }
export interface CandidateProjection { snapshotId: string; sourceVersionId: string; candidate: LexicalCandidate; }
export interface RetrievalSnapshot { snapshotId: string; schemaVersion: 'phase8g-snapshot-v1'; extractionVersion: 'phase8f-bsb-v1'; sourceVersionIds: string[]; candidateCount: number; manifestChecksum: string; manifest?: unknown; status: 'DRAFT' | 'VERIFIED' | 'ACTIVE' | 'RETIRED'; createdAt: string; activatedAt: string | null; }
export interface EvidenceState { runs: Map<string, AcquisitionRun>; raw: Map<string, RawSourceObject>; versions: Map<string, RecordVersion>; candidates: Map<string, CandidateProjection>; snapshots: Map<string, RetrievalSnapshot>; activeSnapshotId: string | null; }
export interface ArchivePut { path: string; checksum: string; contentLength: number; contentType: 'application/marcxml+xml'; created: boolean; }
export interface RawArchive { putImmutable(path: string, body: Uint8Array, checksum: string): Promise<ArchivePut>; readVerified(path: string, checksum: string): Promise<Uint8Array>; }
export interface EvidenceRepository { transaction<T>(operation: (state: EvidenceState) => Promise<T>): Promise<T>; readState(): Promise<EvidenceState>; }
export interface ImportReport { runId: string; rawChecksum: string; rawCreated: boolean; recordsObserved: number; versionsCreated: number; versionsReused: number; candidatesProjected: number; snapshotId: string; previousSnapshotId: string | null; activeSnapshotId: string; }
