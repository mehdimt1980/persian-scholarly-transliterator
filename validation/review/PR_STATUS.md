# Phase 4.6B Governance & Benchmark Status

## Merged Infrastructure and Re-Audit Work

- PR #13 — initial independent scholarly adjudication.
- PR #14 — post-merge governance/CI repair.
- PR #15 — canonical-vs-publication-rendering contract.
- PR #16 — separated Validation V2 canonical/rendering contract.
- PR #17 — blind V2 re-audit protocol and 108-case worklist scaffold; merged at `7d80f508017c04c01f31f5357d402dfdb5fab207`.
- PR #18 — Batch A (`TERM` + `RELIGIOUS_TERM`) blind V2 re-audit; merged at `500cce2408cf0de572c4c0dc961ebf74d7a1c252`.
- PR #19 — Batch B (`COMPOUND` + `MORPHOLOGY` + `IZAFAT`) blind V2 re-audit; merged at `56531245ad5fa34f313295a5eaf3625ff3e83270`.
- PR #20 — Batch C (`PERSON` + `PLACE` + `INSTITUTION`) blind V2 re-audit; merged at `455ccba868012961a9da541d435d8b3932eaadae`.
- PR #21 — Batch D (`BOOK_TITLE`) blind V2 re-audit; merged at `0ad66006bb408aaa28feab4610008bd9b65a7993`.

## Current Open Work

- **Batch E branch:** `phase4.6b/reaudit-batch-e-v2`.
- **Scope:** 12 `AMBIGUITY` cases.
- **Reviewer provenance:** OpenAI GPT-5.6 Sol / `AI_SPECIALIST`.
- **Batch E result:** 7 `FINAL`, 5 `REVIEW_REQUIRED`, 0 `UNRESOLVED`.
- **Completed V2 re-audit:** 108 adjudicated / 0 `PENDING`.
- **Whole-worklist disposition:** 103 `FINAL`, 5 `REVIEW_REQUIRED`, 0 `UNRESOLVED`.

## Current Governance State

- **Human governance sign-off:** **PAUSED** (`humanSignoff = null`).
- **Gold corpus:** **NOT frozen**. The full 108-case V2 scholarly re-audit is substantively complete, but these decisions remain proposed scholarly ground truth until consolidation and explicit human governance approval.
- **Engine evaluation:** `engineEvaluationPerformed = false`.
- **Phase 4.6C:** **BLOCKED**.
- **Runtime integrity:** engine, lexicon, morphology, profiles, and bibliography runtime remain untouched by the re-audit.

## Blindness and Authority Boundaries

1. Batches A–E were established under `REAUDIT_PROTOCOL_V2.md`.
2. Historical V1 adjudication remains `HISTORICAL_ONLY` and is not evidence for V2 decisions.
3. Current engine output, runtime token state, lexicon behavior, and benchmark metrics were not used to decide scholarly ground truth.
4. Scholarly canonical transliteration and publication rendering remain independently recorded.
5. The primary safety invariant remains `FALSE_AUTHORITATIVE = 0`.
6. Five genuinely ambiguous unvocalized forms remain `REVIEW_REQUIRED` rather than being forced into authoritative single readings.

## Re-Audit Progress After Batch E

| Batch | Scope | Completed | Pending |
|---|---|---:|---:|
| A | TERM + RELIGIOUS_TERM | 25 | 0 |
| B | COMPOUND + MORPHOLOGY + IZAFAT | 23 | 0 |
| C | PERSON + PLACE + INSTITUTION | 36 | 0 |
| D | BOOK_TITLE | 12 | 0 |
| E | AMBIGUITY | 12 | 0 |
| **Total** |  | **108** | **0** |

## Remaining Release Gates

1. Review/merge Batch E.
2. Consolidate the completed 108-case worklist into the final V2 benchmark artifact and validate canonical/rendering/provenance consistency.
3. Perform formal human governance sign-off.
4. Freeze scholarly gold.
5. Execute blind Phase 4.6C engine evaluation against the frozen V2 benchmark.
6. Apply targeted remediation only where the frozen evaluation proves a gap; do not rewrite gold to improve metrics.
7. Rerun the frozen benchmark and complete final regression/release documentation/versioning gates.
