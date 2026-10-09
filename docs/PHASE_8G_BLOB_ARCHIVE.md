# Phase 8G — private Blob archive

`VercelPrivateBlobArchive` uses server-side `@vercel/blob` private access. Objects use `evidence/<isolated-namespace>/raw/sha256/<sha256>.marcxml`, no random suffix, and no overwrite. SHA-256 is checked before upload and after every read. MIME type is `application/marcxml+xml`.

An idempotent retry reads and verifies an existing object. A database failure after upload can leave an unreferenced content-addressed object; it cannot expose a snapshot and is safe to reconcile later by checksum. Blob deletion is intentionally absent from ingestion and rollback. No public URLs, client upload token endpoint, or temporary filesystem persistence is used.

Preview and Production currently share the same private store. Isolation therefore depends on a distinct, allowlisted namespace and isolated database; the current guard blocks Preview writes until database isolation is established.
