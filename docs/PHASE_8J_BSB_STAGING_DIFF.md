# Phase 8J — BSB vs active Neon Staging: read-only pre-import gate

## Intent
Check whether the 50-record bounded BSB SRU sample can safely coexist with the **existing** Phase 8G permanent Staging snapshot. This PR **does not import** any data. It is a pre-import evidence report, not an IJMES ground-truth publisher.

## Mandatory verification (before network acquisition)
- Connection must match the exact intended permanent Neon Staging host, branch ID `br-noisy-field-b2m5q1zb`, and SHA-256 database identity fingerprint; no Production/other-branch fallback.
- `evidence_environment_binding` must be isolated Preview Staging, `writes_enabled=false`.
- Active snapshot must match the verified original `snapshot-7946161b2af2652b776a6bd4`.
- Source references, candidate counts, and manifest SHA-256 verification must agree.
- Query known persisted versions and source IDs using `SELECT` only; never use an import-capable CLI.

## Acquisition and comparison
- Live BSB SRU `all_for_ui all "فارسی"`, strictly capped at 5 pages × 10 records.
- All **original SRU response XML** pages retained with SHA-256, plus source manifest from the same run.
- Distinguish `NEW_RECORD`, `ACTIVE_UNCHANGED`, `ACTIVE_CHANGED`, `KNOWN_HISTORICAL` by MARC 001 and canonical record checksum.
- Distinguish `NEW_CANDIDATE`, `ACTIVE_UNCHANGED`, `ACTIVE_CHANGED` by candidate ID and content hash.
- Reject malformed source identity, duplicate or inconsistent candidates, changed source counts, and source pagination errors.
- Recheck Staging snapshot ID and disabled writes after acquisition; discard if state moved.
- Emit `comparison.json` and `package-checksums.json` alongside original source XML and manifest as a 7-day GitHub Actions artifact.

## Mandatory policy
`importDecision` is **always** `BLOCKED_PENDING_REVIEW`. This run cannot enable write windows, use Blob credentials, change a snapshot, approve romanization, or certify IJMES. Review requirements include bibliographic source reuse conditions, human review of proposed romanizations, identifying changed active record versions, operator-approved import window, and explicit rollback check against the previous active snapshot. The source-reported 440 records are a **search count**, not 440 reviewed candidates.

## Future write operation (not part of this PR)
Design and review a separate one-time, bounded Staging importer which consumes **verified frozen artifacts** rather than refetching changing catalog search results. It must archive original page responses immutably, compare to the specific approved baseline snapshot (optimistic concurrency), validate per-record/candidate checksum and human review sheet, support idempotent version reuse and snapshot rollback, and always return write binding to false.

## Trigger
Manual PR label `phase8j-run-staging-diff` starts the isolated `phase8g-staging-readonly` workflow. Credentials must never appear in logs or uploaded artifact. No Staging Blob credential is needed.

## Verified live audit — 9 October 2026

The successful read-only job inspected the permanent Neon Staging snapshot and queried BSB live (5 requests, 50 source records and 75 non-authoritative candidates):

| Check | Result |
| --- | ---: |
| Active snapshot | `snapshot-7946161b2af2652b776a6bd4` |
| Snapshot manifest integrity | verified |
| New MARC record identities vs active snapshot | **48** |
| Existing MARC record identities with same checksum | **0** |
| Existing MARC record identities with different canonical checksum | **2** |
| Incoming candidate identities not in active snapshot | **72** |
| Incoming candidate identities with same content hash | **0** |
| Incoming candidate identities with different content hash | **3** |
| New persistence writes | **0** |

Source job: https://github.com/mehdimt1980/persian-scholarly-transliterator/actions/runs/37976520126

**Crucial interpretation:** `ACTIVE_CHANGED` in the diagnostic output means **checksum differs**, not evidence the BSB catalogue changed. The prior active records came from the committed `authentic-selected-records.v1.xml` fixture, which explicitly states that irrelevant MARC fields were omitted. The current source is a complete live SRU response. Therefore the two checksum mismatches may be **fixture projection differences** rather than newly edited BSB catalogue records. Likewise, the three candidate content hashes may differ through source checksums/provenance alone. Neither difference is grounds for overwriting the baseline.

The next reconciliation must compare the selected MARC field subset from each original fixture against its live version and the candidate **linguistic content** separately from the `sourceChecksum` provenance fingerprint. It must preserve the exact old snapshot as a rollback target and require a signed, explicit review/authorization manifest before any future staged publish.

`human-review-worklist.csv` is a **review aid only**, with no authority to approve IJMES entries and no automatic importer. JSON, CSV and XML artifact hashes refer to the actual serialized on-disk bytes in `package-checksums.json`.
