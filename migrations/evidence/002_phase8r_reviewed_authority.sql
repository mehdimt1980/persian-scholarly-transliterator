BEGIN;
CREATE TABLE IF NOT EXISTS phase8r_authority_entry (
  entry_id text PRIMARY KEY, normalized_persian text NOT NULL, persian_surface text NOT NULL,
  canonical text NOT NULL, profile text NOT NULL CHECK(profile IN ('ijmes_full','ijmes_citation_title')),
  authority_context text NOT NULL CHECK(authority_context IN ('GENERAL_SCHOLARLY_TEXT','BOOK_OR_ARTICLE_TITLE','PERSON_NAME')),
  version integer NOT NULL CHECK(version > 0), status text NOT NULL CHECK(status IN ('ACTIVE','WITHDRAWN','SUPERSEDED')),
  review_event_id uuid NOT NULL REFERENCES phase8o_review_event(event_id), candidate_id text NOT NULL,
  source_snapshot_id text NOT NULL REFERENCES evidence_snapshot(snapshot_id), source_version_id text NOT NULL REFERENCES evidence_record_version(version_id),
  review_basis_sha256 char(64) NOT NULL, reviewer_ref text NOT NULL, reviewed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL, UNIQUE(normalized_persian,profile,authority_context,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS phase8r_one_active_authority
  ON phase8r_authority_entry(normalized_persian,profile,authority_context) WHERE status='ACTIVE';
CREATE TABLE IF NOT EXISTS phase8r_publication_event (
  event_id text PRIMARY KEY, event_kind text NOT NULL CHECK(event_kind IN ('PUBLISH','WITHDRAW','ROLLBACK')),
  entry_id text REFERENCES phase8r_authority_entry(entry_id), review_event_id uuid REFERENCES phase8o_review_event(event_id),
  preview_sha256 char(64) NOT NULL, administrator_ref text NOT NULL, authorization_version text NOT NULL,
  reason text NOT NULL, event_json jsonb NOT NULL, occurred_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS phase8r_authority_snapshot (
  snapshot_id text PRIMARY KEY, version integer UNIQUE NOT NULL, manifest_sha256 char(64) UNIQUE NOT NULL,
  manifest_json jsonb NOT NULL, status text NOT NULL CHECK(status IN ('DRAFT','ACTIVE','RETIRED')),
  created_at timestamptz NOT NULL, activated_at timestamptz
);
CREATE TABLE IF NOT EXISTS phase8r_active_authority_snapshot (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), snapshot_id text NOT NULL REFERENCES phase8r_authority_snapshot(snapshot_id)
);
CREATE OR REPLACE FUNCTION phase8r_block_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Phase 8R publication history is append-only'; END;
$$;
DROP TRIGGER IF EXISTS phase8r_publication_event_immutable ON phase8r_publication_event;
CREATE TRIGGER phase8r_publication_event_immutable BEFORE UPDATE OR DELETE ON phase8r_publication_event
FOR EACH ROW EXECUTE FUNCTION phase8r_block_audit_mutation();
COMMIT;
