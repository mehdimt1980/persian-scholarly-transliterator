# Phase 8E Lexical Evidence Report

## Authority boundary

This pipeline produces non-authoritative hypotheses from accepted bibliographic evidence. It does not modify the reviewed production lexicon, production resolver, or frozen Phase 8C data. Every acquisition-generated candidate is `UNREVIEWED`, `NON_AUTHORITATIVE_CANDIDATE`, has no review attestation, and is extracted by `WHOLE_BIBLIOGRAPHIC_FIELD` version `phase8e-v1`.

## Schema and extraction policy

Each versioned candidate contains a stable ID, original and normalized Persian forms, category, contextual identity, full linguistic context, source IDs and URLs, title/creator field citations, observed Latin variants and their Phase 8D relationship classifications, bibliographic identities, evidence and distinct-source counts, review/authority state, extraction method, and content hash.

Accepted Persian titles are retained whole as `WORK_TITLE`. They are not automatically tokenized into lexical terms or multiword expressions. Arabic-script creator fields are retained as `UNCLASSIFIED_CANDIDATE`; creator-field placement alone does not prove person versus organization identity. Contextual identity includes a stable bibliographic identity, preventing homographs and names from unrelated records from being merged. Repeated observations from the same source are deduplicated and do not inflate distinct-source counts.

## Offline fixture results

These are deterministic synthetic-test measurements, not authentic CiNii measurements:

| Measure | Count |
|---|---:|
| Candidates | 7 |
| Whole work titles | 4 |
| Unclassified creator candidates | 3 |
| Distinct source records represented | 4 |
| Preserved Latin variants | 4 |
| Human-reviewed candidates | 0 |
| Automatically promoted lexicon entries | 0 |

The fixture produces separate candidates for equal forms with different bibliographic contexts. Conflicting classifications for the same Latin observation are retained and surfaced as `CONFLICTING` rather than resolved by ordering.

## Live measurements

Unavailable: requests attempted, authentic records, valid/invalid records, Persian yield, source coverage, actual Latin relationship distribution, distinct identities, WorldCat references, missing metadata, and authentic lexical candidate counts were not measured because live access was not authorized with credentials.

Candidate count is an engineering measurement only and is not evidence of scholarly correctness.
