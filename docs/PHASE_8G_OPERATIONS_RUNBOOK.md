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
7. Run `npm run evidence:admin -- fixture-import` for an incremental import, followed by `npm run evidence:admin -- snapshot-verify <snapshot-id>` and `npm run evidence:admin -- search ادب فارسی`. The explicit `--full-rebuild` flag is reserved for a reviewed complete-corpus input and must never be used for a partial SRU page.
8. Roll back only with `npm run evidence:admin -- rollback <verified-snapshot-id>`. Record both old and new snapshot IDs before execution.
9. Disable `writes_enabled`, `EVIDENCE_ALLOW_WRITES`, and `EVIDENCE_ADMIN_MODE` after the operation.

## Real integration test prerequisites

Use only a disposable isolated Neon branch/database and a dedicated private Blob store whose credential cannot access Preview or Production stores. Verify the actual Neon branch using `SELECT current_setting('neon.branch_id', true)`; the dedicated expected branch ID must be supplied as `PHASE8G_INTEGRATION_NEON_BRANCH_ID`, and the suite refuses migration and teardown if the IDs differ. **This protects against accidental wrong-branch connection, but does not replace verifying that the expected ID itself belongs to the disposable branch.** Set `PHASE8G_INTEGRATION_AUTHORIZED=true`, `PHASE8G_INTEGRATION_DATABASE_URL`, `PHASE8G_INTEGRATION_DATABASE_FINGERPRINT`, `PHASE8G_INTEGRATION_BLOB_STORE_ID`, `PHASE8G_INTEGRATION_NAMESPACE`, the dedicated credential expected by `@vercel/blob`, and the exact teardown acknowledgement `PHASE8G_INTEGRATION_DISPOSABLE_CONFIRMATION=DROP_PHASE8G_TEST_SCHEMA`. Then run `npm run test:phase8g:integration`.

The suite records the live database identity before migration. Before teardown it re-reads that identity and the database-resident binding and refuses cleanup unless the fingerprint, `test` runtime, namespace, isolation binding, and explicit disposable acknowledgement still match. Without every prerequisite, the four real cases remain skipped and are reported as **BLOCKED**, not passed.

Production activation separately requires owner approval for the exact migration target, migration SHA, Blob namespace, fixture checksum, budgets, and activation/rollback snapshot IDs. A Production import has not occurred.


## Vercel Preview variables are not GitHub Actions secrets

Vercel project Sensitive variables are not automatically available to GitHub Actions. The dedicated Phase 8G test must run in a trusted, manually controlled execution environment with explicit variables; do not copy secrets into code, PR text, workflow logs, or an untrusted PR runner.

Required environment values:
- `PHASE8G_INTEGRATION_NEON_BRANCH_ID`: verified ID of disposable Neon branch (for this pilot: `br-bitter-surf-b2n11vor`)
- `PHASE8G_INTEGRATION_DATABASE_URL`: isolated Neon branch URL (never Production)
- `PHASE8G_INTEGRATION_DATABASE_FINGERPRINT`: fingerprint computed from the exact test URL host/database/user/schema
- `PHASE8G_INTEGRATION_BLOB_STORE_ID`: dedicated test Blob store ID
- `PHASE8G_INTEGRATION_NAMESPACE`: `phase8g_integration`
- `BLOB_READ_WRITE_TOKEN`: **test Blob store token only**, isolated in the test process; do not overwrite the project's Production Blob token
- `PHASE8G_INTEGRATION_AUTHORIZED`: `true`
- `PHASE8G_INTEGRATION_DISPOSABLE_CONFIRMATION`: `DROP_PHASE8G_TEST_SCHEMA`

The Vercel-created `PHASE8G_TEST_BLOB_READ_WRITE_TOKEN` does **not** automatically bind to the SDK's `BLOB_READ_WRITE_TOKEN` name. Alias it only in the isolated test process. GitHub Actions requires independently configured protected GitHub environment secrets or a carefully managed temporary local test environment.

**Destructive lifecycle:** the integration test executes the Phase 8G down migration in `afterAll`, deleting its evidence tables and binding on the disposable branch; it does **not** delete the Blob objects it created. Never run with a Production database or Blob token. Any manually seeded pre-existing evidence tables on the disposable branch are also deleted at teardown. Run only after explicitly approving this outcome. Do not run automatically on push/PR.
