# Phase 8F — unified lexical evidence

`LexicalEvidenceIndex` remains the sole retrieval mechanism. A BSB adapter emits the existing Phase 8E `LexicalCandidate`, adding optional provider evidence: provider ID, collision-resistant contextual identity, source record and URL, MARC field/indicators/subfields, relationship, record checksum, extraction version, and content hash. CiNii v1 candidates need no migration.

Exact and normalized Persian lookup, whole-title retrieval, category filtering, citations, multiple matches, conflicts, and reviewed-only filtering retain Phase 8E behavior. The new `provider` search option enables provenance-aware selection without placing BSB rules in the index. For example, `ادب فارسی` and normalized `ادب فارسي` retrieve BSB record `991071006889707356`; selecting CiNii yields no match for that evidence slice.

All BSB output is `UNREVIEWED`, `NON_AUTHORITATIVE_CANDIDATE`, and `CANDIDATE`. A provider label cannot satisfy reviewed-only retrieval. The complete Phase 8E review attestation plus an external trusted candidate ID remains mandatory. No candidate is copied into gold or frozen evaluation data.
