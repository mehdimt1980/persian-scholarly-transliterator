import { neon } from '@neondatabase/serverless';
import { lexicalCandidateSchema } from '../../validation/lexical-evidence/schema';
import type { EvidenceProvider, LexicalCandidate, LexicalCandidateCategory } from '../../validation/lexical-evidence/types';
import { assertAdministrator, assertDatabaseBinding, databaseIdentityFingerprint, type DatabaseBinding, type DatabaseIdentity, type WriteEnvironment } from './guard';
import type { AcquisitionRun, CandidateProjection, RawSourceObject, RecordVersion, RetrievalSnapshot } from './types';

type SqlClient = ReturnType<typeof neon>;
const rowsOf = (result: Awaited<ReturnType<SqlClient['query']>>): Record<string, unknown>[] => Array.isArray(result) ? result as Record<string, unknown>[] : [];
export interface NeonPublicationBundle { run: AcquisitionRun; raw: RawSourceObject; versions: RecordVersion[]; projections: CandidateProjection[]; snapshot: RetrievalSnapshot; }
export interface PublicationResult { snapshotId: string; previousSnapshotId: string | null; activeSnapshotId: string; recordVersionCount: number; candidateCount: number; }

function connectionHost(connectionString: string): string {
  try { return new URL(connectionString).hostname.toLowerCase(); } catch { throw new Error('DATABASE_URL is invalid'); }
}

export class NeonEvidenceReader {
  private readonly sql: SqlClient;
  constructor(connectionString: string) { if (!connectionString) throw new Error('DATABASE_URL is required'); this.sql = neon(connectionString); }
  async activeCandidates(query: string, normalized: string, options: { category?: LexicalCandidateCategory; provider?: EvidenceProvider; limit: number }): Promise<LexicalCandidate[]> {
    const rows = rowsOf(await this.sql.query('SELECT cp.candidate_json FROM evidence_active_snapshot a JOIN evidence_candidate_projection cp ON cp.snapshot_id = a.snapshot_id WHERE a.singleton = true AND (cp.persian_form = $1 OR cp.normalized_form = $2) AND ($3::text IS NULL OR cp.category = $3) AND ($4::text IS NULL OR cp.provider = $4) ORDER BY cp.candidate_id, cp.source_version_id LIMIT $5', [query, normalized, options.category ?? null, options.provider ?? null, options.limit]));
    return rows.map((row) => lexicalCandidateSchema.parse(row.candidate_json));
  }
}

export class NeonSnapshotPublisher {
  private readonly sql: SqlClient;
  private readonly host: string;
  constructor(connectionString: string, private readonly environment: WriteEnvironment) {
    if (!connectionString) throw new Error('DATABASE_URL is required');
    this.host = connectionHost(connectionString);
    this.sql = neon(connectionString);
  }

  async inspectIdentity(): Promise<DatabaseIdentity> {
    const rows = rowsOf(await this.sql.query('SELECT current_database() AS database, current_user AS user, current_schema() AS schema'));
    const row = rows[0];
    if (!row || typeof row.database !== 'string' || typeof row.user !== 'string' || typeof row.schema !== 'string') throw new Error('Could not establish database identity');
    const identity = { host: this.host, database: row.database, user: row.user, schema: row.schema };
    return { ...identity, fingerprint: databaseIdentityFingerprint(identity) };
  }

  async preflight(): Promise<{ identity: DatabaseIdentity; binding: DatabaseBinding }> {
    const identity = await this.inspectIdentity();
    const rows = rowsOf(await this.sql.query('SELECT namespace, runtime, isolation, database_fingerprint, writes_enabled FROM evidence_environment_binding WHERE singleton = true'));
    const row = rows[0];
    if (!row) throw new Error('Database has no evidence environment binding');
    const binding = { namespace: String(row.namespace), runtime: String(row.runtime) as DatabaseBinding['runtime'], isolation: String(row.isolation) as DatabaseBinding['isolation'], databaseFingerprint: String(row.database_fingerprint), writesEnabled: row.writes_enabled === true };
    assertDatabaseBinding(this.environment, identity, binding);
    return { identity, binding };
  }

  async verifyMigration(): Promise<void> {
    await this.preflight();
    const rows = rowsOf(await this.sql.query("SELECT to_regclass('evidence_snapshot') AS snapshot, to_regclass('evidence_candidate_projection') AS projection, to_regclass('evidence_active_snapshot') AS active, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='evidence_snapshot' AND column_name='manifest_json') AS has_manifest"));
    if (!rows[0]?.snapshot || !rows[0]?.projection || !rows[0]?.active || rows[0]?.has_manifest !== true) throw new Error('Phase 8G migration is incomplete');
  }

