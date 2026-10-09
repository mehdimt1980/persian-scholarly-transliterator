# Phase 8G — ingestion and refresh

The controlled importer validates its write environment, archives and verifies raw XML, reuses the Phase 8F parser/adapter, versions changed records, reuses unchanged versions, validates Phase 8E candidate schemas, builds a deterministic manifest, and atomically activates a verified snapshot. All imported candidates remain `UNREVIEWED` and `NON_AUTHORITATIVE_CANDIDATE`.

`npm run validate:phase8g` demonstrates the authentic two-record fixture: first import, duplicate import, changed-version retention, deterministic snapshots, rollback, restart-style repository reload, and Persian retrieval. It is hermetic and performs no network or cloud write. The fixture yields three candidates and does not represent all 50 pilot records.

Future refresh is manual. Record/request budgets must be supplied, checkpoints belong to acquisition-run metadata, and retries use raw checksum plus provider/version identities. SRU pagination is not treated as a durable cursor and absence never marks records deleted.
