# Phase 4.6B — Blind V2 Re-Audit, Batch E

## Status

- **Batch:** E — Ambiguity / homography
- **Scope:** 12 `AMBIGUITY` cases
- **Reviewer:** OpenAI GPT-5.6 Sol
- **Reviewer type:** `AI_SPECIALIST`
- **Review date:** 2026-10-05
- **Outcome:** 7 `FINAL`; 5 `REVIEW_REQUIRED`; 0 `UNRESOLVED`
- **Worklist after Batch E:** 108 adjudicated / 0 pending
- **Whole V2 re-audit:** 103 `FINAL`; 5 `REVIEW_REQUIRED`; 0 `UNRESOLVED`
- **Human governance sign-off:** pending (`humanSignoff = null`)
- **Gold:** not frozen
- **Engine blindness:** `engineEvaluationPerformed = false`

## Method

Batch E asks a narrower question than ordinary lexical review: does the exact unvocalized Persian surface permit more than one materially different scholarly transliteration? Semantic polysemy alone does **not** require review if all attested senses collapse to the same IJMES-form output. Conversely, when the written Persian form can legitimately encode different readings that remain distinct after IJMES transliteration, no authoritative canonical is emitted without context.

Reading evidence is the independently acquired and verified Steingass evidence from Phase 4.6A. Current IJMES Persian transliteration rules determine whether attested readings remain materially distinct in output. Historical V1 adjudication is not treated as evidence.

## Decisions

| ID | Persian source | Disposition | Scholarly result / non-authoritative alternatives |
|---|---|---|---|
| `cand-amb-001` | مهر | `REVIEW_REQUIRED` | `mihr` / `muhr` |
| `cand-amb-002` | شیر | `FINAL` | `shīr` |
| `cand-amb-003` | سر | `REVIEW_REQUIRED` | `sar` / `sirr` |
| `cand-amb-004` | باد | `FINAL` | `bād` |
| `cand-amb-005` | بار | `FINAL` | `bār` |
| `cand-amb-006` | داد | `FINAL` | `dād` |
| `cand-amb-007` | گل | `REVIEW_REQUIRED` | `gul` / `gil` |
| `cand-amb-008` | گوش | `FINAL` | `gūsh` |
| `cand-amb-009` | شور | `REVIEW_REQUIRED` | `shūr` / `shawr` |
| `cand-amb-010` | راست | `FINAL` | `rāst` |
| `cand-amb-011` | روی | `REVIEW_REQUIRED` | `rūy` / `ravī` |
| `cand-amb-012` | گاو | `FINAL` | `gāv` |

## Why Five Cases Stay Non-Authoritative

### مهر — `mihr` / `muhr`
The same unvocalized spelling supports materially different readings, including `mihr` (love/sun-related senses) and `muhr` (seal/stamp). The vowel contrast survives IJMES transliteration. Context is therefore required.

### سر — `sar` / `sirr`
Native Persian `sar` and Arabic-derived `sirr` are distinct lexical readings represented by the same Persian-script surface. They remain distinct in scholarly transliteration.

### گل — `gul` / `gil`
The spelling can represent `gul` (flower/rose) or `gil` (clay/mud). IJMES Persian `u/i` preserves the distinction, so the source alone is insufficient.

### شور — `shūr` / `shawr`
The surface can represent `shūr` in native Persian senses and a distinct counsel/consultation reading represented here as `shawr` under the project IJMES written-diphthong policy. The outputs do not collapse.

### روی — `rūy` / `ravī`
The same spelling supports native `rūy` and a distinct Arabic-derived `ravī` reading. They remain materially different in IJMES.

## Why Seven Cases Can Be FINAL

The remaining seven cases exhibit semantic, grammatical, historical, or pronunciation variation that does not produce more than one material benchmark transliteration under the project IJMES contract. They therefore receive one scholarly canonical string rather than being blocked merely because the source is polysemous.

This distinction is central to the safety invariant: ambiguity is preserved **when it affects authoritative transliteration**, not whenever a word has multiple dictionary senses.

## Governance Result

The blind V2 scholarly re-audit is now substantively complete across all 108 candidates:

- 103 `FINAL`
- 5 `REVIEW_REQUIRED`
- 0 `UNRESOLVED`
- 0 `PENDING`

This completion is **not** human governance approval, **not** a gold freeze, and **not** authorization to evaluate or remediate the engine. The next gate is consolidation of the completed worklist into the final V2 benchmark artifact, followed by explicit human governance sign-off and gold freeze.
