# Adjudication Consolidation

## Current Validation V2 benchmark

The current Phase 4.6B scholarly re-audit is consolidated in:

`validation/corpus/phase4.6b-external-benchmark.v2.json`

It is generated deterministically from:

`validation/review/reaudit-worklist.v2.json`

Use:

```bash
npm run validate:v2-benchmark
```

to fail closed unless the committed V2 artifact is an exact deterministic projection of the completed re-audit worklist and all V2 schema/governance invariants hold.

Current V2 state:

- total: 108
- `FINAL`: 103
- `REVIEW_REQUIRED`: 5
- `UNRESOLVED`: 0
- pending: 0
- corpus tier: `EXTERNAL_BENCHMARK`
- review status: `AI_SPECIALIST_REVIEWED_PENDING_HUMAN`
- `humanSignoff = null`
- gold: **not frozen**
- `engineEvaluationPerformed = false`
- Phase 4.6C: **blocked**

The five `REVIEW_REQUIRED` cases remain:

- `cand-amb-001`
- `cand-amb-003`
- `cand-amb-007`
- `cand-amb-009`
- `cand-amb-011`

For those cases the V2 corpus contains no authoritative `scholarlyCanonical` or `renderedOutput` field. Candidate readings remain non-gold review context only in the specialist worklist.

For every `FINAL` case, Validation V2 independently records:

1. `scholarlyCanonical` — source-faithful, diacritic-preserving scholarly transliteration;
2. `renderedOutput` — publication/profile presentation.

The consolidation process does not call the transliteration engine, consult runtime output, or alter scholarly decisions to improve metrics.

## Historical Validation V1 adjudication

The earlier artifact remains available for audit history at:

`validation/review/adjudication.v1.json`

Historical version:

`1.0.2-draft`

Its correction trail remains in:

`validation/review/adjudication-amendments.v1.json`

The amendment ledger is `CONSOLIDATED` and retained as provenance only. The historical V1 path is explicitly `HISTORICAL_ONLY` for the Phase 4.6B V2 benchmark because V1 could conflate scholarly canonical transliteration with publication rendering.

`npm run validate:adjudication` therefore remains a historical-integrity check; it does **not** promote V1 values over the re-audited V2 benchmark.

## Next governance gate

Explicit human governance sign-off is still required. Only after that approval may the V2 benchmark be promoted from draft/pending-human status, frozen as scholarly gold, and used for blind Phase 4.6C engine evaluation.

Any later scholarly correction to frozen gold must use an explicit corpus-correction process with new provenance. Gold must never be silently rewritten to improve engine metrics.
