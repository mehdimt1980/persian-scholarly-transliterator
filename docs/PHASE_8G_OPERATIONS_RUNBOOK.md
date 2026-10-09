# Phase 8G — operations runbook

## Current state

Preview and Production share the connected Neon target and Blob store. Treat both as production-impacting. Phase 8G performed no cloud write, migration, or import.

## Safe isolated initialization

1. In Neon, create a dedicated non-production branch or schema and give Preview/development a connection distinct from Production.
2. Assign an isolated Blob prefix and set `EVIDENCE_STORAGE_NAMESPACE` to a non-production name.
3. Pull environment variables locally without displaying values. Compute the SHA-256 identity fingerprint described in the architecture document from the connection hostname and read-back database/user/schema. Set `EVIDENCE_DATABASE_FINGERPRINT` and separately verify `EVIDENCE_BLOB_STORE_ID` against the connected `BLOB_STORE_ID`.
4. Apply `migrations/evidence/001_phase8g_evidence_store.sql` to that isolated target. Never run it against Production without separate approval. Insert the single `evidence_environment_binding` row with the verified namespace, runtime, isolation and fingerprint; start with writes disabled until the maintenance window.
5. Set `EVIDENCE_DATABASE_ISOLATION=ISOLATED_NEON_BRANCH` (or `ISOLATED_SCHEMA`), `EVIDENCE_ALLOW_WRITES=true`, `EVIDENCE_ADMIN_MODE=true`, and enable the database binding only for the administrator operation. Keep `EVIDENCE_PRODUCTION_WRITE_APPROVED=false` outside an explicitly approved Production operation.
6. Run `npm run evidence:admin -- preflight`, then `npm run evidence:admin -- migration-verify`.
7. Run `npm run evidence:admin -- fixture-import`, followed by `npm run evidence:admin -- snapshot-verify <snapshot-id>` and `npm run evidence:admin -- search ادب فارسی`.
8. Roll back only with `npm run evidence:admin -- rollback <verified-snapshot-id>`. Record both old and new snapshot IDs before execution.
9. Disable `writes_enabled`, `EVIDENCE_ALLOW_WRITES`, and `EVIDENCE_ADMIN_MODE` after the operation.

## Real integration test prerequisites

Use only a disposable isolated Neon branch/database and isolated private Blob store. Set `PHASE8G_INTEGRATION_AUTHORIZED=true`, `PHASE8G_INTEGRATION_DATABASE_URL`, `PHASE8G_INTEGRATION_DATABASE_FINGERPRINT`, `PHASE8G_INTEGRATION_BLOB_STORE_ID`, `PHASE8G_INTEGRATION_NAMESPACE`, and the private store credential expected by `@vercel/blob`. Then run `npm run test:phase8g:integration`. The suite applies and removes the Phase 8G schema and writes an immutable fixture object. Without all prerequisites it is intentionally reported as **BLOCKED**.

Production activation separately requires owner approval for the exact migration target, migration SHA, Blob namespace, fixture checksum, budgets, and activation/rollback snapshot IDs. A Production import has not occurred.
