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
  && /^br-[a-z0-9-]+$/.test(process.env.PHASE8G_INTEGRATION_NEON_BRANCH_ID ?? '')
  && Boolean(process.env.BLOB_READ_WRITE_TOKEN)
  && process.env.PHASE8G_INTEGRATION_DISPOSABLE_CONFIRMATION === 'DROP_PHASE8G_TEST_SCHEMA';

const connectionString = process.env.PHASE8G_INTEGRATION_DATABASE_URL ?? '';
const expectedBranchId = process.env.PHASE8G_INTEGRATION_NEON_BRANCH_ID ?? '';
const isDisposableTarget = async (sql: ReturnType<typeof neon>): Promise<void> => {
  const rows = await sql.query("SELECT current_setting('neon.branch_id', true) AS branch_id");
  const actualBranchId = rowsOf(rows)[0]?.branch_id;
  if (!actualBranchId || actualBranchId !== expectedBranchId) {
    throw new Error('Refusing destructive integration operations: Neon branch identity mismatch');
  }
};
const namespace = process.env.PHASE8G_INTEGRATION_NAMESPACE ?? 'phase8g_integration';
const environment: WriteEnvironment = {
  runtime: 'test', allowWrites: true, namespace, isolation: 'ISOLATED_NEON_BRANCH', productionApproval: false, administrator: true,
  expectedDatabaseFingerprint: process.env.PHASE8G_INTEGRATION_DATABASE_FINGERPRINT,
  expectedBlobStoreId: process.env.PHASE8G_INTEGRATION_BLOB_STORE_ID,
};
const root = path.resolve(__dirname, '../../..');
const fixture = fs.readFileSync(path.join(root, 'validation/acquisition/bsb/authentic-selected-records.v1.xml'), 'utf8');
const marcRecords = [...fixture.matchAll(/<record>[\s\S]*?<\/record>/gu)].map((match) => match[0]);
const collection = (...records: string[]) => `<?xml version="1.0" encoding="UTF-8"?><collection xmlns="http://www.loc.gov/MARC21/slim">${records.join('')}</collection>`;
const importA = collection(...marcRecords);
const importB = collection(marcRecords[0].replace('991071006889707356', 'phase8g-b-001').replace('ادب فارسی', 'تاریخ ایران'), marcRecords[1].replace('991144600686807356', 'phase8g-b-002').replace('ادب فارسى :', 'فرهنگ ایران :'));
const migration = fs.readFileSync(path.join(root, 'migrations/evidence/001_phase8g_evidence_store.sql'), 'utf8');
const down = fs.readFileSync(path.join(root, 'migrations/evidence/001_phase8g_evidence_store.down.sql'), 'utf8');
const rowsOf = (result: unknown): Record<string, unknown>[] => Array.isArray(result) ? result as Record<string, unknown>[] : [];

async function executeScript(script: string): Promise<void> {
  const sql = neon(connectionString);
  const statements: string[] = []; let current = ''; let inDollarBlock = false;
  for (let index = 0; index < script.length; index += 1) { if (script.slice(index, index + 2) === '$$') { inDollarBlock = !inDollarBlock; current += '$$'; index += 1; continue; } const character = script[index]; if (character === ';' && !inDollarBlock) { if (current.trim()) statements.push(current.trim()); current = ''; } else current += character; }
  if (current.trim()) statements.push(current.trim());
  for (const statement of statements.filter((part) => part !== 'BEGIN' && part !== 'COMMIT')) await sql.query(statement);
}

it.skipIf(authorized)('BLOCKED: real Neon/Private Blob integration requires an explicitly authorized isolated target', () => {});

