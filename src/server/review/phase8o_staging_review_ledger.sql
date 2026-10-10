-- Phase 8O: independent human review ledger on the permanent STAGING branch only.
-- Does not alter Phase 8G source, snapshot, candidate tables, or promotion states.
CREATE TABLE IF NOT EXISTS phase8o_review_event (
  event_id UUID PRIMARY KEY,
  active_snapshot_id TEXT NOT NULL REFERENCES evidence_snapshot(snapshot_id),
  candidate_id TEXT NOT NULL,
  review_basis_sha256 TEXT NOT NULL CHECK (review_basis_sha256 ~ '^[a-f0-9]{64}$'),
  decision_kind TEXT NOT NULL CHECK (decision_kind IN ('DRAFT','ACCEPT','REJECT','DEFER')),
  reviewer_ref TEXT,
  decision_json JSONB NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(decision_json) = 'object')
);
CREATE INDEX IF NOT EXISTS phase8o_review_event_recent
  ON phase8o_review_event (active_snapshot_id,candidate_id,decided_at DESC,event_id DESC);
CREATE OR REPLACE FUNCTION phase8o_block_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Phase 8O audit entries are append-only'; END;
$$;
DROP TRIGGER IF EXISTS phase8o_event_immutable ON phase8o_review_event;
CREATE TRIGGER phase8o_event_immutable BEFORE UPDATE OR DELETE ON phase8o_review_event
FOR EACH ROW EXECUTE FUNCTION phase8o_block_event_mutation();
