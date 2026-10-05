# Phase 4.6B Governance & Benchmark Status

## Merged Infrastructure and Re-Audit Work

- PR #13 — initial independent scholarly adjudication.
- PR #14 — post-merge governance/CI repair.
- PR #15 — canonical-vs-publication-rendering contract.
- PR #16 — separated Validation V2 canonical/rendering contract.
- PR #17 — blind V2 re-audit protocol and 108-case worklist scaffold; merged at `7d80f508017c04c01f31f5357d402dfdb5fab207`.
- PR #18 — Batch A (`TERM` + `RELIGIOUS_TERM`) blind V2 re-audit; merged at `500cce2408cf0de572c4c0dc961ebf74d7a1c252`.
- PR #19 — Batch B (`COMPOUND` + `MORPHOLOGY` + `IZAFAT`) blind V2 re-audit; merged at `56531245ad5fa34f313295a5eaf3625ff3e83270`.

## Current Open Work

- **PR #20:** `data(validation): complete blind V2 re-audit Batch C`.
- **Branch:** `phase4.6b/reaudit-batch-c-v2`.
- **Scope:** 18 `PERSON` + 12 `PLACE` + 6 `INSTITUTION` cases.
- **Reviewer provenance:** OpenAI GPT-5.6 Sol / `AI_SPECIALIST`.
- **Batch C result:** 36 `FINAL`, 0 `REVIEW_REQUIRED`, 0 `UNRESOLVED`.
- **Proposed worklist after Batch C:** 84 adjudicated / 24 `PENDING`.

## Current Governance State

- **Human governance sign-off:** **PAUSED** (`humanSignoff = null`).
- **Gold corpus:** **NOT frozen**. Batches A+B are merged; Batch C remains proposed V2 scholarly ground truth until PR review/merge and later human governance sign-off.
- **Engine evaluation:** `engineEvaluationPerformed = false`.
- **Phase 4.6C:** **BLOCKED**.
- **Runtime integrity:** engine, lexicon, morphology, profiles, and bibliography runtime remain untouched.

## Blindness and Authority Boundaries

1. Batches A–C were established under `REAUDIT_PROTOCOL_V2.md`.
2. Historical V1 adjudication remains `HISTORICAL_ONLY` and is not evidence for V2 decisions.
3. Current engine output, runtime token state, lexicon behavior, and benchmark metrics are not used to decide scholarly gold.
4. Scholarly canonical transliteration and publication rendering remain independently recorded.
5. The primary safety invariant remains `FALSE_AUTHORITATIVE = 0`.
6. The re-audit validator enforces evidence/provenance/shape and sequential batch completion but does not dictate scholarly dispositions.

## Re-Audit Progress if PR #20 Is Accepted

| Batch | Scope | Completed | Pending |
|---|---|---:|---:|
| A | TERM + RELIGIOUS_TERM | 25 | 0 |
| B | COMPOUND + MORPHOLOGY + IZAFAT | 23 | 0 |
| C | PERSON + PLACE + INSTITUTION | 36 | 0 |
| D | BOOK_TITLE | 0 | 12 |
| E | AMBIGUITY | 0 | 12 |
| **Total** |  | **84** | **24** |

## Remaining Release Gates

1. Merge PR #20 if Batch C is accepted.
2. Conduct Batch D blind specialist re-audit (12 book titles).
3. Conduct Batch E blind specialist re-audit (12 ambiguity/polysemy cases).
4. Consolidate all 108 decisions into the final V2 benchmark artifact and validate schema/provenance consistency.
5. Perform formal human governance sign-off.
6. Freeze scholarly gold.
7. Execute blind Phase 4.6C engine evaluation against the frozen V2 benchmark.
8. Apply targeted remediation only where evaluation proves a gap, then rerun the frozen benchmark without changing gold to improve metrics.
9. Complete final regression/release documentation/versioning gates before the first defensible scholarly release.
