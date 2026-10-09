# Phase 8G — operations runbook

## Current state

Preview and Production share the connected Neon target and Blob store. Treat both as production-impacting. Phase 8G performed no cloud write, migration, or import.

## Safe isolated initialization

1. In Neon, create a dedicated non-production branch or schema and give Preview/development a connection distinct from Production.
2. Assign an isolated Blob prefix and set `EVIDENCE_STORAGE_NAMESPACE` to a non-production name.
3. Set `EVIDENCE_DATABASE_ISOLATION=ISOLATED_NEON_BRANCH` (or `ISOLATED_SCHEMA`) only after verifying the target. Set `EVIDENCE_ALLOW_WRITES=true` only for the administrator operation.
4. Pull environment variables locally without displaying values and compare target fingerprints. Keep `EVIDENCE_PRODUCTION_WRITE_APPROVED=false`.
5. Apply `migrations/evidence/001_phase8g_evidence_store.sql` to that isolated target. Never run it against Production without a separate explicit owner approval.
6. Run `npm run validate:phase8g`. Then invoke an administrator-only fixture import command when a production repository command is added and reviewed; there is intentionally no HTTP ingestion endpoint.
7. Verify active snapshot count/hash, retrieve `ادب فارسی` with provider `BSB_SRU_MARCXML`, and confirm reviewed-only retrieval returns insufficient evidence.
8. Disable writes after the operation.

Production activation separately requires owner approval for the exact migration target, migration SHA, Blob namespace, fixture checksum, budgets, and activation/rollback snapshot IDs. A Production import has not occurred.
