# Phase 4.6B — Consolidated Validation V2 Benchmark

## Artifact

The deterministic pre-signoff benchmark artifact is:

`validation/corpus/phase4.6b-external-benchmark.v2.json`

It is generated only from the completed engine-blind specialist worklist:

`validation/review/reaudit-worklist.v2.json`

The committed artifact is validated with:

```bash
npm run validate:v2-benchmark
```

The validator rebuilds the V2 corpus from the worklist and requires exact structural equality with the committed JSON. This prevents manual transcription drift during consolidation.

## Scholarly state

- 108 total cases
- 103 `FINAL`
- 5 `REVIEW_REQUIRED`
- 0 `UNRESOLVED`
- 0 pending
- reviewer provenance: OpenAI GPT-5.6 Sol / `AI_SPECIALIST`
- V2 review status: `AI_SPECIALIST_REVIEWED_PENDING_HUMAN`
- `humanSignoff = null`
- gold is not frozen
- `engineEvaluationPerformed = false`
- Phase 4.6C remains blocked

## V2 metadata extension

Validation V2 supports two benchmark-specific governance values without widening legacy V1 release-gate types:

- tier: `EXTERNAL_BENCHMARK`
- review status: `AI_SPECIALIST_REVIEWED_PENDING_HUMAN`

The second status requires explicit reviewer and review-date metadata and requires the reviewer string to identify `AI_SPECIALIST` provenance. It is intentionally distinct from `HUMAN_REVIEWED`.

## Deterministic projection rules

For every completed worklist case:

1. `id`, Persian input, category, and profile are copied unchanged.
2. `FINAL` decisions copy `scholarlyCanonical` and `renderedOutput` independently.
3. `REVIEW_REQUIRED` and `UNRESOLVED` decisions copy no authoritative canonical or rendered strings.
4. The five current `REVIEW_REQUIRED` ambiguity cases receive `LEXICAL_AMBIGUITY` as the required review issue type in the evaluation-facing V2 corpus.
5. Reading and rendering evidence are retained in V2 provenance with their original citation, locator, original source label, and evidence role.
6. AI specialist reviewer identity/date are retained in case-level provenance notes.
7. Historical V1 adjudication is not read by the builder.
8. The transliteration engine is not called by the builder or validator.

## Safety invariants

The consolidation fails if any of these conditions changes unexpectedly:

- worklist status is not `BATCH_E_COMPLETED`;
- worklist has anything other than 108 adjudicated / 0 pending;
- `engineEvaluationPerformed` is not false;
- `humanSignoff` is not null before the sign-off phase;
- V1 authority is not `HISTORICAL_ONLY`;
- disposition counts differ from 103 / 5 / 0;
- the five blocked ambiguity IDs change;
- a non-final case gains authoritative canonical/rendered output;
- the committed artifact diverges from the deterministic builder result.

## What this PR does not do

Consolidation does not:

- declare human approval;
- freeze gold;
- run Phase 4.6C;
- evaluate the current engine against the benchmark;
- alter runtime transliteration, lexicon, morphology, profiles, or bibliography behavior;
- remediate engine gaps;
- rewrite scholarly ground truth to improve metrics.

The next gate after this artifact is merged is formal human governance sign-off, followed by an explicit gold-freeze promotion step.
