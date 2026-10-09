# Phase 8K — Reconcile the original two selected MARC records

## Risk addressed
The historical Phase 8G staging snapshot was populated from `validation/acquisition/bsb/authentic-selected-records.v1.xml`, explicitly a **selected-field excerpt** of two authentic BSB records rather than complete source MARCXML. Phase 8J observed 2 MARC checksum mismatches and 3 candidate-content-hash mismatches against complete current BSB SRU data.

A changed SHA-256 is **not** by itself proof of a substantive catalogue edit. Comparing these unalike representations directly and then overwriting the original snapshot would destroy a useful provenance/rollback checkpoint.

## Phase 8K controls
- Strictly use the existing permanent **Neon Staging** branch fingerprint, original active-snapshot ID, verified manifest checksum and `writes_enabled=false`. No fallback branch.
- Use the existing bounded five-page, 50-record read-only BSB SRU workflow. All raw pages and their SHA-256 are preserved.
- Parse the committed selected fixture and match each original MARC 001 to a real live source record. Refuse the CLI artifact if either is absent from the bounded sample.
- Match *each explicitly selected* MARC datafield against the live MARC datafields, including tag, indicators and subfield sequences/values. Missing or changed selected-field evidence is flagged, not repaired silently.
- Compare the actual existing Neon candidate JSON to candidate evidence re-extracted from live source using a narrowly defined linguistic fingerprint: Persian original, normalized form, category, linguistic context and observed Latin variants/classification. Ignore source checksum/JSON metadata for **this one semantic comparison only**; preserve full content hashes for version/provenance integrity.
- Return one of `EXACT_CONTENT_HASH`, `SEMANTICS_UNCHANGED_PROVENANCE_CHANGED`, `SEMANTIC_EVIDENCE_CHANGED`, `NO_CURRENT_LIVE_CANDIDATE`, `NEW_LIVE_CANDIDATE`.
- Save `fixture-reconciliation.json` and its exact serialized SHA-256 alongside existing `comparison.json`, raw XML, provenance, and human review worklist in a seven-day artifact.

## Non-negotiable limitations
- This comparison is **not** an IJMES correctness validator. Semantic equivalence here means the bibliographic evidence fields named above agree; it says nothing about scholarly standards.
- Even when linguistic fields agree, the complete live MARC source may carry additional bibliographic/copyright/license conditions. Those are not deemed reviewed.
- Import remains **BLOCKED_PENDING_FIELD_REVIEW**. No automatic data merges, Neon writes, Vercel Blob modifications, production traffic, or reviewer elevation.
- Future approval requires a fixed, checksummed input package; evidence licensing confirmation; explicit human review; an operator-approved one-time staging write window; baseline snapshot preservation and rollback rehearsal.

## Workflow
PR label `phase8k-run-fixture-reconciliation` triggers `phase8g-staging-readonly`, with no Blob credentials. The read-only CLI rechecks the active snapshot and disabled write binding after all source calls. The artifact is not a database migration and expires in seven days.
