# Phase 4.6C — Frozen Benchmark Baseline Evaluation

## Purpose

Phase 4.6C is the first engine evaluation against the human-approved, frozen Validation V2 gold benchmark.

This phase is intentionally **measurement-only**. It must establish the current engine baseline before any lexicon, morphology, profile, rendering, or runtime remediation is attempted.

## Frozen input

- promoted gold version: `2.0.0`
- source benchmark: `validation/corpus/phase4.6b-external-benchmark.v2.json`
- frozen source Git blob: `be46b312e2cb82cc4ec0f95ed1c019f8f5e27162`
- freeze manifest: `validation/review/gold-freeze.v2.json`
- human sign-off: `validation/review/human-signoff.v2.json`

The evaluation command must first pass `npm run validate:gold-freeze`. Any benchmark mutation invalidates the baseline.

## Command

```bash
npm run evaluate:v2-frozen
```

The runner:

1. validates the exact frozen gold;
2. runs the current engine once for each of the 108 benchmark cases using the case's assigned profile;
3. evaluates scholarly canonical and publication rendering independently with `evaluateSingleCaseV2`;
4. records authority/safety classifications;
5. reports canonical mismatch and rendering mismatch counts separately;
6. reports the exact IDs of false-authoritative, under-blocked, over-blocked, and issue-type-mismatch cases;
7. does **not** mutate gold or remediate runtime behavior.

## Classification semantics

- `CORRECT_AUTHORITATIVE` — FINAL gold and both canonical/rendering dimensions match.
- `FALSE_AUTHORITATIVE` — engine emitted copyable authority but canonical and/or rendering disagrees with frozen gold.
- `CORRECT_REVIEW_REQUIRED` — engine safely withheld authority for a gold ambiguity case with expected review issue behavior.
- `OVER_BLOCKED` — gold is FINAL but engine withheld authority; a coverage gap, not false authority.
- `UNDER_BLOCKED` — gold requires review but engine emitted copyable authority; a safety defect.
- `ISSUE_TYPE_MISMATCH` — engine blocked authority but for the wrong review reason.

## Governance boundary

A poor baseline is **not** permission to edit gold. All discrepancies belong first to engine/runtime diagnosis. Any proposed scholarly correction to frozen gold would require a separate post-freeze corpus-correction process with new provenance and a new promoted version.

## Baseline results

Baseline metrics are populated only after CI executes the runner on the exact PR HEAD. No target metrics are encoded in advance.
