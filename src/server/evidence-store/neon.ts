import { neon } from '@neondatabase/serverless';
import { lexicalCandidateSchema } from '../../validation/lexical-evidence/schema';
import type { EvidenceProvider, LexicalCandidate, LexicalCandidateCategory } from '../../validation/lexical-evidence/types';
import { assertAdministrator, assertDatabaseBinding, databaseIdentityFingerprint, type DatabaseBinding, type DatabaseIdentity, type WriteEnvironment } from './guard';
import type { AcquisitionRun, CandidateProjection, RawSourceObject, RecordVersion, RetrievalSnapshot, SnapshotUpdateMode } from './types';
import { assertCandidateContentHash } from './publication';

type SqlClient = ReturnType<typeof neon>;
const rowsOf = (result: unknown): Record<string, unknown>[] => Array.isArray(result) ? result as Record<string, unknown>[] : [];
export interface NeonPublicationBundle { mode: SnapshotUpdateMode; run: AcquisitionRun; raw: RawSourceObject; versions: RecordVersion[]; projections: CandidateProjection[]; snapshot: RetrievalSnapshot; expectedBaseline?: { snapshotId: string; manifestChecksum: string }; }
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
    const rows = rowsOf(await this.sql.query("SELECT to_regclass('evidence_snapshot') AS snapshot, to_regclass('evidence_candidate_projection') AS projection, to_regclass('evidence_active_snapshot') AS active, to_regprocedure('evidence_manifest_checksum(text,text,jsonb,jsonb)') AS checksum_function, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='evidence_snapshot' AND column_name='manifest_json') AS has_manifest"));
    if (!rows[0]?.snapshot || !rows[0]?.projection || !rows[0]?.active || !rows[0]?.checksum_function || rows[0]?.has_manifest !== true) throw new Error('Phase 8G migration is incomplete');
  }

  async publish(bundle: NeonPublicationBundle): Promise<PublicationResult> {
    const { identity } = await this.preflight();
    if (bundle.snapshot.status !== 'VERIFIED' || bundle.snapshot.candidateCount !== bundle.projections.length || !bundle.snapshot.manifest) throw new Error('Only a complete verified snapshot can be published');
    if (bundle.projections.some((item) => item.snapshotId !== bundle.snapshot.snapshotId || item.candidate.reviewStatus !== 'UNREVIEWED' || item.candidate.authorityStatus !== 'NON_AUTHORITATIVE_CANDIDATE')) throw new Error('BSB publication cannot contain authoritative or mismatched candidates');
    for (const projection of bundle.projections) assertCandidateContentHash(projection.candidate);
    const queries = [
      this.sql`SELECT pg_advisory_xact_lock(hashtext('phase8g-evidence-publication'))`,
      this.sql.query('SELECT 1 / count(*)::int AS environment_guard FROM evidence_environment_binding WHERE singleton=true AND namespace=$1 AND runtime=$2 AND isolation=$3 AND database_fingerprint=$4 AND writes_enabled=true', [this.environment.namespace, this.environment.runtime, this.environment.isolation, identity.fingerprint]),
      this.sql`SELECT snapshot_id FROM evidence_active_snapshot WHERE singleton=true`,
      ...(bundle.expectedBaseline ? [this.sql`SELECT 1 / count(*)::int AS pinned_baseline_guard FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id WHERE a.singleton=true AND s.status='ACTIVE' AND s.snapshot_id=${bundle.expectedBaseline.snapshotId} AND s.manifest_checksum=${bundle.expectedBaseline.manifestChecksum}`] : []),

      this.sql`INSERT INTO evidence_acquisition_run(run_id,provider,query_plan,request_budget,record_budget,status,started_at,ended_at,error_details) VALUES (${bundle.run.runId},${bundle.run.provider},${JSON.stringify(bundle.run.queryPlan)}::jsonb,${bundle.run.requestBudget},${bundle.run.recordBudget},'RUNNING',${bundle.run.startedAt},NULL,NULL) ON CONFLICT (run_id) DO NOTHING`,
      this.sql`INSERT INTO evidence_raw_source(checksum,provider,blob_path,content_length,content_type,retrieved_at,license_url,run_id) VALUES (${bundle.raw.checksum},${bundle.raw.provider},${bundle.raw.blobPath},${bundle.raw.contentLength},${bundle.raw.contentType},${bundle.raw.retrievedAt},${bundle.raw.licenseUrl},${bundle.raw.runId}) ON CONFLICT (checksum) DO NOTHING`,
      ...bundle.versions.flatMap((version) => [this.sql`UPDATE evidence_record_version SET is_current=false,last_seen_at=${version.lastSeenAt} WHERE provider=${version.provider} AND source_record_id=${version.sourceRecordId} AND version_id<>${version.versionId}`, this.sql`INSERT INTO evidence_record_version(version_id,provider,source_record_id,record_checksum,raw_checksum,marc_json,language_evidence,first_seen_at,last_seen_at,is_current) VALUES (${version.versionId},${version.provider},${version.sourceRecordId},${version.recordChecksum},${version.rawChecksum},${JSON.stringify(version.marc)}::jsonb,${JSON.stringify(version.languageEvidence)}::jsonb,${version.firstSeenAt},${version.lastSeenAt},true) ON CONFLICT (version_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,is_current=true`]),
      this.sql`CREATE TEMP TABLE evidence_import_source(provider text NOT NULL,source_record_id text NOT NULL,version_id text NOT NULL,PRIMARY KEY(provider,source_record_id)) ON COMMIT DROP`,
      this.sql`CREATE TEMP TABLE evidence_composed_source(version_id text PRIMARY KEY) ON COMMIT DROP`,
      this.sql`CREATE TEMP TABLE evidence_composed_projection(candidate_id text NOT NULL,source_version_id text NOT NULL,provider text NOT NULL,persian_form text NOT NULL,normalized_form text NOT NULL,category text NOT NULL,candidate_json jsonb NOT NULL,content_hash char(64) NOT NULL,review_status text NOT NULL,authority_status text NOT NULL,PRIMARY KEY(candidate_id,source_version_id)) ON COMMIT DROP`,
      ...bundle.versions.map((version) => this.sql`INSERT INTO evidence_import_source(provider,source_record_id,version_id) VALUES(${version.provider},${version.sourceRecordId},${version.versionId})`),
      this.sql`INSERT INTO evidence_composed_source(version_id) SELECT prior.version_id FROM evidence_active_snapshot active JOIN evidence_snapshot snapshot ON snapshot.snapshot_id=active.snapshot_id CROSS JOIN LATERAL jsonb_array_elements_text(snapshot.source_version_ids) prior(version_id) JOIN evidence_record_version version ON version.version_id=prior.version_id WHERE ${bundle.mode}='INCREMENTAL' AND NOT EXISTS(SELECT 1 FROM evidence_import_source incoming WHERE incoming.provider=version.provider AND incoming.source_record_id=version.source_record_id) ON CONFLICT DO NOTHING`,
      this.sql`INSERT INTO evidence_composed_projection(candidate_id,source_version_id,provider,persian_form,normalized_form,category,candidate_json,content_hash,review_status,authority_status) SELECT projection.candidate_id,projection.source_version_id,projection.provider,projection.persian_form,projection.normalized_form,projection.category,projection.candidate_json,projection.content_hash,projection.review_status,projection.authority_status FROM evidence_active_snapshot active JOIN evidence_candidate_projection projection ON projection.snapshot_id=active.snapshot_id JOIN evidence_record_version version ON version.version_id=projection.source_version_id WHERE ${bundle.mode}='INCREMENTAL' AND NOT EXISTS(SELECT 1 FROM evidence_import_source incoming WHERE incoming.provider=version.provider AND incoming.source_record_id=version.source_record_id) ON CONFLICT DO NOTHING`,
      this.sql`INSERT INTO evidence_composed_source(version_id) SELECT version_id FROM evidence_import_source ON CONFLICT DO NOTHING`,
      ...bundle.projections.map((projection) => this.sql`INSERT INTO evidence_composed_projection(candidate_id,source_version_id,provider,persian_form,normalized_form,category,candidate_json,content_hash,review_status,authority_status) VALUES(${projection.candidate.candidateId},${projection.sourceVersionId},'BSB_SRU_MARCXML',${projection.candidate.originalPersianForm},${projection.candidate.normalizedSearchForm},${projection.candidate.category},${JSON.stringify(projection.candidate)}::jsonb,${projection.candidate.contentHash},'UNREVIEWED','NON_AUTHORITATIVE_CANDIDATE') ON CONFLICT DO NOTHING`),
      this.sql`CREATE TEMP TABLE evidence_composed_manifest ON COMMIT DROP AS WITH source_list AS (SELECT COALESCE(jsonb_agg(version_id ORDER BY version_id),'[]'::jsonb) AS source_ids FROM evidence_composed_source),candidate_list AS (SELECT COALESCE(jsonb_agg(jsonb_build_object('candidateId',candidate_id,'contentHash',content_hash,'sourceVersionId',source_version_id) ORDER BY candidate_id,source_version_id),'[]'::jsonb) AS candidates,count(*)::integer AS candidate_count FROM evidence_composed_projection),manifest AS (SELECT source_ids,candidates,candidate_count,jsonb_build_object('schemaVersion',${bundle.snapshot.schemaVersion}::text,'extractionVersion',${bundle.snapshot.extractionVersion}::text,'sourceVersionIds',source_ids,'candidates',candidates) AS manifest_json FROM source_list,candidate_list) SELECT 'snapshot-' || left(evidence_manifest_checksum(${bundle.snapshot.schemaVersion},${bundle.snapshot.extractionVersion},source_ids,candidates),24) AS snapshot_id,source_ids,candidates,candidate_count,evidence_manifest_checksum(${bundle.snapshot.schemaVersion},${bundle.snapshot.extractionVersion},source_ids,candidates) AS manifest_checksum,manifest_json FROM manifest`,
      this.sql`INSERT INTO evidence_snapshot(snapshot_id,schema_version,extraction_version,source_version_ids,candidate_count,manifest_checksum,manifest_json,status,created_at,activated_at) SELECT snapshot_id,${bundle.snapshot.schemaVersion},${bundle.snapshot.extractionVersion},source_ids,candidate_count,manifest_checksum,manifest_json,'DRAFT',${bundle.snapshot.createdAt},NULL FROM evidence_composed_manifest ON CONFLICT(snapshot_id) DO NOTHING`,
      this.sql`INSERT INTO evidence_candidate_projection(snapshot_id,candidate_id,source_version_id,provider,persian_form,normalized_form,category,candidate_json,content_hash,review_status,authority_status) SELECT manifest.snapshot_id,projection.candidate_id,projection.source_version_id,projection.provider,projection.persian_form,projection.normalized_form,projection.category,projection.candidate_json,projection.content_hash,projection.review_status,projection.authority_status FROM evidence_composed_projection projection CROSS JOIN evidence_composed_manifest manifest ON CONFLICT DO NOTHING`,
      this.sql`UPDATE evidence_snapshot snapshot SET status='VERIFIED' FROM evidence_composed_manifest expected WHERE snapshot.snapshot_id=expected.snapshot_id AND snapshot.status='DRAFT' AND snapshot.candidate_count=(SELECT count(*) FROM evidence_candidate_projection projection WHERE projection.snapshot_id=snapshot.snapshot_id) AND snapshot.source_version_ids=expected.source_ids AND snapshot.manifest_json=expected.manifest_json AND expected.candidates=(SELECT COALESCE(jsonb_agg(jsonb_build_object('candidateId',projection.candidate_id,'contentHash',projection.content_hash,'sourceVersionId',projection.source_version_id) ORDER BY projection.candidate_id,projection.source_version_id),'[]'::jsonb) FROM evidence_candidate_projection projection WHERE projection.snapshot_id=snapshot.snapshot_id) AND snapshot.manifest_checksum=evidence_manifest_checksum(snapshot.schema_version,snapshot.extraction_version,snapshot.source_version_ids,snapshot.manifest_json->'candidates') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(snapshot.source_version_ids) source(version_id) WHERE NOT EXISTS(SELECT 1 FROM evidence_record_version version WHERE version.version_id=source.version_id)) AND NOT EXISTS(SELECT 1 FROM evidence_candidate_projection projection WHERE projection.snapshot_id=snapshot.snapshot_id AND (projection.content_hash::text<>projection.candidate_json->>'contentHash' OR NOT snapshot.source_version_ids ? projection.source_version_id))`,
      this.sql`SELECT 1 / count(*)::int AS publication_guard FROM evidence_snapshot snapshot JOIN evidence_composed_manifest expected ON expected.snapshot_id=snapshot.snapshot_id WHERE snapshot.status IN ('VERIFIED','ACTIVE') AND snapshot.manifest_checksum=expected.manifest_checksum`,
      this.sql`UPDATE evidence_snapshot SET status='RETIRED' WHERE status='ACTIVE' AND schema_version='phase8g-snapshot-v1' AND snapshot_id<>(SELECT snapshot_id FROM evidence_composed_manifest)`,
      this.sql`INSERT INTO evidence_active_snapshot(singleton,snapshot_id) SELECT true,snapshot_id FROM evidence_composed_manifest ON CONFLICT(singleton) DO UPDATE SET snapshot_id=excluded.snapshot_id`,
      this.sql`UPDATE evidence_snapshot SET status='ACTIVE',activated_at=COALESCE(activated_at,${bundle.snapshot.activatedAt ?? bundle.run.endedAt}) WHERE snapshot_id=(SELECT snapshot_id FROM evidence_composed_manifest)`,
      this.sql`UPDATE evidence_acquisition_run SET status='COMPLETE',ended_at=${bundle.run.endedAt} WHERE run_id=${bundle.run.runId}`,
      this.sql`SELECT snapshot_id FROM evidence_composed_manifest`,
    ];
    // The transaction-scoped advisory lock serializes publishers before any state mutation.
    // READ COMMITTED lets a waiter observe the preceding publisher after acquiring that lock.
    const results = await this.sql.transaction(queries, { isolationLevel: 'ReadCommitted' });
    const previousRows = rowsOf((results as unknown[])[2]);
    const finalRows = rowsOf((results as unknown[]).at(-1));
    const previousSnapshotId = typeof previousRows[0]?.snapshot_id === 'string' ? previousRows[0].snapshot_id : null;
    const snapshotId = finalRows[0]?.snapshot_id;
    if (typeof snapshotId !== 'string') throw new Error('Publication transaction did not return a snapshot identity');
    return this.verifySnapshot(snapshotId, previousSnapshotId);
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
