# Phase 8I — BSB paged evidence package (review-first)

## Goal
Verify that the successful BSB SRU query `all_for_ui all "فارسی"` can be followed across multiple pages with dependable source provenance. Do **not** import a source as a reviewed IJMES transliteration corpus.

## Guardrails
- A fixed, allowlisted BSB endpoint and CQL query; maximum **5 SRU requests × 10 records = 50 observed MARC records** per run.
- SRU XML is parsed with the strict, size-limited MARC parser. A missing/misordered cursor, changed source total, duplicate 001 with different canonical content, or incompatible candidate identity aborts the entire package.
- Page XML responses are archived without modification in a short-lived GitHub Actions artifact; each page's SHA-256, SRU URL, start position, record count and next position are included in `manifest.json`.
- Each unique MARC 001 has a checksum of its canonical MARC record, page location, 880 presence and extracted candidate IDs.
- `reviewCandidates` contain Persian script, observed Latin variants, classification and hash. These are only **UNREVIEWED / NON_AUTHORITATIVE_CANDIDATE**, never verified IJMES outputs. Multiple proposals do not imply correctness.
- No Neon secrets, Blob token, DB schema, persistence API, Production traffic, or authority-promotion workflow is used.
- The source-reported total may change on later runs; any within-run total change aborts the batch. Cross-run consistency requires comparing checksums and actual record identities, not merely totals.

## How to run
1. Open the Phase 8I PR.
2. Apply label `phase8i-run-bsb-paged` to start the one-off read-only workflow.
3. Read Actions logs and download the `phase8i-bsb-source-and-review` artifact (retained for 7 days). The CLI produces `artifacts/phase8i-bsb-paged/manifest.json` plus per-page XML.
4. Remove the trigger label after the run. Merge only when CI and the bounded live review run pass.

## Acceptance
- The Action completes with a real two-or-more-page request sequence, predictable pagination and verifiable SHA-256 values.
- All extracted candidate IDs and source-record links are unique, consistently hashed, and remain non-authoritative.
- The audit reports per-category counts, 880 coverage, romanization proposals and bounded continuation pointer.
- The package has no persistent writes and does not claim a catalog romanization is IJMES-approved.

## Next phase — separate gated import
Before persistent Staging import, verify raw XML replay, license/provenance policy, file and manifest checksums, existing active-snapshot record overlap, candidate review decisions, and operator authorization for the narrowly-scoped Staging write window. Extend the existing immutable archive/Neon snapshot importer to accept reviewed bundles; do not substitute raw GitHub artifacts directly into the old hard-coded two-record importer.

## First live bounded review (2026-10-09)

GitHub Actions run: https://github.com/mehdimt1980/persian-scholarly-transliterator/actions/runs/37975580305

| Signal | Verified |
| --- | ---: |
| Source-reported query results | 440 |
| Pages fetched / observed MARC records | 5 / 50 |
| Unique MARC record IDs | 50 |
| Duplicate MARC record IDs | 0 |
| Records with MARC 880 | 50 |
| Records yielding Persian candidate evidence | 37 |
| Extracted non-authoritative candidates | **75** |
| Work titles / person names / organization names | 37 / 33 / 5 |
| Observed romanization proposals | 75 |
| Last page continuation | 51 |
| Neon and Blob writes | **0** |

The artifact stores 5 original SRU response XML files and a manifest. The acquisition stopped at its configured **budget** (50/440 observed), not because all 440 records had been processed. The recorded continuation pointer (51) is informational only: a subsequent run must revalidate query, time, count and identity before combining batches. A source catalogue romanization proposal is **not** evidence of IJMES conformity until scholarly review.

