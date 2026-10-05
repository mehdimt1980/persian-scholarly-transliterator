# Phase 4.6B — Validation V2 Gold Freeze

## Status

Human governance approval was explicitly recorded on 2026-10-05. The approved scholarly benchmark is frozen by reference rather than rewritten after review.

The reviewed source payload remains exactly:

`validation/corpus/phase4.6b-external-benchmark.v2.json`

Its Git blob identity at freeze is:

`be46b312e2cb82cc4ec0f95ed1c019f8f5e27162`

The machine-readable promotion record is:

`validation/review/gold-freeze.v2.json`

The machine-readable human approval record is:

`validation/review/human-signoff.v2.json`

## Why the source JSON is not rewritten

The consolidated benchmark was reviewed in its existing `2.0.0-draft` snapshot. After approval, changing that payload merely to replace metadata such as `draft` or `pending human` would mutate the reviewed artifact itself.

Instead, the repository uses an external promotion manifest:

```text
reviewed benchmark snapshot
        +
human-signoff.v2.json
        +
gold-freeze.v2.json
        ↓
promoted gold version 2.0.0
```

This preserves the exact reviewed 108-case payload while recording human approval and freeze state separately and audibly.

## Frozen benchmark facts

- cases: 108
- `FINAL`: 103
- `REVIEW_REQUIRED`: 5
- `UNRESOLVED`: 0
- pending: 0
- frozen source Git blob: `be46b312e2cb82cc4ec0f95ed1c019f8f5e27162`
- promoted gold version: `2.0.0`
- engine evaluation performed at freeze: `false`
- Phase 4.6C authorized after freeze validation: `true`

The exact `REVIEW_REQUIRED` IDs remain:

- `cand-amb-001`
- `cand-amb-003`
- `cand-amb-007`
- `cand-amb-009`
- `cand-amb-011`

## Provenance boundary

Primary case-by-case adjudication remains permanently attributed to:

`OpenAI GPT-5.6 Sol / AI_SPECIALIST`

Human governance approval is separately attributed to the repository-owner identity recorded in `human-signoff.v2.json`. Approval does not claim human case-by-case re-adjudication of all 108 cases.

## Integrity gate

Run:

```bash
npm run validate:v2-benchmark
npm run validate:gold-freeze
```

`validate:gold-freeze` fails closed if:

- the human sign-off is missing or no longer `APPROVE`;
- the exact frozen benchmark Git blob changes;
- benchmark ID/version changes;
- case count or disposition counts change;
- the five `REVIEW_REQUIRED` IDs change;
- AI specialist provenance is removed;
- the freeze manifest no longer authorizes Phase 4.6C from an engine-blind freeze state.

Any later scholarly correction must be an explicit post-freeze corpus correction with new provenance and a new promoted version. Gold must never be rewritten merely to improve engine metrics.
