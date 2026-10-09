# Phase 8G — Neon schema

Migration `migrations/evidence/001_phase8g_evidence_store.sql` defines acquisition runs, raw source references, provider-scoped record versions, snapshots, candidate projections, and a singleton active-snapshot pointer. Constraints cap budgets and raw sizes, enforce non-authoritative BSB status, prevent provider/version collisions, and permit one current version per provider record. Exact and normalized candidate indexes support bounded retrieval without loading a future corpus into one function.

The down migration removes only Phase 8G tables in dependency order. Migrations are never automatic. They require an isolated Neon branch/schema, review of the resolved target, and explicit administrator execution. No migration has been applied to the connected database.

Snapshot publication should be performed in one SQL transaction: insert draft, insert projections, verify counts/hash, mark verified, retire the old active snapshot, and upsert the singleton pointer. Historical record versions and raw references are retained; missing search results never imply deletion.
