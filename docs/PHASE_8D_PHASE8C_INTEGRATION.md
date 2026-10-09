# Phase 8D to Phase 8C Integration

Phase 8D exports annotation candidates through an explicit one-way conversion. It does not edit Phase 8C corpora, manifests, frozen hashes, or reference answers.

The converter accepts only evidence records with a verified Persian-script title and a pairing status other than `UNCERTAIN_LANGUAGE_OR_PAIRING`. It emits:

- the original Persian source text and its existing project normalization;
- CiNii provider, source record ID, and source URL;
- the evidence record's provenance hash;
- any observed Latin variants marked `BIBLIOGRAPHIC_EVIDENCE_NOT_REFERENCE`;
- `REVIEW_PENDING` and `NON_AUTHORITATIVE_BIBLIOGRAPHIC_EVIDENCE` authority markers.

The export contains no IJMES expected value, gold status, adjudication decision, or automatic promotion operation. Observed catalog romanizations may use unknown or incompatible conventions and must not be scored as reference truth.

Independent scholarly review must verify source identity, title reading, bibliographic relationships, and the desired IJMES rendering. Promotion into authoritative evaluation assets must occur through a separate, human-controlled change and pull request using the existing Phase 8C review and freeze controls.

For the deterministic mock fixture, the converter produces four review-only candidates. This count demonstrates the interface only; it is not an acquisition yield claim.
