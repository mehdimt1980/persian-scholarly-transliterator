BEGIN;

-- Layer B: Derived candidate and review event tables
CREATE TABLE IF NOT EXISTS phase8s_derived_candidate (
  derived_candidate_id text PRIMARY KEY,
  parent_candidate_id text NOT NULL,
  parent_source_version_id text NOT NULL REFERENCES evidence_record_version(version_id),
  parent_review_event_id uuid NOT NULL REFERENCES phase8o_review_event(event_id),
  source_snapshot_id text NOT NULL REFERENCES evidence_snapshot(snapshot_id),
  review_basis_sha256 char(64) NOT NULL CHECK(review_basis_sha256 ~ '^[0-9a-f]{64}$'),
  original_persian_surface text NOT NULL,
  running_text_persian_surface text NOT NULL CHECK(length(trim(running_text_persian_surface)) > 0 AND running_text_persian_surface !~ '[,،]'),
  derivation_type text NOT NULL CHECK(derivation_type IN ('RUNNING_TEXT_SURFACE','CATALOGUE_INVERSION_NORMALIZED','TITULAR_RUNNING_TEXT','OTHER_SCHOLARLY_DERIVATION')),
  derivation_explanation text NOT NULL CHECK(length(trim(derivation_explanation)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS phase8s_derived_review_event (
  event_id uuid PRIMARY KEY,
  derived_candidate_id text NOT NULL REFERENCES phase8s_derived_candidate(derived_candidate_id),
  decision_kind text NOT NULL CHECK(decision_kind IN ('DRAFT','ACCEPT','REJECT','DEFER')),
  canonical text,
  profile text CHECK(profile IN ('ijmes_full','ijmes_citation_title')),
  authority_context text NOT NULL CHECK(authority_context IN ('GENERAL_SCHOLARLY_TEXT','BOOK_OR_ARTICLE_TITLE','PERSON_NAME')),
  reviewer_ref text NOT NULL,
  rationale text,
  human_attestation text,
  decision_json jsonb NOT NULL CHECK(jsonb_typeof(decision_json) = 'object'),
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phase8s_derived_review_event_recent
  ON phase8s_derived_review_event (derived_candidate_id, decided_at DESC, event_id DESC);

-- Immutability triggers for derived candidate and review events
CREATE OR REPLACE FUNCTION phase8s_block_derived_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Phase 8S derived review events are append-only'; END;
$$;

DROP TRIGGER IF EXISTS phase8s_derived_event_immutable ON phase8s_derived_review_event;
CREATE TRIGGER phase8s_derived_event_immutable BEFORE UPDATE OR DELETE ON phase8s_derived_review_event
FOR EACH ROW EXECUTE FUNCTION phase8s_block_derived_event_mutation();

CREATE OR REPLACE FUNCTION phase8s_protect_derived_candidate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Phase 8S derived candidates are immutable'; END;
$$;

DROP TRIGGER IF EXISTS phase8s_derived_candidate_immutable ON phase8s_derived_candidate;
CREATE TRIGGER phase8s_derived_candidate_immutable BEFORE UPDATE OR DELETE ON phase8s_derived_candidate
FOR EACH ROW EXECUTE FUNCTION phase8s_protect_derived_candidate();

-- Additive columns to Phase 8R authority entry to link derived candidate and derived review event
ALTER TABLE phase8r_authority_entry
  ADD COLUMN IF NOT EXISTS derived_review_event_id uuid REFERENCES phase8s_derived_review_event(event_id),
  ADD COLUMN IF NOT EXISTS derived_candidate_id text REFERENCES phase8s_derived_candidate(derived_candidate_id),
  ADD COLUMN IF NOT EXISTS derivation_type text,
  ADD COLUMN IF NOT EXISTS derivation_explanation text;

-- Additive column to Phase 8R publication event
ALTER TABLE phase8r_publication_event
  ADD COLUMN IF NOT EXISTS derived_review_event_id uuid REFERENCES phase8s_derived_review_event(event_id);

-- Relax unique constraint on review_event_id to support partial unique indexes for direct vs derived
ALTER TABLE phase8r_authority_entry DROP CONSTRAINT IF EXISTS phase8r_authority_entry_review_event_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS phase8r_authority_entry_direct_review_event
  ON phase8r_authority_entry(review_event_id) WHERE derived_review_event_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS phase8r_authority_entry_derived_review_event
  ON phase8r_authority_entry(derived_review_event_id) WHERE derived_review_event_id IS NOT NULL;

COMMIT;
