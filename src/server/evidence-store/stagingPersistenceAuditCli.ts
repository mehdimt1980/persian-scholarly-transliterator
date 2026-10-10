/** Read-only audit of the persistent Phase 8G corpus. Never mutates the database. */
import { neon } from '@neondatabase/serverless';
import { databaseIdentityFingerprint } from './guard';

const branchId = 'br-noisy-field-b2m5q1zb';
const host = 'ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const fingerprint = '721280eed36907f5da9a76e5937c2bda28c70bc9cc01e695d4c6072f80fbeae2';
const reviewBaselineSnapshot = 'snapshot-f76feb36ca85541c8faafb42';
const rollbackSnapshot = 'snapshot-7946161b2af2652b776a6bd4';
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
  const activeSnapshot=String(metrics?.active_snapshot??'');
  if (!metrics || !/^snapshot-[0-9a-f]{24}$/u.test(activeSnapshot) || Number(metrics.raw_sources) < 2
    || Number(metrics.versions) < 50 || Number(metrics.projections) < 78 || Number(metrics.snapshots) < 2
    || Number(metrics.completed_runs) < 2) throw new Error('Unexpected persisted BSB evidence metrics');
  const checkResult = await sql.query(`
    SELECT s.status, s.candidate_count,
      (SELECT count(*)::int FROM evidence_candidate_projection p WHERE p.snapshot_id=s.snapshot_id) AS actual_candidate_count,
      s.manifest_checksum = evidence_manifest_checksum(s.schema_version,s.extraction_version,s.source_version_ids,s.manifest_json->'candidates') AS checksum_matches,
      NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(s.source_version_ids) src(id)
        WHERE NOT EXISTS(SELECT 1 FROM evidence_record_version v WHERE v.version_id=src.id)
      ) AS sources_exist
    FROM evidence_snapshot s WHERE s.snapshot_id=$1
  `,[activeSnapshot]);
  const check = Array.isArray(checkResult) ? checkResult[0] : undefined;
  if (!check || check.status !== 'ACTIVE' || check.checksum_matches !== true
      || check.sources_exist !== true || Number(check.candidate_count) !== Number(check.actual_candidate_count)
      || (Number(check.candidate_count)!==75 && (Number(check.candidate_count)<750 || Number(check.candidate_count)>10000))) throw new Error('Active snapshot integrity verification failed');
  const rollbackResult=await sql.query(`
    SELECT s.status,s.candidate_count,
      s.manifest_checksum=evidence_manifest_checksum(s.schema_version,s.extraction_version,s.source_version_ids,s.manifest_json->'candidates') AS checksum_matches,
      (SELECT count(*)::int FROM evidence_candidate_projection p WHERE p.snapshot_id=s.snapshot_id) AS actual_candidate_count
    FROM evidence_snapshot s WHERE s.snapshot_id=$1
  `,[rollbackSnapshot]);
  const rollback=Array.isArray(rollbackResult)?rollbackResult[0]:undefined;
  if(!rollback||rollback.status!=='RETIRED'||Number(rollback.candidate_count)!==3
    ||Number(rollback.actual_candidate_count)!==3||rollback.checksum_matches!==true)
    throw new Error('Previous three-candidate snapshot is missing or unsafe to restore');
  const originalRefsResult=await sql.query(`
    SELECT count(*)::int AS old_sources FROM evidence_record_version v
    WHERE v.source_record_id=ANY($1) AND v.version_id IN
      (SELECT jsonb_array_elements_text(s.source_version_ids) FROM evidence_snapshot s WHERE s.snapshot_id=$2)
  `,[['991071006889707356','991144600686807356'],activeSnapshot]);
  const originalRefs=Array.isArray(originalRefsResult)?originalRefsResult[0]:undefined;
  if(Number(originalRefs?.old_sources)!==2)throw new Error('Active snapshot lost the original source record versions');
  const baselineRows=await sql.query(`
    SELECT s.status,s.candidate_count,
      s.manifest_checksum=evidence_manifest_checksum(s.schema_version,s.extraction_version,s.source_version_ids,s.manifest_json->'candidates') AS checksum_matches,
      (SELECT count(*)::int FROM evidence_candidate_projection p WHERE p.snapshot_id=s.snapshot_id) AS projections
    FROM evidence_snapshot s WHERE s.snapshot_id=$1
  `,[reviewBaselineSnapshot]);
  const baseline=Array.isArray(baselineRows)?baselineRows[0]:undefined;
  if(!baseline||baseline.status!==(activeSnapshot===reviewBaselineSnapshot?'ACTIVE':'RETIRED')
    ||Number(baseline.candidate_count)!==75||Number(baseline.projections)!==75||baseline.checksum_matches!==true)
    throw new Error('Original 75-candidate scholarly review rollback baseline lost');
  const authority=await sql.query(`
    SELECT count(*)::int AS bad FROM evidence_candidate_projection p WHERE p.snapshot_id=$1
      AND (p.review_status<>'UNREVIEWED' OR p.authority_status<>'NON_AUTHORITATIVE_CANDIDATE')
  `,[activeSnapshot]);
  const bad=Array.isArray(authority)?authority[0]:undefined;
  if(Number(bad?.bad)!==0)throw new Error('Unreviewed source evidence gained unauthorized authority');
  console.log(JSON.stringify({status:'STAGING_PERSISTENCE_AUDIT_OK', branchId,
    previousSnapshot:rollbackSnapshot,rollbackVerified:true,oldSourceVersionsRetained:2,
    activeSnapshot, reviewBaselineSnapshot,reviewBaselineRetained:true, completedRuns:metrics.completed_runs,
    rawSources:metrics.raw_sources,recordVersions:metrics.versions,
    candidateProjections:metrics.projections, snapshotCount:metrics.snapshots,
    activeCandidateCount:check.candidate_count, checksumVerified:true,
    sourceReferencesVerified:true, writesEnabled:false, changesMade:false}));
}
main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:'Staging audit failed');process.exitCode=1;});
