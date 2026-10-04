# Phase 4.6B — Blind V2 Re-Audit, Batch A

## Status

- **Batch:** A — Lexical & Religious
- **Scope:** 15 `TERM` + 10 `RELIGIOUS_TERM`
- **Reviewer:** OpenAI GPT-5.6 Sol
- **Reviewer type:** `AI_SPECIALIST`
- **Review date:** 2026-10-04
- **Outcome:** 25 `FINAL`; 0 `REVIEW_REQUIRED`; 0 `UNRESOLVED`
- **Governance:** proposed V2 scholarly ground truth only; human sign-off remains pending; gold is not frozen.
- **Engine blindness:** `engineEvaluationPerformed = false`.

## Method

The first-pass review followed `REAUDIT_PROTOCOL_V2.md`.

Allowed evidence:
1. exact Persian `sourceText`;
2. Phase 4.6A acquisition evidence (Dehkhoda, Steingass, Encyclopaedia Iranica and verified source receipts);
3. independent IJMES rendering authorities.

Prohibited evidence:
- historical V1 `canonical` / `allowedCanonicals`;
- amendment answers;
- current engine output;
- runtime token state;
- current lexicon/morphology behavior;
- benchmark metrics.

Reading/identity and rendering were adjudicated separately. Iranica romanization was used as reading/identity evidence only; IJMES governs the publication rendering layer.

## Governing IJMES rules used

- Technical terms are fully transliterated with diacritics unless an explicit accepted-English or Word List exception applies.
- Persian uses IJMES `i/u`, not Iranica-style `e/o`.
- Persian izāfat is `-i`.
- Persian tāʾ marbūṭa is `ih`.
- Persian nisba is `-iyyih`.
- Initial hamza is dropped; ʿayn and relevant non-initial hamza are preserved.
- Explicit IJMES Word List forms govern publication rendering where listed.

## Decisions

| ID | Persian source | Category | Scholarly canonical | Publication rendering | Disposition |
|---|---|---|---|---|---|
| `cand-term-001` | نوسازی | `TERM` | `nawsāzī` | `nawsāzī` | `FINAL` |
| `cand-term-002` | بازرگانی | `TERM` | `bāzargānī` | `bāzargānī` | `FINAL` |
| `cand-term-003` | خودکامگی | `TERM` | `khudkāmigī` | `khudkāmigī` | `FINAL` |
| `cand-term-004` | مشروطه‌خواهی | `TERM` | `mashrūṭih-khwāhī` | `mashrūṭih-khwāhī` | `FINAL` |
| `cand-term-005` | دیوان‌سالاری | `TERM` | `dīvān-sālārī` | `dīvān-sālārī` | `FINAL` |
| `cand-term-006` | شاهنشاهی | `TERM` | `shāhanshāhī` | `shāhanshāhī` | `FINAL` |
| `cand-term-007` | تجدد | `TERM` | `tajaddud` | `tajaddud` | `FINAL` |
| `cand-term-008` | شهروندی | `TERM` | `shahrvandī` | `shahrvandī` | `FINAL` |
| `cand-term-009` | استعمار | `TERM` | `istiʿmār` | `istiʿmār` | `FINAL` |
| `cand-term-010` | جهان‌بینی | `TERM` | `jahān-bīnī` | `jahān-bīnī` | `FINAL` |
| `cand-term-011` | دادگستری | `TERM` | `dādgustarī` | `dādgustarī` | `FINAL` |
| `cand-term-012` | روشنفکری | `TERM` | `rawshanfikrī` | `rawshanfikrī` | `FINAL` |
| `cand-term-013` | کارگزاری | `TERM` | `kārguzārī` | `kārguzārī` | `FINAL` |
| `cand-term-014` | کشورمندی | `TERM` | `kishvarmandī` | `kishvarmandī` | `FINAL` |
| `cand-term-015` | میهن‌پرستی | `TERM` | `mīhan-parastī` | `mīhan-parastī` | `FINAL` |
| `cand-rel-001` | اجتهاد | `RELIGIOUS_TERM` | `ijtihād` | `ijtihād` | `FINAL` |
| `cand-rel-002` | تقلید | `RELIGIOUS_TERM` | `taqlīd` | `taqlīd` | `FINAL` |
| `cand-rel-003` | ولایت فقیه | `RELIGIOUS_TERM` | `vilāyat-i faqīh` | `vilāyat-i faqīh` | `FINAL` |
| `cand-rel-004` | امر به معروف | `RELIGIOUS_TERM` | `amr bih maʿrūf` | `amr bih maʿrūf` | `FINAL` |
| `cand-rel-005` | اهل بیت | `RELIGIOUS_TERM` | `ahl-i bayt` | `ahl-i bayt` | `FINAL` |
| `cand-rel-006` | خمس | `RELIGIOUS_TERM` | `khums` | `khums` | `FINAL` |
| `cand-rel-007` | زکات | `RELIGIOUS_TERM` | `zakāt` | `zakat` | `FINAL` |
| `cand-rel-008` | عاشورا | `RELIGIOUS_TERM` | `ʿāshūrā` | `ʿAshuraʾ` | `FINAL` |
| `cand-rel-009` | دارالتقریب | `RELIGIOUS_TERM` | `dār al-taqrīb` | `dār al-taqrīb` | `FINAL` |
| `cand-rel-010` | حسینیه | `RELIGIOUS_TERM` | `ḥusayniyyih` | `ḥusayniyyih` | `FINAL` |

## Canonical / Rendering Divergences

Two Batch A cases intentionally demonstrate why V2 separates scholarly canonical truth from publication rendering:

1. **زکات**
   - Scholarly canonical: `zakāt`
   - IJMES publication rendering: `zakat`
   - Reason: the lexical reading preserves long `ā`, while the IJMES Word List prescribes the undiacritized publication form.

2. **عاشورا**
   - Scholarly canonical: `ʿāshūrā`
   - IJMES publication rendering: `ʿAshuraʾ`
   - Reason: the exact Persian source `عاشورا` contains no final hamza, so the canonical remains source-faithful; the IJMES Word List independently prescribes `ʿAshuraʾ` as publication rendering.

All other Batch A cases have identical canonical and rendered strings under the current `ijmes_full` technical-term policy.

## High-Risk Review Notes

### مشروطه‌خواهی
`mashrūṭih-khwāhī` preserves the Persian `-ih` treatment and the visible compound boundary.

### جهان‌بینی
`jahān-bīnī` remains a transliteration of the supplied Persian source. The benchmark does not silently replace the source with the English translation “worldview.”

### امر به معروف
`amr bih maʿrūf` follows the exact Persian phrase and does not substitute a fuller Arabic formula.

### اهل بیت
`ahl-i bayt` converts the Persian linker to IJMES izāfat `-i`.

### حسینیه
`ḥusayniyyih` applies the current IJMES Persian nisba rule `-iyyih` and the IJMES Persian vowel system rather than mechanically copying Iranica `ḥosayniya`.

## Governance Result

Batch A is substantively reviewed but **not** human-approved and **not** release gold.

Current worklist state after this batch:
- 25 completed/adjudicated
- 83 pending
- `humanSignoff = null`
- gold unfrozen
- `engineEvaluationPerformed = false`
- Phase 4.6C blocked

No runtime, lexicon, morphology, profile, or engine remediation is authorized by this batch.
