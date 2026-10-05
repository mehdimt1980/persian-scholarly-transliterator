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

## Consolidated benchmark

- Artifact: `validation/corpus/phase4.6b-external-benchmark.v2.json`
- Version: `2.0.0-draft`
- Tier: `EXTERNAL_BENCHMARK`
- Review status: `AI_SPECIALIST_REVIEWED_PENDING_HUMAN`
- Total: 108
- `FINAL`: 103
- `REVIEW_REQUIRED`: 5
- `UNRESOLVED`: 0
- Pending: 0
- Specialist reviewer provenance: OpenAI GPT-5.6 Sol / `AI_SPECIALIST`
- Deterministic integrity gate: `npm run validate:v2-benchmark`

The exact `REVIEW_REQUIRED` IDs are:

- `cand-amb-001`
- `cand-amb-003`
- `cand-amb-007`
- `cand-amb-009`
- `cand-amb-011`

## Current gate — human governance review readiness

The next gate is formal human governance review using:

- `validation/review/HUMAN_SIGNOFF.md`
- `validation/review/SIGNOFF_PACKET_V2.md`

The review materials are being aligned to the consolidated V2 corpus. This preparation does **not** constitute approval.

Current governance state remains:

- `humanSignoff = null`
- gold **not frozen**
- `engineEvaluationPerformed = false`
- Phase 4.6C **blocked**
- historical V1 = `HISTORICAL_ONLY`
- runtime/lexicon/morphology/profile/bibliography behavior unchanged by scholarly review/consolidation
- safety invariant: `FALSE_AUTHORITATIVE = 0`

## What human approval will mean

Human approval is governance approval over the scholarly policy, representative/high-risk decisions, ambiguity preservation, provenance truthfulness, and consolidation integrity. It does not falsely claim that the human reviewer personally re-adjudicated all 108 cases. Case-level `AI_SPECIALIST` provenance remains permanent.

## Remaining release gates

1. Complete and merge human-signoff readiness documentation.
2. Obtain an explicit named human decision: `APPROVE` or `REQUEST_CORRECTIONS`.
3. If approved, perform a separate gold-promotion/freeze change that preserves AI specialist provenance.
4. Run blind Phase 4.6C engine evaluation against the frozen V2 benchmark.
5. Apply targeted runtime remediation only where the frozen evaluation proves a gap; never rewrite gold to improve metrics.
6. Rerun the frozen benchmark and complete final regression, release documentation, and versioning gates.
