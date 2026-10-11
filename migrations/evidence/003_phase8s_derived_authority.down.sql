BEGIN;
DROP INDEX IF EXISTS phase8r_authority_entry_derived_review_event;
DROP INDEX IF EXISTS phase8r_authority_entry_direct_review_event;
ALTER TABLE phase8r_authority_entry ADD CONSTRAINT phase8r_authority_entry_review_event_id_key UNIQUE(review_event_id);
ALTER TABLE phase8r_publication_event DROP COLUMN IF EXISTS derived_review_event_id;
ALTER TABLE phase8r_authority_entry
  DROP COLUMN IF EXISTS derivation_explanation,
  DROP COLUMN IF EXISTS derivation_type,
  DROP COLUMN IF EXISTS derived_candidate_id,
  DROP COLUMN IF EXISTS derived_review_event_id;
DROP TRIGGER IF EXISTS phase8s_derived_candidate_immutable ON phase8s_derived_candidate;
DROP FUNCTION IF EXISTS phase8s_protect_derived_candidate();
DROP TRIGGER IF EXISTS phase8s_derived_event_immutable ON phase8s_derived_review_event;
DROP FUNCTION IF EXISTS phase8s_block_derived_event_mutation();
DROP TABLE IF EXISTS phase8s_derived_review_event;
DROP TABLE IF EXISTS phase8s_derived_candidate;
COMMIT;
