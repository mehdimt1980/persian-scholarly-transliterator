# Phase 8E Live CiNii Pilot Protocol

## Status

`LIVE_NOT_RUN_MISSING_AUTHORIZATION`

The Phase 8E environment contained no `CINII_APP_ID`. No live CiNii or WorldCat request was made. Synthetic Phase 8D records are used only to test extraction and retrieval behavior and are not reported as authentic coverage.

## Authorized workflow

The live workflow uses the official CiNii Research OpenSearch v2 Books API documented at <https://support.nii.ac.jp/en/cir/r_opensearch>. NII requires API registration and an application ID as described at <https://support.nii.ac.jp/en/cinii/api/developer>. It never scrapes HTML or bypasses access controls.

Execution requires both `--live --confirm-live` and `CINII_APP_ID`:

```bash
CINII_APP_ID=... npm run acquire:phase8e:live -- --confirm-live --query "declared term"
```

The fixed pilot design allocates at most 75 of the shared 100-record ceiling: up to 50 records for a `languageType=fa` query and up to 25 for the same unfiltered query. Both use `sortorder=0`, JSON, a 1,000 ms delay, bounded retries, and a shared four-request budget. Results retain query IDs and purposes. The comparison tests the catalog filter; it does not treat `fa` as proof of Persian-language content.

The workflow refuses plans whose allocations exceed the shared record budget. Missing authorization returns before provider access. Credentials are read from the environment and excluded from committed artifacts and safe logs.

## Authentic response assessment

Unavailable in this delivery because the live pilot did not run. Actual title structures, language tags, creators, identifiers, WorldCat links, publication metadata, unexpected fields, valid/invalid records, and API errors remain unmeasured. No synthetic result is used as an estimate.
