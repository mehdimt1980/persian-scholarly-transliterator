/** Controlled, non-destructive first persistent BSB import to isolated Neon Staging. */
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { NeonSnapshotPublisher, NeonEvidenceReader } from './neon';
import { VercelPrivateBlobArchive } from './vercelBlob';
import { importBsbEvidencePersistent } from './persistent';
import { searchPersistedEvidence } from './retrieval';
import { databaseIdentityFingerprint, type WriteEnvironment } from './guard';

const branchId = 'br-noisy-field-b2m5q1zb';
const hostname = 'ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const fingerprint = '721280eed36907f5da9a76e5937c2bda28c70bc9cc01e695d4c6072f80fbeae2';
const namespace = 'phase8g_staging';
const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required config: ${key}`);
  return value;
};
async function main(): Promise<void> {
  const action = process.argv[2] ?? 'verify';
  if (action !== 'verify' && action !== 'import') throw new Error('Only verify or import supported');
  const url = required('PHASE8G_STAGING_DATABASE_URL');
  const storeId = required('PHASE8G_STAGING_BLOB_STORE_ID');
  if (required('PHASE8G_STAGING_DATABASE_FINGERPRINT') !== fingerprint) throw new Error('Staging fingerprint configuration mismatch');
  if (new URL(url).hostname.toLowerCase() !== hostname) throw new Error('Unexpected Neon hostname');
  const sql = neon(url);
  const result = await sql.query("SELECT current_setting('neon.branch_id',true) AS branch_id, current_database() AS db, current_user AS username, current_schema() AS schema");
  const id = Array.isArray(result) ? result[0] : undefined;
  if (!id || id.branch_id !== branchId) throw new Error('Unexpected Neon branch');
  if (databaseIdentityFingerprint({host: hostname,database: String(id.db),user: String(id.username),schema: String(id.schema)}) !== fingerprint) throw new Error('Database identity mismatch');
  const environment: WriteEnvironment = {
    runtime: 'preview', namespace, isolation: 'ISOLATED_NEON_BRANCH',
    allowWrites: action === 'import', administrator: action === 'import',
    productionApproval: false, expectedDatabaseFingerprint: fingerprint, expectedBlobStoreId: storeId,
  };
  const rows = await sql.query('SELECT namespace,runtime,isolation,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true');
  const binding = Array.isArray(rows) ? rows[0] : undefined;
  if (!binding || binding.namespace !== namespace || binding.runtime !== 'preview'
      || binding.isolation !== 'ISOLATED_NEON_BRANCH' || binding.database_fingerprint !== fingerprint)
    throw new Error('Unexpected Staging binding');
  if (action === 'verify') {
    if (binding.writes_enabled !== false) throw new Error('Expected disabled writes during verify');
    const file = fs.readFileSync('validation/acquisition/bsb/authentic-selected-records.v1.xml', 'utf8');
    if (!file.includes('<record>')) throw new Error('BSB fixture has no records');
    console.log(JSON.stringify({status:'STAGING_IMPORT_READY', branchId, writesEnabled:false, fixturePresent:true, changesMade:false}));
    return;
  }
  if (required('PHASE8G_STAGING_IMPORT_APPROVED') !== 'IMPORT_AUTHENTIC_BSB_STAGING') throw new Error('Import not explicitly approved');
  if (binding.writes_enabled !== true) throw new Error('Staging database writes are not enabled by operator');
  required('BLOB_READ_WRITE_TOKEN');
  const publisher = new NeonSnapshotPublisher(url,environment);
  await publisher.verifyMigration();
  const archive = new VercelPrivateBlobArchive(environment,storeId);
  const xml = fs.readFileSync('validation/acquisition/bsb/authentic-selected-records.v1.xml','utf8');
  const outcome = await importBsbEvidencePersistent({xml,archive,publisher,environment,now:new Date().toISOString(),mode:'INCREMENTAL'});
  await publisher.verifySnapshot(outcome.snapshotId);
  const retrieval = await searchPersistedEvidence(new NeonEvidenceReader(url),'ادب فارسی',{limit:25});
  if (!retrieval.matches.length) throw new Error('Import completed but expected search result missing');
  console.log(JSON.stringify({status:'STAGING_IMPORT_VERIFIED',snapshotId:outcome.snapshotId,recordsObserved:outcome.recordsObserved,candidateCount:outcome.candidateCount,readback:true}));
}
main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:'Staging import failed');process.exitCode=1;});
