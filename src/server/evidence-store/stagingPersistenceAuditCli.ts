/** Read-only audit of the persistent Phase 8G corpus. Never mutates the database. */
import { neon } from '@neondatabase/serverless';
import { databaseIdentityFingerprint } from './guard';

const branchId = 'br-noisy-field-b2m5q1zb';
const host = 'ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const fingerprint = '721280eed36907f5da9a76e5937c2bda28c70bc9cc01e695d4c6072f80fbeae2';
const snapshot = 'snapshot-7946161b2af2652b776a6bd4';
async function main(): Promise<void> {
  const url = process.env.PHASE8G_STAGING_DATABASE_URL;
  if (!url || new URL(url).hostname.toLowerCase() !== host
    || process.env.PHASE8G_STAGING_DATABASE_FINGERPRINT !== fingerprint) throw new Error('Staging configuration mismatch');
  const sql = neon(url);
  const identityResult = await sql.query("SELECT current_setting('neon.branch_id',true) AS branch_id,current_database() AS db,current_user AS username,current_schema() AS schema");
  const identity = Array.isArray(identityResult) ? identityResult[0] : undefined;
  if (!identity || identity.branch_id !== branchId) throw new Error('Unexpected Neon branch ID');
  if (databaseIdentityFingerprint({host,database:String(identity.db),user:String(identity.username),schema:String(identity.schema)}) !== fingerprint) throw new Error('Database fingerprint mismatch');
  const bindingResult = await sql.query('SELECT namespace,runtime,isolation,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true');
  const binding = Array.isArray(bindingResult) ? bindingResult[0] : undefined;
  if (!binding || binding.namespace !== 'phase8g_staging' || binding.runtime !== 'preview'
      || binding.isolation !== 'ISOLATED_NEON_BRANCH' || binding.database_fingerprint !== fingerprint
      || binding.writes_enabled !== false) throw new Error('Unexpected binding or staging writes remain enabled');
  const metricsResult = await sql.query(`
    SELECT
      (SELECT count(*)::int FROM evidence_acquisition_run WHERE status='COMPLETE') AS completed_runs,
      (SELECT count(*)::int FROM evidence_raw_source) AS raw_sources,
      (SELECT count(*)::int FROM evidence_record_version) AS versions,
      (SELECT count(*)::int FROM evidence_candidate_projection) AS projections,
      (SELECT count(*)::int FROM evidence_snapshot) AS snapshots,
      (SELECT snapshot_id FROM evidence_active_snapshot WHERE singleton=true) AS active_snapshot
  `);
  const metrics = Array.isArray(metricsResult) ? metricsResult[0] : undefined;
  if (!metrics || metrics.active_snapshot !== snapshot || Number(metrics.raw_sources) < 1
    || Number(metrics.versions) < 2 || Number(metrics.projections) < 3 || Number(metrics.snapshots) < 1
    || Number(metrics.completed_runs) < 1) throw new Error('Unexpected persisted BSB evidence metrics');
  const checkResult = await sql.query(`
    SELECT s.status, s.candidate_count,
      (SELECT count(*)::int FROM evidence_candidate_projection p WHERE p.snapshot_id=s.snapshot_id) AS actual_candidate_count,
      s.manifest_checksum = evidence_manifest_checksum(s.schema_version,s.extraction_version,s.source_version_ids,s.manifest_json->'candidates') AS checksum_matches,
      NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(s.source_version_ids) src(id)
        WHERE NOT EXISTS(SELECT 1 FROM evidence_record_version v WHERE v.version_id=src.id)
      ) AS sources_exist
    FROM evidence_snapshot s WHERE s.snapshot_id=$1
  `,[snapshot]);
  const check = Array.isArray(checkResult) ? checkResult[0] : undefined;
  if (!check || check.status !== 'ACTIVE' || check.checksum_matches !== true
      || check.sources_exist !== true || Number(check.candidate_count) !== Number(check.actual_candidate_count)
      || Number(check.candidate_count) !== 3) throw new Error('Active snapshot integrity verification failed');
  console.log(JSON.stringify({status:'STAGING_PERSISTENCE_AUDIT_OK', branchId,
    activeSnapshot: snapshot, completedRuns:metrics.completed_runs,
    rawSources:metrics.raw_sources,recordVersions:metrics.versions,
    candidateProjections:metrics.projections, snapshotCount:metrics.snapshots,
    activeCandidateCount:check.candidate_count, checksumVerified:true,
    sourceReferencesVerified:true, writesEnabled:false, changesMade:false}));
}
main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:'Staging audit failed');process.exitCode=1;});
