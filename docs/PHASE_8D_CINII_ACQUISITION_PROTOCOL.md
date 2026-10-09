# Phase 8D CiNii Acquisition Protocol

## Scope

Phase 8D is a bounded acquisition framework for public bibliographic evidence from CiNii Research. It does not alter production transliteration, frozen evaluation assets, or scholarly gold. The pilot ceiling is 100 received records. HTML scraping and automatic provider fallback are prohibited.

## Official API contract

The adapter targets the documented CiNii Research OpenSearch v2 Books endpoint, `https://cir.nii.ac.jp/opensearch/v2/books`. The implementation was checked against the [CiNii Research OpenSearch documentation](https://support.nii.ac.jp/en/cir/r_opensearch), the [CiNii Books integration notice](https://support.nii.ac.jp/en/cir/cib_integration), and the [legacy Books OpenSearch documentation](https://support.nii.ac.jp/en/cib/api/b_opensearch).

An application ID (`appid`) is required. Phase 8D requests JSON and supports the documented search controls used by the pilot: `q`, `title`, `languageType`, `dataSourceType`, `resourceType`, `from`, `until`, `sortorder`, `count`, and `start`. `lang=en` controls response presentation; it is not treated as a record-language filter. The API documents `count` up to 200 and `start` up to 10,000, but this project independently restricts the pilot to 100 records.

## Deterministic selection plan

Every run requires a stable `queryId` and either `q` or `title`. Query configuration is schema-validated and retained in the artifact. Results retain API order; no random sampling occurs. Consequently, a first page is a reproducible convenience sample, not a representative sample of Persian books.

Offline mode uses `validation/acquisition/cinii/mock-response.v1.json`, the fixed timestamp `2026-10-09T00:00:00.000Z`, and no network. Run:

```bash
npm run validate:phase8d-cinii
```

Live mode is opt-in and requires credentials, a declared query, and explicit budgets:

```bash
CINII_APP_ID=... npm run acquire:phase8d-cinii:live -- --confirm-live --query-id declared-id --query declared-query --max-records 100 --max-requests 3 --delay-ms 1000
```

The client enforces a timeout, at most two retries, request and record budgets, and a minimum 250 ms delay. The 250 ms minimum and 1,000 ms CLI default are conservative project defaults, not NII-published rate limits. HTTP 429 honors `Retry-After`; retryable network and 5xx failures remain bounded. Logged request URLs omit `appid`.

## Extraction and classification

Raw title strings and source field names are retained separately from normalized Persian text. Unicode script evidence is categorized as Persian-script, Arabic-script with uncertain language, mixed Arabic/Latin, Latin-only, or other. A `fa` catalog code does not override the script result.

A Persian–Latin pairing is recorded only when variants coexist in the same record's title structure. Multiple Persian titles or uncertain Arabic script require review. Latin strings are preserved exactly and their probable scheme remains `UNKNOWN`. The application never synthesizes a Latin reference or reverse-transliterates an original.

Stable CRID, NCID, and ISBN evidence is preferred for relationships. Shared identifiers denote duplicate manifestations; matching normalized Persian titles alone can indicate a related edition or similar title but never causes merging. Every record remains independently traceable.

## Provider boundary

CiNii-specific transport and parsing are isolated under `src/validation/acquisition/cinii`. The versioned evidence model and review export form the adapter boundary for potential future catalog providers. Additional providers are out of scope for Phase 8D.
