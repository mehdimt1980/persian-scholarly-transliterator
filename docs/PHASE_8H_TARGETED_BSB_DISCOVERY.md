# Phase 8H — targeted BSB SRU discovery outcome

The existing broad BSB query `language=="per"` worked (20 distinct records, zero extractable Persian-script candidates among first two pages). A bounded read-only test of two more selective CQL strategies was run against the live BSB endpoint on 2026-10-09:

| Strategy | CQL | Outcome |
| --- | --- | --- |
| Persian title | `dc_title all "فارسی"` | `SRU numberOfRecords is missing` |
| Persian general search | `all_for_ui all "فارسی"` | `SRU numberOfRecords is missing` |

Neither query yielded a valid SRU `searchRetrieveResponse` accepted by our strict parser. This does **not** prove zero catalogue matches; it may reflect rejected CQL/index/relation or another response shape. The workflow intentionally fails when both are unparseable.

**No Neon or Blob operations were performed. No authority statuses were promoted.** Do not use these queries for persistent import without inspecting BSB's supported indexes and parsing standard SRU diagnostics, including responses that omit `numberOfRecords`. Do not silently convert failed queries into zero-result success.

Real run: https://github.com/mehdimt1980/persian-scholarly-transliterator/actions/runs/37963077127
