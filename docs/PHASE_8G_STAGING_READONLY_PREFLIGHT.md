# Phase 8G persistent staging — read-only preflight

This command verifies the *persistent* Staging Neon branch, separate from the disposable integration test. It never runs migrations, INSERT/UPDATE/DELETE, imports, or teardown.

Run `npm run evidence:staging:preflight` in a trusted environment with:
- `PHASE8G_STAGING_DATABASE_URL` — Sensitive connection URL for Neon branch `transliterator-evidence-staging` only
- `PHASE8G_STAGING_DATABASE_FINGERPRINT` — independently verified 64-character fingerprint
- `PHASE8G_STAGING_BLOB_STORE_ID` — Vercel Staging Private Blob store ID (not a token)

Safety assertions:
- Exact expected Neon hostname and real `neon.branch_id`
- Read-back database, user, schema, SHA-256 fingerprint
- Seven required `evidence_*` tables and checksum function
- `evidence_environment_binding`: namespace `phase8g_staging`, runtime `preview`, isolation `ISOLATED_NEON_BRANCH`, matching fingerprint, `writes_enabled=false`

The blob check is **configuration-only**. It does not prove token authorization, that the store is private, or that a Blob request succeeds. A separate controlled Blob read test is required before any import.

Vercel Preview secrets are not automatically visible to GitHub Actions. Never place connection URLs or Blob tokens in source code, PR comments, or logs. Do **not** run `test:phase8g:integration` against this persistent branch: its teardown deletes all evidence tables.
