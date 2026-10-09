BEGIN;
CREATE TABLE IF NOT EXISTS evidence_acquisition_run (
  run_id text PRIMARY KEY, provider text NOT NULL CHECK (provider = 'BSB_SRU_MARCXML'), query_plan jsonb NOT NULL,
  request_budget integer NOT NULL CHECK (request_budget >= 0), record_budget integer NOT NULL CHECK (record_budget BETWEEN 0 AND 100),
  status text NOT NULL CHECK (status IN ('RUNNING','COMPLETE','FAILED')), started_at timestamptz NOT NULL, ended_at timestamptz, error_details jsonb
);
CREATE TABLE IF NOT EXISTS evidence_raw_source (
  checksum char(64) PRIMARY KEY CHECK (checksum ~ '^[0-9a-f]{64}$'), provider text NOT NULL, blob_path text UNIQUE NOT NULL,
  content_length bigint NOT NULL CHECK (content_length > 0 AND content_length <= 5000000), content_type text NOT NULL CHECK (content_type = 'application/marcxml+xml'),
  retrieved_at timestamptz NOT NULL, license_url text NOT NULL, run_id text NOT NULL REFERENCES evidence_acquisition_run(run_id)
);
CREATE TABLE IF NOT EXISTS evidence_record_version (
  version_id text PRIMARY KEY, provider text NOT NULL, source_record_id text NOT NULL, record_checksum char(64) NOT NULL,
  raw_checksum char(64) NOT NULL REFERENCES evidence_raw_source(checksum), marc_json jsonb NOT NULL, language_evidence jsonb NOT NULL,
  first_seen_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL, is_current boolean NOT NULL,
  UNIQUE(provider, source_record_id, record_checksum)
);
CREATE UNIQUE INDEX IF NOT EXISTS evidence_one_current_record ON evidence_record_version(provider, source_record_id) WHERE is_current;
CREATE TABLE IF NOT EXISTS evidence_snapshot (
  snapshot_id text PRIMARY KEY, schema_version text NOT NULL, extraction_version text NOT NULL, source_version_ids jsonb NOT NULL,
  candidate_count integer NOT NULL CHECK(candidate_count >= 0), manifest_checksum char(64) UNIQUE NOT NULL,
  status text NOT NULL CHECK(status IN ('DRAFT','VERIFIED','ACTIVE','RETIRED')), created_at timestamptz NOT NULL, activated_at timestamptz
);
CREATE TABLE IF NOT EXISTS evidence_candidate_projection (
  snapshot_id text NOT NULL REFERENCES evidence_snapshot(snapshot_id) ON DELETE RESTRICT, candidate_id text NOT NULL,
  source_version_id text NOT NULL REFERENCES evidence_record_version(version_id), provider text NOT NULL, persian_form text NOT NULL,
  normalized_form text NOT NULL, category text NOT NULL, candidate_json jsonb NOT NULL, content_hash char(64) NOT NULL,
  review_status text NOT NULL CHECK(review_status = 'UNREVIEWED'), authority_status text NOT NULL CHECK(authority_status = 'NON_AUTHORITATIVE_CANDIDATE'),
  PRIMARY KEY(snapshot_id, candidate_id, source_version_id)
);
CREATE INDEX IF NOT EXISTS evidence_candidate_exact ON evidence_candidate_projection(snapshot_id, persian_form, category, provider);
CREATE INDEX IF NOT EXISTS evidence_candidate_normalized ON evidence_candidate_projection(snapshot_id, normalized_form, category, provider);
CREATE TABLE IF NOT EXISTS evidence_active_snapshot (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), snapshot_id text NOT NULL REFERENCES evidence_snapshot(snapshot_id));
COMMIT;
