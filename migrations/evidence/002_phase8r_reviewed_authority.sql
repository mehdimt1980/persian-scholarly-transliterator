BEGIN;
CREATE TABLE IF NOT EXISTS phase8r_authority_environment_binding (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), namespace text NOT NULL,
  isolation text NOT NULL CHECK(isolation IN ('ISOLATED_NEON_BRANCH','ISOLATED_SCHEMA')),
  database_fingerprint char(64) NOT NULL CHECK(database_fingerprint ~ '^[0-9a-f]{64}$'), writes_enabled boolean NOT NULL DEFAULT false,
  configured_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS phase8r_authority_entry (
  entry_id text PRIMARY KEY, normalized_persian text NOT NULL, persian_surface text NOT NULL,
  canonical text NOT NULL, profile text NOT NULL CHECK(profile IN ('ijmes_full','ijmes_citation_title')),
  authority_context text NOT NULL CHECK(authority_context IN ('GENERAL_SCHOLARLY_TEXT','BOOK_OR_ARTICLE_TITLE','PERSON_NAME')),
  version integer NOT NULL CHECK(version > 0), status text NOT NULL CHECK(status IN ('ACTIVE','WITHDRAWN','SUPERSEDED')),
  review_event_id uuid NOT NULL REFERENCES phase8o_review_event(event_id), candidate_id text NOT NULL,
  source_snapshot_id text NOT NULL REFERENCES evidence_snapshot(snapshot_id), source_version_id text NOT NULL REFERENCES evidence_record_version(version_id),
  review_basis_sha256 char(64) NOT NULL CHECK(review_basis_sha256 ~ '^[0-9a-f]{64}$'), reviewer_ref text NOT NULL, reviewed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL, UNIQUE(normalized_persian,profile,authority_context,version),
  UNIQUE(review_event_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS phase8r_one_active_authority
  ON phase8r_authority_entry(normalized_persian,profile,authority_context) WHERE status='ACTIVE';
CREATE TABLE IF NOT EXISTS phase8r_publication_event (
  event_id text PRIMARY KEY, event_kind text NOT NULL CHECK(event_kind IN ('PUBLISH','WITHDRAW','ROLLBACK')),
  entry_id text REFERENCES phase8r_authority_entry(entry_id), review_event_id uuid REFERENCES phase8o_review_event(event_id),
  preview_sha256 char(64) NOT NULL CHECK(preview_sha256 ~ '^[0-9a-f]{64}$'), administrator_ref text NOT NULL, authorization_version text NOT NULL,
  reason text NOT NULL, event_json jsonb NOT NULL, occurred_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS phase8r_authority_snapshot (
  snapshot_id text PRIMARY KEY, version integer UNIQUE NOT NULL CHECK(version > 0), manifest_sha256 char(64) UNIQUE NOT NULL CHECK(manifest_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_json jsonb NOT NULL, status text NOT NULL CHECK(status IN ('DRAFT','ACTIVE','RETIRED')),
  created_at timestamptz NOT NULL, activated_at timestamptz
);
CREATE TABLE IF NOT EXISTS phase8r_active_authority_snapshot (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), snapshot_id text NOT NULL REFERENCES phase8r_authority_snapshot(snapshot_id)
);
CREATE TABLE IF NOT EXISTS phase8r_snapshot_entry (
  snapshot_id text NOT NULL REFERENCES phase8r_authority_snapshot(snapshot_id),
  entry_id text NOT NULL REFERENCES phase8r_authority_entry(entry_id),
  PRIMARY KEY(snapshot_id,entry_id)
);
CREATE OR REPLACE FUNCTION phase8r_block_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Phase 8R publication history is append-only'; END;
$$;
DROP TRIGGER IF EXISTS phase8r_publication_event_immutable ON phase8r_publication_event;
CREATE TRIGGER phase8r_publication_event_immutable BEFORE UPDATE OR DELETE ON phase8r_publication_event
FOR EACH ROW EXECUTE FUNCTION phase8r_block_audit_mutation();
DROP TRIGGER IF EXISTS phase8r_snapshot_immutable ON phase8r_snapshot_entry;
CREATE TRIGGER phase8r_snapshot_immutable BEFORE UPDATE OR DELETE ON phase8r_snapshot_entry
FOR EACH ROW EXECUTE FUNCTION phase8r_block_audit_mutation();
CREATE OR REPLACE FUNCTION phase8r_protect_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Phase 8R authority identity and provenance are immutable';
  ELSIF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
    RAISE EXCEPTION 'Phase 8R authority identity and provenance are immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS phase8r_authority_entry_protected ON phase8r_authority_entry;
CREATE TRIGGER phase8r_authority_entry_protected BEFORE UPDATE OR DELETE ON phase8r_authority_entry
FOR EACH ROW EXECUTE FUNCTION phase8r_protect_entry();
CREATE OR REPLACE FUNCTION phase8r_protect_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Phase 8R snapshot manifest is immutable';
  ELSIF (to_jsonb(NEW)-'status'-'activated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'activated_at') THEN
    RAISE EXCEPTION 'Phase 8R snapshot manifest is immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS phase8r_authority_snapshot_protected ON phase8r_authority_snapshot;
CREATE TRIGGER phase8r_authority_snapshot_protected BEFORE UPDATE OR DELETE ON phase8r_authority_snapshot
FOR EACH ROW EXECUTE FUNCTION phase8r_protect_snapshot();
COMMIT;
