# Phase 4.6B Governance & Benchmark Status

## Merged Infrastructure

- PR #13 — initial independent scholarly adjudication.
- PR #14 — post-merge governance/CI repair.
- PR #15 — canonical-vs-publication-rendering contract.
- PR #16 — separated Validation V2 canonical/rendering contract.
- PR #17 — blind V2 re-audit protocol and 108-case worklist scaffold; merged on `main` at `7d80f508017c04c01f31f5357d402dfdb5fab207`.

## Current Open Work

- **PR #18:** `data(validation): complete blind V2 re-audit Batch A`
- **Branch:** `phase4.6b/reaudit-batch-a-v2`
- **Scope:** 15 `TERM` + 10 `RELIGIOUS_TERM` cases.
- **Reviewer provenance:** OpenAI GPT-5.6 Sol / `AI_SPECIALIST`.
- **Batch A result:** 25 `FINAL`, 0 `REVIEW_REQUIRED`, 0 `UNRESOLVED`.
- **Remaining worklist:** 83 `PENDING`, all with `decision = null`.

## Current Governance State

- **Human governance sign-off:** **PAUSED** (`humanSignoff = null`).
- **Gold corpus:** **NOT frozen**. Batch A decisions are proposed V2 scholarly ground truth pending later human governance sign-off and gold freeze.
- **Engine evaluation:** `engineEvaluationPerformed = false`.
- **Phase 4.6C:** **BLOCKED**.
- **Runtime integrity:** engine, lexicon, morphology, profiles, and bibliography runtime remain untouched.

## Blindness and Authority Boundaries

1. Batch A decisions were established under `REAUDIT_PROTOCOL_V2.md`.
2. Historical V1 adjudication remains `HISTORICAL_ONLY` and is not evidence for V2 decisions.
3. Current engine output, runtime token state, lexicon behavior, and benchmark metrics are not used to decide scholarly gold.
4. Scholarly canonical transliteration and publication rendering remain independently recorded.
5. The primary safety invariant remains `FALSE_AUTHORITATIVE = 0`.

## Re-Audit Progress

| Batch | Scope | Completed | Pending |
|---|---|---:|---:|
| A | TERM + RELIGIOUS_TERM | 25 | 0 |
| B | COMPOUND + MORPHOLOGY + IZAFAT | 0 | 23 |
| C | PERSON + PLACE + INSTITUTION | 0 | 36 |
| D | BOOK_TITLE | 0 | 12 |
| E | AMBIGUITY | 0 | 12 |
| **Total** |  | **25** | **83** |

## Next Substantive Steps

1. Review and merge PR #18 if the Batch A scholarly decisions and validator changes are accepted.
2. Conduct Batch B blind specialist re-audit under the same evidence separation and engine-blindness rules.
3. Continue Batches C–E.
4. Regenerate the consolidated V2 benchmark only after all 108 cases are re-audited.
5. Perform formal human governance sign-off.
6. Freeze gold.
7. Begin Phase 4.6C engine evaluation only after those gates are satisfied.
