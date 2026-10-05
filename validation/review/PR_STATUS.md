# Phase 4.6B Governance & Benchmark Status

## Completed and merged

- PR #13 — historical V1 adjudication.
- PR #14 — governance/CI repair.
- PR #15 — canonical-vs-publication-rendering contract.
- PR #16 — Validation V2 canonical/rendering separation.
- PR #17 — blind V2 re-audit protocol and 108-case worklist scaffold.
- PR #18 — Batch A (`TERM` + `RELIGIOUS_TERM`).
- PR #19 — Batch B (`COMPOUND` + `MORPHOLOGY` + `IZAFAT`).
- PR #20 — Batch C (`PERSON` + `PLACE` + `INSTITUTION`).
- PR #21 — Batch D (`BOOK_TITLE`).
- PR #22 — Batch E (`AMBIGUITY`).
- PR #23 — deterministic consolidation into Validation V2; merged at `cc4cf4e557591a81f995d56765508a7dc0b08155`.
- PR #24 — V2 human-governance sign-off readiness packet; merged at `4420f7b4c2c1ae3724923e67ac50ce58eff0efa3`.

## Frozen benchmark

The reviewed source benchmark snapshot is intentionally not rewritten after approval:

- source artifact: `validation/corpus/phase4.6b-external-benchmark.v2.json`
- source metadata version: `2.0.0-draft`
- exact frozen Git blob: `be46b312e2cb82cc4ec0f95ed1c019f8f5e27162`
- promoted gold version: `2.0.0`
- promotion manifest: `validation/review/gold-freeze.v2.json`
- human sign-off artifact: `validation/review/human-signoff.v2.json`
- integrity gate: `npm run validate:gold-freeze`

Benchmark contents remain:

- total: 108
- `FINAL`: 103
- `REVIEW_REQUIRED`: 5
- `UNRESOLVED`: 0
- pending: 0

The exact `REVIEW_REQUIRED` IDs are:

- `cand-amb-001`
- `cand-amb-003`
- `cand-amb-007`
- `cand-amb-009`
- `cand-amb-011`

## Human governance decision

- Decision: `APPROVE`
- Date: 2026-10-05
- Human reviewer identity: `@mehdimt1980`
- Basis: repository owner / human governance reviewer
- Scope: policy, representative/high-risk cases, ambiguity preservation, provenance model, consolidation integrity, and readiness to freeze
- Explicit non-claim: the human reviewer did **not** claim personal case-by-case re-adjudication of all 108 cases
- Primary case-level reviewer provenance remains: OpenAI GPT-5.6 Sol / `AI_SPECIALIST`

## Current governance state

- human governance: **APPROVED**
- promoted scholarly gold version: **2.0.0**
- gold: **FROZEN BY MANIFEST**
- source benchmark payload after review: **UNCHANGED**
- `engineEvaluationPerformedAtFreeze = false`
- Phase 4.6C: **AUTHORIZED after `validate:gold-freeze` passes**
- historical V1: `HISTORICAL_ONLY`
- runtime/lexicon/morphology/profile/bibliography behavior: unchanged by scholarly freeze
- safety invariant: `FALSE_AUTHORITATIVE = 0`

## Why freeze uses an external manifest

The source benchmark was reviewed in the exact snapshot whose metadata still says `2.0.0-draft` / pending-human. Rewriting that payload after approval merely to alter governance metadata would mutate the reviewed artifact. The freeze therefore binds the exact Git blob to a separate machine-readable human approval and promotion record.

This yields a stronger provenance chain:

```text
exact reviewed benchmark blob
        +
human-signoff.v2.json
        +
gold-freeze.v2.json
        ↓
frozen promoted gold v2.0.0
```

## Next gate — Phase 4.6C

1. Merge the human-signoff/gold-freeze PR only after full CI including `validate:gold-freeze` passes on the exact PR HEAD.
2. Re-run full CI on the merge commit.
3. Execute Phase 4.6C engine evaluation against the frozen promoted gold only after the freeze validator passes.
4. Record baseline metrics without changing gold.
5. Apply targeted runtime remediation only where frozen evaluation proves a gap.
6. Rerun the same frozen benchmark and complete regression/release documentation.
