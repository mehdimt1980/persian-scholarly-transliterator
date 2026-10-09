# Phase 8E AI Retrieval Readiness

## Retrieval interface

`LexicalEvidenceIndex` is a deterministic in-memory interface over the JSON evidence artifact. It supports exact Persian lookup, normalized Persian lookup, multiword forms, category filtering, reviewed-only filtering, source citations, bibliographic identities, and all observed Latin relationship classifications.

Retrieval states are explicit:

- `OBSERVED` labels source-field citations.
- `CANDIDATE` labels unreviewed derived candidates and ordinary matches.
- `REVIEWED` is reserved for human-reviewed evidence.
- `CONFLICTING` exposes incompatible observations without suppressing them.
- `INSUFFICIENT_EVIDENCE` is returned when nothing matches.

## Reviewed-evidence contract

A mutable `reviewStatus` is never sufficient for scholarly authority. Future reviewed evidence must carry a versioned `phase8e-review-attestation-v1` record containing the attested candidate ID, reviewer identity, review timestamp, decision ID and provenance, review-process version, explicit `CANDIDATE_IDENTITY_AND_EVIDENCE` scope, and the hash of the reviewed candidate basis. Review, authority, evidence-status, and candidate-identity fields must be internally consistent with that attestation.

Retrieval additionally requires the candidate ID to be present in an externally supplied trusted-review set. The default index has no trusted reviews. Thus a fabricated `REVIEWED` label, incomplete metadata, or even a structurally complete but untrusted attestation cannot satisfy `reviewedOnly` and cannot produce `REVIEWED` retrieval status. Phase 8E provides no promotion function; establishing and loading trusted review decisions belongs to a separate human-controlled workflow.

## Offline demonstration

The committed demonstration contains three deterministic queries:

- `تاریخ ایران` returns two separate `WORK_TITLE` candidates because the fixture contains distinct bibliographic contexts.
- `شاهنامه پژوهی` returns its work-title candidate, source citation, and preserved romanization, translation, and undetermined Latin variants.
- `اندیشه ترقی و حکومت قانون` returns `INSUFFICIENT_EVIDENCE`; no match is manufactured.

The demonstration does not claim improved AI accuracy. It does not inject evidence into prompts, alter model confidence, or call the production phrase resolver.

## Integration readiness and next steps

A later phase can add reviewed evidence to a phrase-resolver request through a separately versioned adapter. Before that integration, scholars must review candidate identity, category, source independence, Latin relationships, and canonical readings. Comparative evaluation should then measure resolver behavior with and without reviewed evidence while retaining the current validation and authority gates. Vector storage or embeddings are not justified for this exact/normalized pilot index.
