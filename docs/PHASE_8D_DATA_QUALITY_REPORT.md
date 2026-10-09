# Phase 8D Data Quality Report

## Result status

Live CiNii pilot: **NOT RUN**. No authorized live acquisition or application ID was supplied. No live counts are claimed.

Offline mocked pilot: **RUN**. The fixture is synthetic and tests extraction behavior; it is not CiNii-derived research data and is not representative of Persian bibliography.

## Offline fixture metrics

| Measure | Count | Notes |
|---|---:|---|
| Attempted / received | 7 / 7 | Mocked records; zero API errors |
| Unique bibliographic records | 7 | Records remain separate, including related editions |
| Persian-script titles | 4 | Positive Unicode evidence; language-supported ambiguous titles are counted separately |
| Language-supported ambiguous-script candidates | 0 | Fixture metric; behavior is covered by regression tests |
| Co-occurring Latin variants | 4 | Variant count, not verified pair count |
| Romanization candidates | 2 | Explicitly marked by mocked source structure; still unverified |
| Translated titles | 1 | Explicitly marked translation |
| Undetermined Latin variants | 1 | Co-occurrence without relationship evidence |
| Verified romanization pairs | 0 | Always requires independent review outside acquisition |
| Uncertain pairings | 4 | Includes undetermined/Latin-only, Arabic-language uncertainty, and mixed-script structure |
| Script/language mismatches | 2 | `fa` metadata with no accepted Persian title (28.6%) |
| Exact duplicates / duplicate manifestations | 0 / 0 | Shared-ID behavior is covered separately by tests |
| Related editions | 2 | Same normalized Persian title, distinct publication evidence |
| Similar-title / uncertain relationships | 0 / 0 | Fixture values; adverse cases are covered by tests |
| WorldCat cross-references | 1 | Explicit link only; not an independently verified match |
| Missing publisher / year | 1 / 0 | Missing values remain null |
| Missing stable identifier | 0 | Mock records use CRIDs as stable source identifiers |
| Review-ready candidates | 4 | All remain non-authoritative and pending review |

Two records contain four co-occurring Latin variants, but there are zero verified romanization pairs. This is a parser exercise, not a yield estimate for CiNii. Publication periods and subjects were not sampled scientifically, so no coverage inference is valid.

## Provenance and integrity

Each record stores provider, source record ID and URL, timestamp, query ID, record type, raw titles, creators, publisher/year, language metadata, available identifiers, explicit cross-catalog references, original source field names, a raw-record checksum, and a deterministic content hash. Strict schemas reject malformed source envelopes, pagination metadata, and evidence records. Credentials are excluded from URLs retained for diagnostics and are never written to artifacts.

## Errors and ambiguity

The offline run produced zero transport or format errors. Tests cover malformed records, missing identifiers, retries, 429 `Retry-After`, request budgets, pagination, Unicode normalization, and offline no-network behavior. Arabic script without Persian-specific Unicode evidence remains linguistically uncertain. Mixed strings are not split into inferred title pairs. Equal normalized titles do not establish work identity.

## Remaining limitations

- No live yield, field-completeness, latency, throttling, or source-format observations exist.
- Persian-specific letters provide positive evidence but their absence cannot distinguish Persian from Arabic.
- Same-record title co-occurrence supports pairing but does not identify a romanization standard.
- Bibliographic relationship inference is deliberately shallow and requires review.
- The fixture does not model every JSON-LD shape the API may return.
- A future authorized pilot needs a declared sampling design before representativeness can be discussed.
