# First permanent BSB import — Staging

This is **not** the disposable integration suite: it never executes migration down scripts, drops tables, or cleans stored evidence.

The CLI has two modes:

- `npm run evidence:staging:import -- verify`: read-only checks of the exact Staging Neon branch and the committed BSB fixture. Requires staging Neon connection URL, fingerprint, and Blob store ID; no Blob token needed.
- `npm run evidence:staging:import -- import`: requires operator permission `PHASE8G_STAGING_IMPORT_APPROVED=IMPORT_AUTHENTIC_BSB_STAGING`, the dedicated staging Blob token exposed as `BLOB_READ_WRITE_TOKEN` **in the controlled process only**, and database binding `writes_enabled=true`. Performs incremental BSB import, checks snapshot and Persian search readback. Never use against disposable test branch or Production.

Hardcoded verified Staging host, branch ID, namespace, and fingerprint fail closed. The operator must manually enable `writes_enabled` on verified Staging immediately before the import and disable it immediately after (including on failure). Take a backup/checkpoint before enabling writes. A crashed process will **not** automatically disable the database binding, so the operator must verify it is false afterward. The staging blob listing preflight proves API permission only, not the immutable association between the provided store ID and token; that association must be confirmed in Vercel before import.

Do not place credentials in source code or PR comments. Vercel Sensitive env vars do not automatically carry to GitHub Actions. Keep `PHASE8G_STAGING_DATABASE_URL` and staging blob token restricted to an explicitly approved execution environment. No job for live import is wired to automatic CI.
