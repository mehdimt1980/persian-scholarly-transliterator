# Phase 4.6B — Blind V2 Re-Audit, Batch B

## Status

- **Batch:** B — Grammatical Structure
- **Scope:** 5 `COMPOUND` + 10 `MORPHOLOGY` + 8 `IZAFAT`
- **Reviewer:** OpenAI GPT-5.6 Sol
- **Reviewer type:** `AI_SPECIALIST`
- **Review date:** 2026-10-05
- **Outcome:** 23 `FINAL`; 0 `REVIEW_REQUIRED`; 0 `UNRESOLVED`
- **Governance:** proposed V2 scholarly ground truth only; human sign-off remains pending; gold is not frozen.
- **Engine blindness:** `engineEvaluationPerformed = false`.

## Method

The review followed `REAUDIT_PROTOCOL_V2.md` and did not consult historical V1 adjudication or engine output as evidence. Reading and structure were established from the exact Persian surface plus Phase 4.6A acquisition evidence: Steingass/Dehkhoda for compounds, Lazard/Windfuhr for productive morphology, and Thackston plus verified lexical authority for izāfat constructions. Rendering follows the current Cambridge IJMES Persian system (`i/u`, full diacritics for technical transliteration, Persian izāfat `-i`) together with the project canonical contract, which explicitly preserves morphological boundary hyphens and post-vocalic `-yi`.

## Decisions

| ID | Persian source | Category | Scholarly canonical | Publication rendering | Disposition |
|---|---|---|---|---|---|
| `cand-cmp-001` | جهانگرد | `COMPOUND` | `jahān-gard` | `jahān-gard` | `FINAL` |
| `cand-cmp-002` | سخن‌سنج | `COMPOUND` | `sukhan-sanj` | `sukhan-sanj` | `FINAL` |
| `cand-cmp-003` | دانش‌پژوه | `COMPOUND` | `dānish-pazhūh` | `dānish-pazhūh` | `FINAL` |
| `cand-cmp-004` | نامه‌نگار | `COMPOUND` | `nāma-nigār` | `nāma-nigār` | `FINAL` |
| `cand-cmp-005` | دست‌نویس | `COMPOUND` | `dast-nivīs` | `dast-nivīs` | `FINAL` |
| `cand-mrp-001` | کتاب‌ها | `MORPHOLOGY` | `kitāb-hā` | `kitāb-hā` | `FINAL` |
| `cand-mrp-002` | نامه‌های | `MORPHOLOGY` | `nāma-hā-yi` | `nāma-hā-yi` | `FINAL` |
| `cand-mrp-003` | خردمندتر | `MORPHOLOGY` | `khiradmand-tar` | `khiradmand-tar` | `FINAL` |
| `cand-mrp-004` | بزرگ‌ترین | `MORPHOLOGY` | `buzurg-tarīn` | `buzurg-tarīn` | `FINAL` |
| `cand-mrp-005` | کتابم | `MORPHOLOGY` | `kitāb-am` | `kitāb-am` | `FINAL` |
| `cand-mrp-006` | خانه‌ات | `MORPHOLOGY` | `khāna-at` | `khāna-at` | `FINAL` |
| `cand-mrp-007` | قلمش | `MORPHOLOGY` | `qalam-ash` | `qalam-ash` | `FINAL` |
| `cand-mrp-008` | دیدگاه‌هایشان | `MORPHOLOGY` | `dīdgāh-hā-yi-shān` | `dīdgāh-hā-yi-shān` | `FINAL` |
| `cand-mrp-009` | دانشمندان | `MORPHOLOGY` | `dānishmand-ān` | `dānishmand-ān` | `FINAL` |
| `cand-mrp-010` | گزارش‌های | `MORPHOLOGY` | `guzārish-hā-yi` | `guzārish-hā-yi` | `FINAL` |
| `cand-izf-001` | تاریخ ادبیات | `IZAFAT` | `tārīkh-i adabīyāt` | `tārīkh-i adabīyāt` | `FINAL` |
| `cand-izf-002` | زبان مادری | `IZAFAT` | `zabān-i mādarī` | `zabān-i mādarī` | `FINAL` |
| `cand-izf-003` | حقوق بشر | `IZAFAT` | `ḥuqūq-i bashar` | `ḥuqūq-i bashar` | `FINAL` |
| `cand-izf-004` | خانه پدری | `IZAFAT` | `khāna-yi pidarī` | `khāna-yi pidarī` | `FINAL` |
| `cand-izf-005` | صدای باران | `IZAFAT` | `ṣidā-yi bārān` | `ṣidā-yi bārān` | `FINAL` |
| `cand-izf-006` | نسیم صبح | `IZAFAT` | `nasīm-i ṣubḥ` | `nasīm-i ṣubḥ` | `FINAL` |
| `cand-izf-007` | دیوان حافظ | `IZAFAT` | `dīvān-i ḥāfiẓ` | `dīvān-i ḥāfiẓ` | `FINAL` |
| `cand-izf-008` | درخت دانش | `IZAFAT` | `dirakht-i dānish` | `dirakht-i dānish` | `FINAL` |

## Structural Review Notes

### Compound boundaries

The scholarly canonical layer records analyzable compound-stem boundaries with hyphens. This is intentionally more explicit than Persian script spacing alone: `jahān-gard`, `sukhan-sanj`, `dānish-pazhūh`, `nāma-nigār`, and `dast-nivīs` preserve the compound structure rather than treating orthographic joining as evidence that the internal boundary has disappeared.

### Productive morphology

Productive suffixes and possessive enclitics remain morphologically explicit: `-hā`, `-tar`, `-tarīn`, `-am`, `-at`, `-ash`, and plural `-ān`. Vowel-final plural morphology uses the required linker: `nāma-hā-yi`; plural `hā` plus the possessive clitic in `دیدگاه‌هایشان` is represented `dīdgāh-hā-yi-shān`.

### Izāfat and post-vocalic linker

Consonant-final hosts take `-i`: `tārīkh-i`, `zabān-i`, `ḥuqūq-i`, `nasīm-i`, `dīvān-i`, `dirakht-i`. Vowel-final hosts take the project’s explicit post-vocalic linker `-yi`: `khāna-yi`, `ṣidā-yi`.

### High-risk lexical readings

- `خردمندتر` uses IJMES Persian `i` in `khiradmand-tar`, not another system’s `e`.
- `بزرگ‌ترین` uses IJMES Persian `u`: `buzurg-tarīn`.
- `گزارش‌های` uses independently attested `guzārish`, not Iranica-style `gozāreš`.
- `حقوق بشر` preserves the Persian scholarly forms `ḥuqūq-i bashar`.
- `صبح` is represented `ṣubḥ` in the technical scholarly layer.
- `حافظ` retains scholarly consonantal diacritics in this `ijmes_full` structural test: `ḥāfiẓ`.

## Governance Result

Batch B is substantively reviewed but is **not** human-approved and is **not** release gold.

After Batch B is recorded in the worklist, expected progress is:
- 48 completed/adjudicated
- 60 pending
- `humanSignoff = null`
- gold unfrozen
- `engineEvaluationPerformed = false`
- Phase 4.6C blocked

No runtime, lexicon, morphology, profile, bibliography, or engine remediation is authorized by this batch.
