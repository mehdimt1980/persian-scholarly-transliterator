# Phase 8F — live BSB pilot

The owner-authorized pilot completed on 2026-10-09. All four permitted SearchRetrieve requests returned HTTP 200. Requested page limits were 5, 5, 50, and 40; actual records received were 5, 5, 0, and 40 (50 total), below the 100-record shared budget. Requests were sequential, used 30-second timeouts, and had multi-second response intervals. Exact timestamps and sanitized URLs are in `validation/acquisition/bsb/live-pilot-summary.v1.json`.

| Query | Received | 880 fields | Finding |
| --- | ---: | ---: | --- |
| `language==per` | 5 | 0 | Earliest results were romanized-only records. |
| `all_for_ui all "ایران"` | 5 | 0 | No Persian-script title subfields in the page. |
| `dc_title all "ایران"` | 0 | 0 | Title index did not return the script term. |
| `all_for_ui all "فارسی"` | 40 | 136 | 187 Arabic-script subfields; linked Persian and non-Persian records both occurred. |

The authentic reduced fixture preserves selected fields from two Persian-metadata-supported records: two Persian-script whole titles, one Persian-script organization, their linked romanized fields, and two translated/parallel 246 titles. Conversion produces three non-authoritative candidates (two `WORK_TITLE`, one `ORGANIZATION_NAME`), two creator candidates being zero in this deliberately small retained slice. Source IDs include `991071006889707356` and `991144600686807356`.

Full-response Persian-title, creator, identifier, duplicate, and related-record totals were not computed before the bounded response was discarded; claiming them would be synthetic. Response-level counts (40 records, 136 880 fields, 187 Arabic-script subfields) are genuine. The reduced fixture is authentic but explicitly incomplete. Synthetic MARC in tests is used only for parser/security edge cases and never reported as acquisition.

Limitations: an Arabic-script match is not itself Persian evidence; the adapter requires MARC 041/008 `per`. The 50-record pilot is query-biased, not representative. Catalog romanization is observed evidence of unknown scheme, never an IJMES claim. No live bulk harvesting occurred.
