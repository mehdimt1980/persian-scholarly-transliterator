# Phase 4.6B Governance & Benchmark Status

## Merged Infrastructure and Re-Audit Work

- PR #13 — initial independent scholarly adjudication.
- PR #14 — post-merge governance/CI repair.
- PR #15 — canonical-vs-publication-rendering contract.
- PR #16 — separated Validation V2 canonical/rendering contract.
- PR #17 — blind V2 re-audit protocol and 108-case worklist scaffold; merged at `7d80f508017c04c01f31f5357d402dfdb5fab207`.
- PR #18 — Batch A (`TERM` + `RELIGIOUS_TERM`) blind V2 re-audit; merged on `main` at `500cce2408cf0de572c4c0dc961ebf74d7a1c252`.

## Current Open Work

- **PR #19:** `data(validation): complete blind V2 re-audit Batch B` (open/unmerged once created from this branch).
- **Branch:** `phase4.6b/reaudit-batch-b-v2`.
- **Scope:** 5 `COMPOUND` + 10 `MORPHOLOGY` + 8 `IZAFAT` cases.
- **Reviewer provenance:** OpenAI GPT-5.6 Sol / `AI_SPECIALIST`.
- **Batch B result:** 23 `FINAL`, 0 `REVIEW_REQUIRED`, 0 `UNRESOLVED`.
- **Proposed worklist after Batch B:** 48 adjudicated / 60 `PENDING`.

## Current Governance State

- **Human governance sign-off:** **PAUSED** (`humanSignoff = null`).
- **Gold corpus:** **NOT frozen**. Batch A is merged; Batch B decisions remain proposed V2 scholarly ground truth until PR review/merge and later human governance sign-off.
- **Engine evaluation:** `engineEvaluationPerformed = false`.
- **Phase 4.6C:** **BLOCKED**.
- **Runtime integrity:** engine, lexicon, morphology, profiles, and bibliography runtime remain untouched.

## Blindness and Authority Boundaries

1. Batch A and Batch B decisions were established under `REAUDIT_PROTOCOL_V2.md`.
2. Historical V1 adjudication remains `HISTORICAL_ONLY` and is not evidence for V2 decisions.
3. Current engine output, runtime token state, lexicon behavior, and benchmark metrics are not used to decide scholarly gold.
4. Scholarly canonical transliteration and publication rendering remain independently recorded.
5. The primary safety invariant remains `FALSE_AUTHORITATIVE = 0`.
6. The re-audit validator enforces evidence/provenance/shape and sequential batch completion but does not dictate scholarly dispositions.

## Re-Audit Progress if PR #19 Is Accepted

| Batch | Scope | Completed | Pending |
|---|---|---:|---:|
| A | TERM + RELIGIOUS_TERM | 25 | 0 |
| B | COMPOUND + MORPHOLOGY + IZAFAT | 23 | 0 |
| C | PERSON + PLACE + INSTITUTION | 0 | 36 |
| D | BOOK_TITLE | 0 | 12 |
| E | AMBIGUITY | 0 | 12 |
| **Total** |  | **48** | **60** |

## Remaining Release Gates

1. Review and merge PR #19 if Batch B decisions and validator progression changes are accepted.
2. Conduct Batch C blind specialist re-audit (36 named entities).
3. Conduct Batch D blind specialist re-audit (12 book titles).
4. Conduct Batch E blind specialist re-audit (12 ambiguity/polysemy cases).
5. Consolidate all 108 decisions into the final V2 benchmark artifact and validate schema/provenance consistency.
6. Perform formal human governance sign-off.
7. Freeze scholarly gold.
8. Execute blind Phase 4.6C engine evaluation against the frozen V2 benchmark.
9. Apply targeted remediation only where evaluation proves a gap, then rerun the frozen benchmark without changing gold to improve metrics.
10. Complete final regression/release documentation/versioning gates before the first defensible scholarly release.
