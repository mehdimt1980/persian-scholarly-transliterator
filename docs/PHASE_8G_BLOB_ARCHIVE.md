# Phase 8G — private Blob archive

`VercelPrivateBlobArchive` uses server-side `@vercel/blob` private access. Objects use `evidence/<isolated-namespace>/raw/sha256/<sha256>.marcxml`, no random suffix, and no overwrite. SHA-256 is checked before upload and after every read. MIME type is `application/marcxml+xml`.

An idempotent retry reads and verifies an existing object. A database failure after upload can leave an unreferenced content-addressed object; it cannot expose a snapshot and is safe to reconcile later by checksum. Blob deletion is intentionally absent from ingestion and rollback. No public URLs, client upload token endpoint, or temporary filesystem persistence is used.

Every write independently runs the environment guard, compares the SDK-configured `BLOB_STORE_ID` with the separately approved store ID, and verifies the namespace prefix. A same-path race is accepted only when the object can be read back with the expected checksum. Preview and Production currently share the same private store, so the current configuration remains blocked.

The Vercel Blob SDK does not expose an independent API that returns the store identity derived from the active OIDC or read/write credential. Consequently, comparing two environment values is not treated as cryptographic proof of the credential target. Real integration requires a dedicated private test store and a credential/OIDC scope that cannot access Preview or Production stores. The successful write/read checksum test then proves access to that isolated credential target, while the configured ID remains an additional guard rather than the sole isolation proof.
