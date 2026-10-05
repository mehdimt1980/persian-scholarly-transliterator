# Phase 4.6C — Frozen Benchmark Baseline Evaluation

## Purpose

Phase 4.6C is the first engine evaluation against the human-approved, frozen Validation V2 gold benchmark.

This phase is intentionally **measurement-only**. It establishes the current engine baseline before any lexicon, morphology, profile, rendering, or runtime remediation is attempted.

## Frozen input

- promoted gold version: `2.0.0`
- source benchmark: `validation/corpus/phase4.6b-external-benchmark.v2.json`
- frozen source Git blob: `be46b312e2cb82cc4ec0f95ed1c019f8f5e27162`
- freeze manifest: `validation/review/gold-freeze.v2.json`
- human sign-off: `validation/review/human-signoff.v2.json`

The evaluation command first passes `npm run validate:gold-freeze`. Any benchmark mutation invalidates the evaluation boundary.

## Command

```bash
npm run evaluate:v2-frozen
```

The runner:

1. validates the exact frozen gold;
2. runs the current engine once for each of the 108 benchmark cases using the assigned profile;
3. evaluates scholarly canonical and publication rendering independently with `evaluateSingleCaseV2`;
4. records authority/safety classifications;
5. reports canonical and rendering mismatch counts separately;
6. reports exact IDs for safety/coverage classification failures;
7. does **not** mutate gold or remediate runtime behavior.

## Baseline provenance

The first frozen baseline was executed by GitHub Actions on:

- evaluation runner HEAD: `9d3ca9eb407d1bb03dc2df4017b8a5f6715c7191`
- CI run: `37292803825` (#136)
- date: 2026-10-05
- frozen benchmark Git blob: `be46b312e2cb82cc4ec0f95ed1c019f8f5e27162`
- CI result: **PASS**

Machine-readable summary:

`validation/review/phase4.6c-baseline.v1.json`

The complete case-level diagnostic output remains preserved in the GitHub Actions log for run #136.

## Baseline results

| Metric | Result |
|---|---:|
| Total cases | 108 |
| Gold `FINAL` cases | 103 |
| Gold `REVIEW_REQUIRED` cases | 5 |
| `CORRECT_AUTHORITATIVE` | 5 |
| `FALSE_AUTHORITATIVE` | **0** |
| `CORRECT_REVIEW_REQUIRED` | 0 |
| `OVER_BLOCKED` | 98 |
| `UNDER_BLOCKED` | **0** |
| `ISSUE_TYPE_MISMATCH` | 5 |
| `INVALID_GOLD_CASE` | 0 |
| Authoritative exact-match rate | 5 / 103 = **4.85%** |
| Safe-behavior rate | 103 / 108 = **95.37%** |
| Canonical mismatch count | 0 |
| Rendering mismatch count | 0 |
| Both-dimension mismatch count | 0 |

## Interpretation

The baseline reveals a clear asymmetry between **safety** and **coverage**.

### Safety is strong

- `FALSE_AUTHORITATIVE = 0`.
- `UNDER_BLOCKED = 0`.
- Every FINAL case that the engine currently makes copyable matches both the frozen scholarly canonical and frozen publication rendering exactly.
- There are therefore no observed cases where the engine confidently emits an incorrect frozen-gold transliteration.

This preserves the project's primary safety invariant.

### Coverage is the dominant deficiency

Only 5 of 103 FINAL cases are currently authoritative. The other 98 are `OVER_BLOCKED`: the frozen gold says a scholarly answer exists, but the engine conservatively withholds authority, usually because one or more tokens lack reviewed lexical/runtime support.

`OVER_BLOCKED` is therefore primarily a coverage problem, not a false-authority problem.

### The five gold ambiguities are blocked for the wrong reason

All five frozen `REVIEW_REQUIRED` cases remain non-copyable, which is safe, but the engine reports `UNKNOWN_TOKEN` rather than the required `LEXICAL_AMBIGUITY`. They are consequently classified as `ISSUE_TYPE_MISMATCH`:

- `cand-amb-001` — مهر
- `cand-amb-003` — سر
- `cand-amb-007` — گل
- `cand-amb-009` — شور
- `cand-amb-011` — روی

The remediation goal is not to choose one reading. It is to recognize the reviewed ambiguity and continue blocking authority with the correct issue semantics.

## Remediation order

The frozen baseline supports a staged remediation program:

1. **Ambiguity recognition:** convert the five safe-but-generic `UNKNOWN_TOKEN` blocks into explicit `LEXICAL_AMBIGUITY` without making them copyable.
2. **Reviewed lexical coverage:** improve authoritative coverage using source-backed reviewed lexicon additions and generalizable logic, not benchmark-specific hardcoding.
3. **Morphology / productive structure:** address legitimate over-blocking where compositional rules can generalize beyond a benchmark fixture.
4. **Named-entity and rendering policy:** implement the known PERSON/PLACE/INSTITUTION publication-rendering boundary without changing scholarly gold.
5. **Titles and profile rendering:** address remaining title-specific publication behavior.
6. After each remediation slice, rerun the **same frozen blob** and require `FALSE_AUTHORITATIVE = 0` and `UNDER_BLOCKED = 0` to remain intact.

## Anti-leakage rule

Phase 4.6C failures may identify where the runtime lacks coverage, but frozen benchmark strings must not simply be copied into production as test-specific hardcodes. New authoritative entries/rules require independent scholarly provenance and should generalize beyond the benchmark case that exposed the gap.

## Governance boundary

A poor coverage baseline is **not** permission to edit gold. All discrepancies belong first to engine/runtime diagnosis. Any genuine scholarly correction to frozen gold would require a separate post-freeze corpus-correction process with new provenance and a new promoted version.
