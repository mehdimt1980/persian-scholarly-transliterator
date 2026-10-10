BEGIN;
DROP TRIGGER IF EXISTS phase8r_publication_event_immutable ON phase8r_publication_event;
DROP TABLE IF EXISTS phase8r_active_authority_snapshot;
DROP TABLE IF EXISTS phase8r_authority_snapshot;
DROP TABLE IF EXISTS phase8r_publication_event;
DROP INDEX IF EXISTS phase8r_one_active_authority;
DROP TABLE IF EXISTS phase8r_authority_entry;
DROP FUNCTION IF EXISTS phase8r_block_audit_mutation();
COMMIT;