  async publish(bundle: NeonPublicationBundle): Promise<PublicationResult> {
    const { identity } = await this.preflight();
    if (bundle.snapshot.status !== 'VERIFIED' || bundle.snapshot.candidateCount !== bundle.projections.length || !bundle.snapshot.manifest) throw new Error('Only a complete verified snapshot can be published');
    if (bundle.projections.some((item) => item.snapshotId !== bundle.snapshot.snapshotId || item.candidate.reviewStatus !== 'UNREVIEWED' || item.candidate.authorityStatus !== 'NON_AUTHORITATIVE_CANDIDATE')) throw new Error('BSB publication cannot contain authoritative or mismatched candidates');
    const previousRows = rowsOf(await this.sql.query('SELECT snapshot_id FROM evidence_active_snapshot WHERE singleton = true'));
    const previousSnapshotId = typeof previousRows[0]?.snapshot_id === 'string' ? previousRows[0].snapshot_id : null;
    const queries = [
      this.sql`SELECT pg_advisory_xact_lock(hashtext('phase8g-evidence-publication'))`,
      this.sql.query('SELECT 1 / count(*)::int AS environment_guard FROM evidence_environment_binding WHERE singleton=true AND namespace=$1 AND runtime=$2 AND isolation=$3 AND database_fingerprint=$4 AND writes_enabled=true', [this.environment.namespace, this.environment.runtime, this.environment.isolation, identity.fingerprint]),
      this.sql`INSERT INTO evidence_acquisition_run(run_id,provider,query_plan,request_budget,record_budget,status,started_at,ended_at,error_details) VALUES (${bundle.run.runId},${bundle.run.provider},${JSON.stringify(bundle.run.queryPlan)}::jsonb,${bundle.run.requestBudget},${bundle.run.recordBudget},'RUNNING',${bundle.run.startedAt},NULL,NULL) ON CONFLICT (run_id) DO NOTHING`,
      this.sql`INSERT INTO evidence_raw_source(checksum,provider,blob_path,content_length,content_type,retrieved_at,license_url,run_id) VALUES (${bundle.raw.checksum},${bundle.raw.provider},${bundle.raw.blobPath},${bundle.raw.contentLength},${bundle.raw.contentType},${bundle.raw.retrievedAt},${bundle.raw.licenseUrl},${bundle.raw.runId}) ON CONFLICT (checksum) DO NOTHING`,
      ...bundle.versions.flatMap((version) => [this.sql`UPDATE evidence_record_version SET is_current=false,last_seen_at=${version.lastSeenAt} WHERE provider=${version.provider} AND source_record_id=${version.sourceRecordId} AND version_id<>${version.versionId}`, this.sql`INSERT INTO evidence_record_version(version_id,provider,source_record_id,record_checksum,raw_checksum,marc_json,language_evidence,first_seen_at,last_seen_at,is_current) VALUES (${version.versionId},${version.provider},${version.sourceRecordId},${version.recordChecksum},${version.rawChecksum},${JSON.stringify(version.marc)}::jsonb,${JSON.stringify(version.languageEvidence)}::jsonb,${version.firstSeenAt},${version.lastSeenAt},true) ON CONFLICT (version_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,is_current=true`]),
      this.sql`INSERT INTO evidence_snapshot(snapshot_id,schema_version,extraction_version,source_version_ids,candidate_count,manifest_checksum,manifest_json,status,created_at,activated_at) VALUES (${bundle.snapshot.snapshotId},${bundle.snapshot.schemaVersion},${bundle.snapshot.extractionVersion},${JSON.stringify(bundle.snapshot.sourceVersionIds)}::jsonb,${bundle.snapshot.candidateCount},${bundle.snapshot.manifestChecksum},${JSON.stringify(bundle.snapshot.manifest)}::jsonb,'DRAFT',${bundle.snapshot.createdAt},NULL) ON CONFLICT (snapshot_id) DO NOTHING`,
      ...bundle.projections.map((projection) => this.sql`INSERT INTO evidence_candidate_projection(snapshot_id,candidate_id,source_version_id,provider,persian_form,normalized_form,category,candidate_json,content_hash,review_status,authority_status) VALUES (${bundle.snapshot.snapshotId},${projection.candidate.candidateId},${projection.sourceVersionId},'BSB_SRU_MARCXML',${projection.candidate.originalPersianForm},${projection.candidate.normalizedSearchForm},${projection.candidate.category},${JSON.stringify(projection.candidate)}::jsonb,${projection.candidate.contentHash},'UNREVIEWED','NON_AUTHORITATIVE_CANDIDATE') ON CONFLICT DO NOTHING`),
      this.sql`UPDATE evidence_snapshot SET status='VERIFIED' WHERE snapshot_id=${bundle.snapshot.snapshotId} AND candidate_count=(SELECT count(*) FROM evidence_candidate_projection WHERE snapshot_id=${bundle.snapshot.snapshotId}) AND manifest_json->'candidates'=(SELECT jsonb_agg(jsonb_build_object('candidateId',candidate_id,'contentHash',content_hash,'sourceVersionId',source_version_id) ORDER BY candidate_id,source_version_id) FROM evidence_candidate_projection WHERE snapshot_id=${bundle.snapshot.snapshotId}) AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(source_version_ids) AS manifest_id(version_id) WHERE NOT EXISTS (SELECT 1 FROM evidence_record_version rv WHERE rv.version_id=manifest_id.version_id))`,
      this.sql`SELECT 1 / count(*)::int AS publication_guard FROM evidence_snapshot WHERE snapshot_id=${bundle.snapshot.snapshotId} AND status='VERIFIED'`,
      this.sql`UPDATE evidence_snapshot SET status='RETIRED' WHERE status='ACTIVE' AND schema_version='phase8g-snapshot-v1' AND snapshot_id<>${bundle.snapshot.snapshotId}`,
      this.sql`INSERT INTO evidence_active_snapshot(singleton,snapshot_id) SELECT true,${bundle.snapshot.snapshotId} FROM evidence_snapshot WHERE snapshot_id=${bundle.snapshot.snapshotId} AND status='VERIFIED' ON CONFLICT(singleton) DO UPDATE SET snapshot_id=excluded.snapshot_id`,
      this.sql`UPDATE evidence_snapshot SET status='ACTIVE',activated_at=${bundle.snapshot.activatedAt ?? bundle.run.endedAt} WHERE snapshot_id=${bundle.snapshot.snapshotId} AND EXISTS(SELECT 1 FROM evidence_active_snapshot WHERE snapshot_id=${bundle.snapshot.snapshotId})`,
      this.sql`UPDATE evidence_acquisition_run SET status='COMPLETE',ended_at=${bundle.run.endedAt} WHERE run_id=${bundle.run.runId}`,
    ];
    // The transaction-scoped advisory lock serializes publishers before any state mutation.
    // READ COMMITTED lets a waiter observe the preceding publisher after acquiring that lock.
    await this.sql.transaction(queries, { isolationLevel: 'ReadCommitted' });
    return this.verifySnapshot(bundle.snapshot.snapshotId, previousSnapshotId);
  }