describe.runIf(authorized)('Phase 8G real Neon and Private Blob integration', () => {
  let sql: ReturnType<typeof neon>;
  let publisher: NeonSnapshotPublisher;
  let archive: VercelPrivateBlobArchive;
  let combinedSnapshot = '';
  let changedSnapshot = '';
  let disposableIdentityFingerprint = '';

  beforeAll(async () => {
    sql = neon(connectionString);
    await isDisposableTarget(sql);
    publisher = new NeonSnapshotPublisher(connectionString, environment);
    archive = new VercelPrivateBlobArchive(environment, process.env.PHASE8G_INTEGRATION_BLOB_STORE_ID);
    const identity = await publisher.inspectIdentity();
    expect(identity.fingerprint).toBe(environment.expectedDatabaseFingerprint);
    disposableIdentityFingerprint = identity.fingerprint;
    assertSafeEvidenceWrite(environment);
    await executeScript(migration);
    await sql.query('INSERT INTO evidence_environment_binding(singleton,namespace,runtime,isolation,database_fingerprint,writes_enabled) VALUES(true,$1,$2,$3,$4,true) ON CONFLICT(singleton) DO UPDATE SET namespace=excluded.namespace,runtime=excluded.runtime,isolation=excluded.isolation,database_fingerprint=excluded.database_fingerprint,writes_enabled=true', [namespace, environment.runtime, environment.isolation, identity.fingerprint]);
  }, 60_000);

  afterAll(async () => { if (!publisher || !sql || !disposableIdentityFingerprint) return; await isDisposableTarget(sql); const identity = await publisher.inspectIdentity(); const binding = await publisher.preflight(); if (process.env.PHASE8G_INTEGRATION_DISPOSABLE_CONFIRMATION !== 'DROP_PHASE8G_TEST_SCHEMA' || identity.fingerprint !== disposableIdentityFingerprint || binding.binding.runtime !== 'test' || binding.binding.namespace !== namespace || binding.binding.databaseFingerprint !== disposableIdentityFingerprint) throw new Error('Refusing integration teardown: disposable target identity changed'); await executeScript(down); }, 60_000);

  it('migrates and incrementally retains disjoint imports without duplicate projections', async () => {
    await publisher.verifyMigration();
    await importBsbEvidencePersistent({ xml: importA, archive, publisher, environment, now: '2026-10-09T12:00:00.000Z' });
    const combined = await importBsbEvidencePersistent({ xml: importB, archive, publisher, environment, now: '2026-10-09T12:05:00.000Z' });
    combinedSnapshot = combined.snapshotId;
    const repeated = await importBsbEvidencePersistent({ xml: importB, archive, publisher, environment, now: '2026-10-09T12:10:00.000Z' });
    expect(repeated.snapshotId).toBe(combined.snapshotId);
    const counts = rowsOf(await sql.query('SELECT (SELECT count(*) FROM evidence_record_version) AS versions, (SELECT count(*) FROM evidence_candidate_projection) AS candidates, (SELECT count(*) FROM evidence_snapshot) AS snapshots'));
    expect(counts[0]).toMatchObject({ versions: '4', candidates: '9', snapshots: '2' });
    const reader = new NeonEvidenceReader(connectionString);
    expect((await searchPersistedEvidence(reader, 'ادب فارسی', { provider: 'BSB_SRU_MARCXML' })).matches).toHaveLength(1);
    expect((await searchPersistedEvidence(reader, 'تاریخ ایران', { provider: 'BSB_SRU_MARCXML' })).matches).toHaveLength(1);
  }, 60_000);

  it('replaces a changed source version, keeps history, and preserves active state after failure', async () => {
    const changedA = collection(marcRecords[0].replace('ادب فارسی', 'ادب فارسی نو'));
    const changed = await importBsbEvidencePersistent({ xml: changedA, archive, publisher, environment, now: '2026-10-10T12:00:00.000Z' });
    changedSnapshot = changed.snapshotId;
    const history = rowsOf(await sql.query('SELECT count(*) AS count FROM evidence_record_version WHERE provider=$1 AND source_record_id=$2', ['BSB_SRU_MARCXML', '991071006889707356']));
    expect(history[0]?.count).toBe('2');
    const prepared = prepareBsbPublication({ xml: collection(marcRecords[1].replace('991144600686807356', 'phase8g-failure')), environment, now: '2026-10-10T12:10:00.000Z' });
    prepared.bundle.projections[0].candidate.contentHash = '0'.repeat(64);
    await expect(publisher.publish(prepared.bundle)).rejects.toThrow(/content hash/);
    const active = rowsOf(await sql.query('SELECT snapshot_id FROM evidence_active_snapshot WHERE singleton=true'));
    expect(active[0]?.snapshot_id).toBe(changedSnapshot);
  }, 60_000);

  it('serializes different concurrent imports and rolls back to the previous complete corpus', async () => {
    const importC = collection(marcRecords[0].replace('991071006889707356', 'phase8g-c-001').replace('ادب فارسی', 'جامعه ایران'));
    const importD = collection(marcRecords[1].replace('991144600686807356', 'phase8g-d-001').replace('ادب فارسى :', 'زبان ایران :'));
    const results = await Promise.allSettled([importBsbEvidencePersistent({ xml: importC, archive, publisher, environment, now: '2026-10-11T12:00:00.000Z' }), importBsbEvidencePersistent({ xml: importD, archive, publisher, environment, now: '2026-10-11T12:00:01.000Z' })]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    const reader = new NeonEvidenceReader(connectionString);
    expect((await searchPersistedEvidence(reader, 'جامعه ایران')).matches).toHaveLength(1);
    const dRows = rowsOf(await sql.query("SELECT candidate_json FROM evidence_active_snapshot active JOIN evidence_candidate_projection projection ON projection.snapshot_id=active.snapshot_id WHERE projection.candidate_json->'sourceRecordIds' ? $1 LIMIT 1", ['phase8g-d-001']));
    const dForm = (dRows[0]?.candidate_json as { originalPersianForm?: unknown } | undefined)?.originalPersianForm;
    expect(typeof dForm).toBe('string');
    expect((await searchPersistedEvidence(reader, String(dForm))).matches).toHaveLength(1);
    await publisher.restore(combinedSnapshot, '2026-10-12T12:00:00.000Z');
    expect((await publisher.verifySnapshot(combinedSnapshot)).activeSnapshotId).toBe(combinedSnapshot);
    expect((await searchPersistedEvidence(reader, 'ادب فارسی')).matches).toHaveLength(1);
    expect((await searchPersistedEvidence(reader, 'تاریخ ایران')).matches).toHaveLength(1);
  }, 60_000);

  it('fails closed for mismatched, shared Preview, and unapproved Production targets', async () => {
    const mismatched = new NeonSnapshotPublisher(connectionString, { ...environment, expectedDatabaseFingerprint: '0'.repeat(64) });
    await expect(mismatched.preflight()).rejects.toThrow(/identity/);
    expect(() => assertSafeEvidenceWrite({ ...environment, runtime: 'preview', isolation: 'SHARED_OR_UNKNOWN' })).toThrow(/unknown or shared/);
    expect(() => assertSafeEvidenceWrite({ ...environment, runtime: 'production', productionApproval: false })).toThrow(/owner approval/);
  });
});
