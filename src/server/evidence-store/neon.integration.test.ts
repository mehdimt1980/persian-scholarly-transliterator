import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertSafeEvidenceWrite, type WriteEnvironment } from './guard';
import { NeonEvidenceReader, NeonSnapshotPublisher } from './neon';
import { importBsbEvidencePersistent } from './persistent';
import { prepareBsbPublication } from './publication';
import { searchPersistedEvidence } from './retrieval';
import { VercelPrivateBlobArchive } from './vercelBlob';

const authorized = process.env.PHASE8G_INTEGRATION_AUTHORIZED === 'true'
  && Boolean(process.env.PHASE8G_INTEGRATION_DATABASE_URL)
  && Boolean(process.env.PHASE8G_INTEGRATION_DATABASE_FINGERPRINT)
  && Boolean(process.env.PHASE8G_INTEGRATION_BLOB_STORE_ID)
  && Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const connectionString = process.env.PHASE8G_INTEGRATION_DATABASE_URL ?? '';
const namespace = process.env.PHASE8G_INTEGRATION_NAMESPACE ?? 'phase8g_integration';
const environment: WriteEnvironment = {
  runtime: 'test', allowWrites: true, namespace, isolation: 'ISOLATED_NEON_BRANCH', productionApproval: false, administrator: true,
  expectedDatabaseFingerprint: process.env.PHASE8G_INTEGRATION_DATABASE_FINGERPRINT,
  expectedBlobStoreId: process.env.PHASE8G_INTEGRATION_BLOB_STORE_ID,
};
const root = path.resolve(__dirname, '../../..');
const fixture = fs.readFileSync(path.join(root, 'validation/acquisition/bsb/authentic-selected-records.v1.xml'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/evidence/001_phase8g_evidence_store.sql'), 'utf8');
const down = fs.readFileSync(path.join(root, 'migrations/evidence/001_phase8g_evidence_store.down.sql'), 'utf8');
const rowsOf = (result: unknown): Record<string, unknown>[] => Array.isArray(result) ? result as Record<string, unknown>[] : [];

async function executeScript(script: string): Promise<void> {
  const sql = neon(connectionString);
  for (const statement of script.split(';').map((part) => part.trim()).filter((part) => part && part !== 'BEGIN' && part !== 'COMMIT')) await sql.query(statement);
}

it.skipIf(authorized)('BLOCKED: real Neon/Private Blob integration requires an explicitly authorized isolated target', () => {});

describe.runIf(authorized)('Phase 8G real Neon and Private Blob integration', () => {
  let sql: ReturnType<typeof neon>;
  let publisher: NeonSnapshotPublisher;
  let archive: VercelPrivateBlobArchive;
  let firstSnapshot = '';
  let secondSnapshot = '';

  beforeAll(async () => {
    sql = neon(connectionString);
    publisher = new NeonSnapshotPublisher(connectionString, environment);
    archive = new VercelPrivateBlobArchive(environment, process.env.PHASE8G_INTEGRATION_BLOB_STORE_ID);
    const identity = await publisher.inspectIdentity();
    expect(identity.fingerprint).toBe(environment.expectedDatabaseFingerprint);
    assertSafeEvidenceWrite(environment);
    await executeScript(migration);
    await sql.query('INSERT INTO evidence_environment_binding(singleton,namespace,runtime,isolation,database_fingerprint,writes_enabled) VALUES(true,$1,$2,$3,$4,true) ON CONFLICT(singleton) DO UPDATE SET namespace=excluded.namespace,runtime=excluded.runtime,isolation=excluded.isolation,database_fingerprint=excluded.database_fingerprint,writes_enabled=true', [namespace, environment.runtime, environment.isolation, identity.fingerprint]);
  }, 60_000);

  afterAll(async () => { await executeScript(down); }, 60_000);

  it('migrates, imports, reimports idempotently, reloads, and retrieves through LexicalEvidenceIndex', async () => {
    await publisher.verifyMigration();
    const first = await importBsbEvidencePersistent({ xml: fixture, archive, publisher, environment, now: '2026-10-09T12:00:00.000Z' });
    firstSnapshot = first.snapshotId;
    const repeated = await importBsbEvidencePersistent({ xml: fixture, archive, publisher, environment, now: '2026-10-09T12:05:00.000Z' });
    expect(repeated.snapshotId).toBe(first.snapshotId);
    const counts = rowsOf(await sql.query('SELECT (SELECT count(*) FROM evidence_record_version) AS versions, (SELECT count(*) FROM evidence_candidate_projection) AS candidates, (SELECT count(*) FROM evidence_snapshot) AS snapshots'));
    expect(counts[0]).toMatchObject({ versions: '2', candidates: '3', snapshots: '1' });
    const result = await searchPersistedEvidence(new NeonEvidenceReader(connectionString), 'ادب فارسی', { provider: 'BSB_SRU_MARCXML' });
    expect(result.matches).toHaveLength(1);
    expect(result.status).toBe('CANDIDATE');
  }, 60_000);

  it('keeps the previous active snapshot after a failed transaction', async () => {
    const prepared = prepareBsbPublication({ xml: fixture.replace('ادب فارسی</subfield>', 'ادب فارسی نو</subfield>'), environment, now: '2026-10-10T12:00:00.000Z' });
    prepared.bundle.snapshot.manifest = { invalid: true };
    await expect(publisher.publish(prepared.bundle)).rejects.toThrow();
    const active = rowsOf(await sql.query('SELECT snapshot_id FROM evidence_active_snapshot WHERE singleton=true'));
    expect(active[0]?.snapshot_id).toBe(firstSnapshot);
  }, 60_000);

  it('serializes concurrent publication, preserves history, activates, and restores', async () => {
    const changed = fixture.replace('ادب فارسی</subfield>', 'ادب فارسی نو</subfield>');
    const prepared = prepareBsbPublication({ xml: changed, environment, now: '2026-10-10T12:00:00.000Z' });
    await archive.putImmutable(prepared.blobPath, prepared.body, prepared.bundle.raw.checksum);
    const results = await Promise.allSettled([publisher.publish(prepared.bundle), publisher.publish(prepared.bundle)]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    secondSnapshot = prepared.bundle.snapshot.snapshotId;
    expect((await publisher.verifySnapshot(secondSnapshot)).activeSnapshotId).toBe(secondSnapshot);
    const versions = rowsOf(await sql.query('SELECT count(*) AS count FROM evidence_record_version'));
    expect(versions[0]?.count).toBe('3');
    await publisher.restore(firstSnapshot, '2026-10-11T12:00:00.000Z');
    expect((await publisher.verifySnapshot(firstSnapshot)).activeSnapshotId).toBe(firstSnapshot);
  }, 60_000);

  it('fails closed for mismatched, shared Preview, and unapproved Production targets', async () => {
    const mismatched = new NeonSnapshotPublisher(connectionString, { ...environment, expectedDatabaseFingerprint: '0'.repeat(64) });
    await expect(mismatched.preflight()).rejects.toThrow(/identity/);
    expect(() => assertSafeEvidenceWrite({ ...environment, runtime: 'preview', isolation: 'SHARED_OR_UNKNOWN' })).toThrow(/unknown or shared/);
    expect(() => assertSafeEvidenceWrite({ ...environment, runtime: 'production', productionApproval: false })).toThrow(/owner approval/);
  });
});
