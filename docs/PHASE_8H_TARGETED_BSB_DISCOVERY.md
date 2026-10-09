# Phase 8H — targeted BSB SRU discovery

## Root cause and correction

BSB officially documents the CQL syntax `all_for_ui all "term"`. The previous client emitted `all_for_uiall"term"` without the spaces around the `all` relation, which caused invalid SRU responses. The client now includes the required whitespace. Regression tests cover both `all_for_ui` and `dc_title` plus error-only SRU diagnostics.

## Verified live read-only run (2026-10-09)

| CQL query | Total matches reported | Sample received | MARC 880 records | Eligible records | Candidates |
| --- | ---: | ---: | ---: | ---: | ---: |
| `dc_title all "فارسی"` | 0 | 0 | 0 | 0 | 0 |
| `all_for_ui all "فارسی"` | **440** | **10** | **10** | **8** | **16** |

Category breakdown from the second strategy: 8 work titles, 7 person names, 1 organization name. There were no duplicate record IDs in the first sample. The sample is **not** proof that all 440 records are extractable; do not extrapolate its precision to the entire corpus without more batches.

Only two public BSB SRU requests were made. Queries used 10-record page limits; no Neon/Blob credentials or persistent writes. Every candidate remained `UNREVIEWED` and `NON_AUTHORITATIVE_CANDIDATE` and must not be treated as certified IJMES ground truth.

Run: https://github.com/mehdimt1980/persian-scholarly-transliterator/actions/runs/37974030379

## Next bounded step

Introduce a human-reviewed batch acquisition artifact that stores original provider response checksums and per-record provenance, supports cursor pagination with request and record budgets, checks overlap and MARC 880 pairing, and reports how many candidates would be new relative to the active staging snapshot. Preserve the full BSB SRU raw response in the provenance archive when authorized; the original two-record Phase 8G fixture is a selected-field subset rather than the full raw response. Any actual staged publish needs the existing operator-approved write-window guard and a separate review gate.
