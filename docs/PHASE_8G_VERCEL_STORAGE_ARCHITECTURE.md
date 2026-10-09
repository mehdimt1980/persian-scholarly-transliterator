# Phase 8G — Vercel storage architecture

The implemented path is BSB SRU or an authorized fixture import → private Vercel Blob content-addressed archive → Neon record versions and candidate projections → immutable snapshot → atomic active pointer → existing `LexicalEvidenceIndex` semantics. Blob and database clients exist only under `src/server`; no browser or public ingestion route is provided.

Read-only inspection on 2026-10-09 found that Preview and Production receive identical `DATABASE_URL`, `POSTGRES_URL`, `NEON_PROJECT_ID`, and `BLOB_STORE_ID` values. They therefore share the currently connected Neon target and private Blob store. No migration or import was run. The write guard rejects this `SHARED_OR_UNKNOWN` topology. Preview must receive a distinct Neon branch or schema and isolated Blob prefix before writes.

Required server-only names are listed in `.env.example`: `DATABASE_URL`, `BLOB_STORE_ID`, `EVIDENCE_ALLOW_WRITES`, `EVIDENCE_STORAGE_NAMESPACE`, `EVIDENCE_DATABASE_ISOLATION`, and `EVIDENCE_PRODUCTION_WRITE_APPROVED`. Values must never be logged. Production approval remains false unless the owner explicitly authorizes a particular migration/import.
