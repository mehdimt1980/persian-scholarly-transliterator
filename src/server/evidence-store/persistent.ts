import { assertSafeEvidenceWrite, type WriteEnvironment } from './guard';
import type { NeonSnapshotPublisher, PublicationResult } from './neon';
import { prepareBsbPublication } from './publication';
import type { RawArchive, SnapshotUpdateMode } from './types';

export interface PersistentImportResult extends PublicationResult { rawCreated: boolean; rawChecksum: string; recordsObserved: number; }

type PersistentPublisher = Pick<NeonSnapshotPublisher, 'preflight' | 'publish'>;

export async function importBsbEvidencePersistent(options: { xml: string; archive: RawArchive; publisher: PersistentPublisher; environment: WriteEnvironment; now: string; queryPlan?: unknown; requestBudget?: number; recordBudget?: number; mode?: SnapshotUpdateMode; expectedBaseline?: { snapshotId: string; manifestChecksum: string } }): Promise<PersistentImportResult> {
  assertSafeEvidenceWrite(options.environment);
  await options.publisher.preflight();
  const prepared = prepareBsbPublication(options);
  if(options.expectedBaseline) prepared.bundle.expectedBaseline = options.expectedBaseline;
  const archived = await options.archive.putImmutable(prepared.blobPath, prepared.body, prepared.bundle.raw.checksum);
  await options.archive.readVerified(prepared.blobPath, prepared.bundle.raw.checksum);
  const published = await options.publisher.publish(prepared.bundle);
  return { ...published, rawCreated: archived.created, rawChecksum: prepared.bundle.raw.checksum, recordsObserved: prepared.recordsObserved };
}
