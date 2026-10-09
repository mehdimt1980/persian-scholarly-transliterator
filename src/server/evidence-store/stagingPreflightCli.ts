/** Read-only verification of the persistent Phase 8G staging target.
 * No migrations, DML, Blob uploads, or teardown.
 */
import { neon } from '@neondatabase/serverless';
import { databaseIdentityFingerprint } from './guard';

const expectedBranchId = 'br-noisy-field-b2m5q1zb';
const expectedHost = 'ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const expectedTables = [
  'evidence_environment_binding',
  'evidence_acquisition_run',
  'evidence_raw_source',
  'evidence_record_version',
  'evidence_snapshot',
  'evidence_candidate_projection',
  'evidence_active_snapshot',
];

function requireValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required staging configuration: ${name}`);
  return value;
}

async function main(): Promise<void> {
  const connectionString = requireValue('PHASE8G_STAGING_DATABASE_URL');
  const expectedFingerprint = requireValue('PHASE8G_STAGING_DATABASE_FINGERPRINT');
  const configuredBlobStoreId = requireValue('PHASE8G_STAGING_BLOB_STORE_ID');
  if (!/^[a-f0-9]{64}$/.test(expectedFingerprint)) throw new Error('Invalid staging fingerprint');
  if (configuredBlobStoreId.length < 3) throw new Error('Missing staging Blob store ID');
  const parsedUrl = new URL(connectionString);
  if (parsedUrl.protocol !== 'postgresql:' && parsedUrl.protocol !== 'postgres:') throw new Error('Invalid Neon URL protocol');
  if (parsedUrl.hostname.toLowerCase() !== expectedHost) throw new Error('Refusing non-staging Neon host');

  // SELECT-only queries; before reading the binding, verify the actual Neon branch.
  const sql = neon(connectionString);
  const identityResult = await sql.query(
    "SELECT current_setting('neon.branch_id', true) AS branch_id, current_database() AS database, current_user AS username, current_schema() AS schema"
  );
  const identity = Array.isArray(identityResult) ? identityResult[0] : undefined;
  if (!identity || identity.branch_id !== expectedBranchId) throw new Error('Wrong Neon branch ID; staging preflight refused');
  if (identity.database !== 'neondb' || identity.username !== 'neondb_owner' || identity.schema !== 'public') {
    throw new Error('Unexpected staging database/user/schema');
  }
  const fingerprint = databaseIdentityFingerprint({
    host: parsedUrl.hostname.toLowerCase(),
    database: String(identity.database),
    user: String(identity.username),
    schema: String(identity.schema),
  });
  if (fingerprint !== expectedFingerprint) throw new Error('Staging database fingerprint mismatch');

  const tablesResult = await sql.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name LIKE 'evidence\\_%' ESCAPE '\\'"
  );
  const tableNames = new Set((Array.isArray(tablesResult) ? tablesResult : []).map((row) => String(row.table_name)));
  const missing = expectedTables.filter((name) => !tableNames.has(name));
  if (missing.length) throw new Error(`Missing evidence tables: ${missing.join(', ')}`);

  const bindingResult = await sql.query(
    'SELECT namespace,runtime,isolation,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true'
  );
  const binding = Array.isArray(bindingResult) ? bindingResult[0] : undefined;
  if (!binding || binding.namespace !== 'phase8g_staging' || binding.runtime !== 'preview'
      || binding.isolation !== 'ISOLATED_NEON_BRANCH' || binding.database_fingerprint !== fingerprint
      || binding.writes_enabled !== false) {
    throw new Error('Unexpected staging binding; read-only preflight requires writes_enabled=false');
  }

  const migrationResult = await sql.query(
    "SELECT to_regprocedure('evidence_manifest_checksum(text,text,jsonb,jsonb)') AS checksum_function"
  );
  const migrationRow = Array.isArray(migrationResult) ? migrationResult[0] : undefined;
  if (!migrationRow?.checksum_function) throw new Error('Evidence checksum function is missing');

  console.log(JSON.stringify({
    status: 'READ_ONLY_PREFLIGHT_OK',
    branchId: expectedBranchId,
    databaseFingerprint: fingerprint,
    evidenceTables: expectedTables.length,
    bindingWritesEnabled: false,
    blobStore: 'CONFIGURED_ID_ONLY_NOT_NETWORK_VERIFIED',
  }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Staging preflight failed');
  process.exitCode = 1;
});