  async verifySnapshot(snapshotId: string, previousSnapshotId: string | null = null): Promise<PublicationResult> {
    const rows = rowsOf(await this.sql.query('SELECT s.snapshot_id, s.candidate_count, (SELECT count(*) FROM evidence_record_version rv WHERE rv.version_id IN (SELECT jsonb_array_elements_text(s.source_version_ids))) AS version_count, a.snapshot_id AS active_snapshot_id FROM evidence_snapshot s LEFT JOIN evidence_active_snapshot a ON a.singleton=true WHERE s.snapshot_id=$1 AND s.status=$2', [snapshotId, 'ACTIVE']));
    const row = rows[0];
    if (!row || row.active_snapshot_id !== snapshotId || Number(row.candidate_count) < 1) throw new Error('Published snapshot failed read-back verification');
    return { snapshotId, previousSnapshotId, activeSnapshotId: String(row.active_snapshot_id), recordVersionCount: Number(row.version_count), candidateCount: Number(row.candidate_count) };
  }

  async restore(snapshotId: string, now: string): Promise<void> {
    assertAdministrator(this.environment);
    const { identity } = await this.preflight();
    await this.sql.transaction([
      this.sql`SELECT pg_advisory_xact_lock(hashtext('phase8g-evidence-publication'))`,
      this.sql.query('SELECT 1 / count(*)::int AS environment_guard FROM evidence_environment_binding WHERE singleton=true AND namespace=$1 AND runtime=$2 AND isolation=$3 AND database_fingerprint=$4 AND writes_enabled=true', [this.environment.namespace, this.environment.runtime, this.environment.isolation, identity.fingerprint]),
      this.sql`SELECT 1 / count(*)::int AS snapshot_guard FROM evidence_snapshot WHERE snapshot_id=${snapshotId} AND status IN ('VERIFIED','RETIRED','ACTIVE')`,
      this.sql`UPDATE evidence_snapshot SET status='RETIRED' WHERE status='ACTIVE' AND schema_version='phase8g-snapshot-v1'`,
      this.sql`UPDATE evidence_snapshot SET status='ACTIVE',activated_at=${now} WHERE snapshot_id=${snapshotId}`,
      this.sql`INSERT INTO evidence_active_snapshot(singleton,snapshot_id) VALUES (true,${snapshotId}) ON CONFLICT(singleton) DO UPDATE SET snapshot_id=excluded.snapshot_id`,
    ], { isolationLevel: 'ReadCommitted' });
  }
}
