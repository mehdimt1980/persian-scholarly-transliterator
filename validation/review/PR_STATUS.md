# Phase 4.6B Governance & Benchmark Status

## Merged Infrastructure and Re-Audit Work

- PR #13 — initial independent scholarly adjudication (historical V1 path).
- PR #14 — post-merge governance/CI repair.
- PR #15 — canonical-vs-publication-rendering contract.
- PR #16 — separated Validation V2 canonical/rendering contract.
- PR #17 — blind V2 re-audit protocol and 108-case worklist scaffold; merged at `7d80f508017c04c01f31f5357d402dfdb5fab207`.
- PR #18 — Batch A (`TERM` + `RELIGIOUS_TERM`) blind V2 re-audit; merged at `500cce2408cf0de572c4c0dc961ebf74d7a1c252`.
- PR #19 — Batch B (`COMPOUND` + `MORPHOLOGY` + `IZAFAT`) blind V2 re-audit; merged at `56531245ad5fa34f313295a5eaf3625ff3e83270`.
- PR #20 — Batch C (`PERSON` + `PLACE` + `INSTITUTION`) blind V2 re-audit; merged at `455ccba868012961a9da541d435d8b3932eaadae`.
- PR #21 — Batch D (`BOOK_TITLE`) blind V2 re-audit; merged at `0ad66006bb408aaa28feab4610008bd9b65a7993`.
- PR #22 — Batch E (`AMBIGUITY`) blind V2 re-audit; merged at `158cb930f15593680d1aa12e97d93dc19c5a768f`.

## Current Open Work — V2 Consolidation

- **Branch:** `phase4.6b/consolidate-v2-benchmark`.
- **Source of truth:** completed `validation/review/reaudit-worklist.v2.json`.
- **Generated V2 artifact:** `validation/corpus/phase4.6b-external-benchmark.v2.json`.
- **Generation model:** deterministic builder from the completed worklist; committed artifact must byte-equivalently deserialize to the builder output.
- **Validation command:** `npm run validate:v2-benchmark`.
- **Whole benchmark:** 108 cases = 103 `FINAL`, 5 `REVIEW_REQUIRED`, 0 `UNRESOLVED`.
- **Pending cases:** 0.

## Current Governance State

- **Specialist review:** complete under OpenAI GPT-5.6 Sol / `AI_SPECIALIST` provenance.
- **Human governance sign-off:** **NOT YET PERFORMED** (`humanSignoff = null`).
- **V2 metadata status:** `AI_SPECIALIST_REVIEWED_PENDING_HUMAN`.
- **Corpus tier:** `EXTERNAL_BENCHMARK`; it is intentionally distinct from `REAL_DISSERTATION` and cannot itself establish release-candidate readiness.
- **Gold corpus:** **NOT frozen**.
- **Engine evaluation:** `engineEvaluationPerformed = false`.
- **Phase 4.6C:** **BLOCKED** until human sign-off and gold freeze.
- **Runtime integrity:** engine, lexicon, morphology, profiles, and bibliography runtime remain untouched by scholarly consolidation.

## Blindness and Authority Boundaries

1. Batches A–E were established under `REAUDIT_PROTOCOL_V2.md` without using current engine outputs as scholarly evidence.
2. Historical `adjudication.v1.json` remains `HISTORICAL_ONLY`; it is not an evidence source for the V2 benchmark.
3. Consolidation copies the completed V2 decisions into the separated schema; it does not re-adjudicate or silently normalize scholarly strings.
4. Every `FINAL` case carries independently explicit `scholarlyCanonical` and `renderedOutput` expectations.
5. `REVIEW_REQUIRED` cases carry no authoritative canonical or rendered outputs.
6. The five blocked ambiguity IDs remain exactly:
   - `cand-amb-001`
   - `cand-amb-003`
   - `cand-amb-007`
   - `cand-amb-009`
   - `cand-amb-011`
7. The primary safety invariant remains `FALSE_AUTHORITATIVE = 0`.

## Completed Re-Audit

| Batch | Scope | Completed | Pending |
|---|---|---:|---:|
| A | TERM + RELIGIOUS_TERM | 25 | 0 |
| B | COMPOUND + MORPHOLOGY + IZAFAT | 23 | 0 |
| C | PERSON + PLACE + INSTITUTION | 36 | 0 |
| D | BOOK_TITLE | 12 | 0 |
| E | AMBIGUITY | 12 | 0 |
| **Total** |  | **108** | **0** |

## Remaining Release Gates

1. Review/merge the V2 consolidation PR after exact-head CI passes.
2. Perform formal human governance sign-off over policy, representative/high-risk cases, ambiguity preservation, provenance, and consolidation integrity.
3. Promote the consolidated artifact from draft/pending-human status and freeze scholarly gold.
4. Execute blind Phase 4.6C engine evaluation against that frozen V2 benchmark.
5. Apply targeted remediation only where the frozen evaluation proves a gap; never rewrite gold to improve metrics.
6. Rerun the frozen benchmark and complete final regression, release documentation, and versioning gates.
