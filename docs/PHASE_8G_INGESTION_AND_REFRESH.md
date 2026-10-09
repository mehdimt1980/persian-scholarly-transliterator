# Phase 8G — ingestion and refresh

The controlled importer validates its write environment, archives and verifies raw XML, reuses the Phase 8F parser/adapter, versions changed records, reuses unchanged versions, validates Phase 8E candidate schemas, builds a deterministic manifest, and atomically activates a verified snapshot. All imported candidates remain `UNREVIEWED` and `NON_AUTHORITATIVE_CANDIDATE`.

`npm run validate:phase8g` remains the hermetic demonstration. `npm run test:phase8g:integration` contains the real migration, Blob, Neon transaction, duplicate import, failure, concurrency, rollback, restart/reload and retrieval checks. It runs only with `PHASE8G_INTEGRATION_AUTHORIZED=true` and all isolated-target identities; otherwise it reports the real integration as blocked. The fixture yields three candidates and does not represent all 50 pilot records.

Future refresh is manual. Record/request budgets must be supplied, checkpoints belong to acquisition-run metadata, and retries use raw checksum plus provider/version identities. SRU pagination is not treated as a durable cursor and absence never marks records deleted.

Snapshot update mode defaults to `INCREMENTAL`. Under the publication advisory lock, records from the active snapshot are retained unless the incoming delta contains the same provider and source-record identity; an incoming changed record replaces active membership while its immutable prior version and historical snapshots remain. A partial SRU response therefore never deletes an absent record. Candidate projections are deduplicated by candidate ID plus source-version ID, and the combined source IDs and candidate hash relationships are sorted before hashing.

`FULL_REBUILD` is an explicit administrator choice. It constructs active membership solely from the supplied import, but it still does not delete raw objects, record versions, or historical snapshots. It must only be used with a deliberately complete corpus input, never an ordinary SRU page.
