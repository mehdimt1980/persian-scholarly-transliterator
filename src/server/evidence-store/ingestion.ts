import { assertAdministrator, assertSafeEvidenceWrite, type WriteEnvironment } from './guard';
import { prepareBsbPublication } from './publication';
import type { EvidenceRepository, ImportReport, RawArchive, RetrievalSnapshot } from './types';

export async function importBsbEvidence(options: { xml: string; repository: EvidenceRepository; archive: RawArchive; environment: WriteEnvironment; now: string; queryPlan?: unknown; requestBudget?: number; recordBudget?: number; beforePublish?: () => void }): Promise<ImportReport> {
  assertSafeEvidenceWrite(options.environment);
  const prepared = prepareBsbPublication(options);
  const { bundle } = prepared;
  const archived = await options.archive.putImmutable(prepared.blobPath, prepared.body, bundle.raw.checksum);
  await options.archive.readVerified(prepared.blobPath, bundle.raw.checksum);
  return options.repository.transaction(async (state) => {
    state.runs.set(bundle.run.runId, { ...bundle.run, status: 'RUNNING', endedAt: null });
    state.raw.set(bundle.raw.checksum, bundle.raw);
    let versionsCreated = 0;
    let versionsReused = 0;
    for (const version of bundle.versions) {
      const existing = state.versions.get(version.versionId);
      if (existing) { existing.lastSeenAt = options.now; versionsReused += 1; continue; }
      for (const prior of state.versions.values()) if (prior.provider === version.provider && prior.sourceRecordId === version.sourceRecordId) prior.current = false;
      state.versions.set(version.versionId, version);
      versionsCreated += 1;
    }
    const previousSnapshotId = state.activeSnapshotId;
    const snapshot: RetrievalSnapshot = { ...bundle.snapshot, status: 'DRAFT', activatedAt: null };
    state.snapshots.set(snapshot.snapshotId, snapshot);
    for (const [key, value] of state.candidates) if (value.snapshotId === snapshot.snapshotId) state.candidates.delete(key);
    for (const projection of bundle.projections) state.candidates.set(`${snapshot.snapshotId}:${projection.candidate.candidateId}:${projection.sourceVersionId}`, projection);
    if (snapshot.candidateCount !== bundle.projections.length || !snapshot.manifest) throw new Error('Snapshot validation failed');
    snapshot.status = 'VERIFIED';
    options.beforePublish?.();
    if (previousSnapshotId && previousSnapshotId !== snapshot.snapshotId) { const previous = state.snapshots.get(previousSnapshotId); if (previous) previous.status = 'RETIRED'; }
    snapshot.status = 'ACTIVE'; snapshot.activatedAt = options.now; state.activeSnapshotId = snapshot.snapshotId;
    const run = state.runs.get(bundle.run.runId)!; run.status = 'COMPLETE'; run.endedAt = options.now;
    return { runId: bundle.run.runId, rawChecksum: bundle.raw.checksum, rawCreated: archived.created, recordsObserved: prepared.recordsObserved, versionsCreated, versionsReused, candidatesProjected: bundle.projections.length, snapshotId: snapshot.snapshotId, previousSnapshotId, activeSnapshotId: snapshot.snapshotId };
  });
}

export async function restoreSnapshot(repository: EvidenceRepository, snapshotId: string, environment: WriteEnvironment, now: string): Promise<void> {
  assertAdministrator(environment);
  await repository.transaction(async (state) => {
    const target = state.snapshots.get(snapshotId);
    if (!target || !['ACTIVE', 'RETIRED', 'VERIFIED'].includes(target.status)) throw new Error('Snapshot is not verified and restorable');
    const active = state.activeSnapshotId ? state.snapshots.get(state.activeSnapshotId) : undefined;
    if (active) active.status = 'RETIRED';
    target.status = 'ACTIVE'; target.activatedAt = now; state.activeSnapshotId = snapshotId;
  });
}
