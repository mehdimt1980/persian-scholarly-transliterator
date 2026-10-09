import fs from 'node:fs';
import path from 'node:path';
import { assertAdministrator, assertBlobStoreIdentity, environmentFromProcess } from './guard';
import { NeonEvidenceReader, NeonSnapshotPublisher } from './neon';
import { importBsbEvidencePersistent } from './persistent';
import { searchPersistedEvidence } from './retrieval';
import { VercelPrivateBlobArchive } from './vercelBlob';

async function main(): Promise<void> {
  const command = process.argv[2];
  const environment = environmentFromProcess(process.env);
  assertAdministrator(environment);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const publisher = new NeonSnapshotPublisher(connectionString, environment);
  if (command === 'preflight') {
    const { identity, binding } = await publisher.preflight();
    assertBlobStoreIdentity(environment, process.env.BLOB_STORE_ID);
    console.log(JSON.stringify({ status: 'SAFE', databaseFingerprint: identity.fingerprint, namespace: binding.namespace, runtime: binding.runtime, isolation: binding.isolation }));
    return;
  }
  if (command === 'migration-verify') { await publisher.verifyMigration(); console.log(JSON.stringify({ status: 'VALID' })); return; }
  if (command === 'fixture-import') {
    const xml = fs.readFileSync(path.resolve('validation/acquisition/bsb/authentic-selected-records.v1.xml'), 'utf8');
    const archive = new VercelPrivateBlobArchive(environment, process.env.BLOB_STORE_ID);
    const result = await importBsbEvidencePersistent({ xml, archive, publisher, environment, now: new Date().toISOString() });
    console.log(JSON.stringify(result));
    return;
  }
  if (command === 'snapshot-verify') {
    const snapshotId = process.argv[3];
    if (!snapshotId) throw new Error('snapshot-verify requires a snapshot ID');
    console.log(JSON.stringify(await publisher.verifySnapshot(snapshotId)));
    return;
  }
  if (command === 'search') {
    const query = process.argv.slice(3).join(' ').trim();
    if (!query) throw new Error('search requires a Persian query');
    const result = await searchPersistedEvidence(new NeonEvidenceReader(connectionString), query, { limit: 25 });
    console.log(JSON.stringify(result));
    return;
  }
  if (command === 'rollback') {
    const snapshotId = process.argv[3];
    if (!snapshotId) throw new Error('rollback requires a snapshot ID');
    await publisher.restore(snapshotId, new Date().toISOString());
    console.log(JSON.stringify({ status: 'RESTORED', snapshotId }));
    return;
  }
  throw new Error('Command must be one of: preflight, migration-verify, fixture-import, snapshot-verify, search, rollback');
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Evidence administration failed'); process.exitCode = 1; });
