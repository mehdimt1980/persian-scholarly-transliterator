# Phase 8P — 750 Authentic BSB Candidates in Review

**Target:** 750 nonauthoritative BSB-backed candidates (75 pre-existing + 675 additional) in one active, verifiable permanent Staging snapshot.

## Actual source acquisition (Phase 8P-B)
- GitHub Actions run: https://github.com/mehdimt1980/persian-scholarly-transliterator/actions/runs/38039056666
- 8 pages × 50 MARC21 records returned by the official BSB Alma SRU endpoint (`all_for_ui all "فارسی"`), with checksummed original MARCXML.
- 50 existing MARC 001 records excluded; 311 new genuine MARC records yielded exactly 675 new candidates, bringing total to **750**.
- Frozen input artifact `phase8p-bsb-750-source-frozen` includes raw SRU XML pages, 8 self-contained ≤40-record MARC batches and a SHA-256 checksum/candidate-identity seal.
- All forms remain `UNREVIEWED` and `NON_AUTHORITATIVE_CANDIDATE`. Catalogue transliterations and parallel translations must not be treated as IJMES-certified forms.
- Source metadata scope: CC0 bibliographic data only, not book contents, images or copyrighted text.

## Import transaction workflow (Phase 8P-C)
- Trigger exactly once by `phase8p-authorize-frozen-750-import` label on approved PR #76.
- Uses the protected existing `phase8g-staging-import` environment. Never import to `main` Neon or alter production data.
- Download **only** previous successful acquisition run **38039056666** artifact, not a new SRU request.
- Independently replay all source SRU XML and each selected record. Verify every original MARC 001/checksum and derived candidate ID/content hash; reject missing/injected/symlinked files.
- Confirm current active 75-candidate snapshot ID and checksum, 50 prior record identities, authentic Neon branch ID/host/fingerprint and the closed evidence write gate.
- Explicitly open the write gate; archive all 8 original SRU responses immutably in private Vercel Blob.
- Publish **8 bounded incremental batches**, each with a transaction-scoped advisory lock and expected previous snapshot and manifest checksum. Verify record/candidate counts after every batch.
- On failure, restore original 75-candidate snapshot even if the transaction committed before a thrown error; close the evidence write gate on every pathway.
- After success, verify exactly 361 source record versions, 750 unreviewed candidates, current manifest integrity, retained old 75-candidate snapshot for rollback, and the original 3-candidate historical snapshot. Confirm `writes_enabled=false`.

## Reviewer UI
Phase 8P-A already removed the original 75 hard-limit and added 25-at-a-time server-side search/pagination. The previous 47 editorial, 23 specialist and 5 quick-check classes are retained for the original 75 candidate IDs. **The 675 new candidates are deliberately marked `NEW`, with no fabricated IJMES draft, reviewer identity, review decision or authority.**

The Review UI derives active candidate counts and snapshot IDs from Neon, so it will show the real corpus size once verified. Historic reviewer decisions remain in append-only events tied to their original evidence snapshot and are **not silently transferred to changed evidence snapshots**.

## Release note
Do not claim the 750 candidates are available until the actual Phase 8P-C GitHub Actions migration and post-import audit both succeed. Scholarly IJMES publication is entirely separate and remains prohibited without explicit human-approved review.
