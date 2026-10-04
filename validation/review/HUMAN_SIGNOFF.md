# Phase 4.6B — Human Sign-Off Checklist

## Purpose

This checklist is the final human approval layer over the specialist adjudication in:

- `validation/review/adjudication.v1.json`
- `validation/review/adjudication-amendments.v1.json`
- `validation/review/REVIEW_POLICY.md`
- `validation/review/REVIEW_SUMMARY.md`

Primary case-by-case adjudication was performed by OpenAI GPT-5.6 Sol acting as a specialist reviewer. Human sign-off does **not** retroactively make the AI the human reviewer; provenance must continue to state both roles truthfully.

Do not sign until the two post-draft amendments have been consolidated into the final adjudication artifact.

## Policy assertions to approve

- [ ] I approve Cambridge IJMES as the rendering-policy authority for this benchmark.
- [ ] I approve the separation of reading/identity evidence (e.g. Iranica, dictionaries, authority files) from IJMES rendering authority.
- [ ] I approve Persian `i/u` and izafat `-i` as applied in this review.
- [ ] I approve IJMES Word List forms taking precedence where explicitly prescribed (e.g. `zakat`, `ʿAshuraʾ`).
- [ ] I approve no-diacritic presentation for personal names, place names, and organizations, with established English spellings used where appropriate.
- [ ] I approve IJMES no-diacritic title presentation with ʿayn/hamza retained and English capitalization conventions.
- [ ] I approve `REVIEW_REQUIRED` as a correct gold outcome where the Persian surface alone cannot safely determine one reading.
- [ ] I confirm that gold truth must not be altered later merely to improve engine metrics.

## Representative case spot-checks

The purpose of these samples is to expose each major policy decision, not to conceal the full corpus behind a small subset.

### Technical terms

- [ ] `نوسازی` → `nusāzī`
- [ ] `مشروطه‌خواهی` → `mashrūṭih-khwāhī`
- [ ] `روشنفکری` → `rawshanfikrī`
- [ ] `کارگزاری` → `kārguzārī`

### Religious terms / Word List

- [ ] `اجتهاد` → `ijtihād`
- [ ] `ولایت فقیه` → `vilāyat-i faqīh`
- [ ] `زکات` → `zakat`
- [ ] `عاشورا` → `ʿAshuraʾ`

### Personal names

- [ ] `صادق هدایت` → `Sadeq Hedayat`
- [ ] `جلال آل‌احمد` → `Jalal Al-e Ahmad`
- [ ] `پروین اعتصامی` → `Parvin E'tesami`
- [ ] `سهراب سپهری` → `Sohrab Sepehri`

### Places

- [ ] `آذربایجان` → `Azerbaijan`
- [ ] `تخت جمشید` → `Persepolis`
- [ ] `پاسارگاد` → `Pasargadae`

### Organizations

- [ ] `مجلس شورای ملی` → `Majlis-i Shura-yi Milli`
- [ ] `دارالفنون` → `Dar al-Funun`

### Book titles

- [ ] `تاریخ بیداری ایرانیان` → `Tarikh-i Bidari-i Iraniyan`
- [ ] `سیاست‌نامه` → `Siyasat-nama`
- [ ] `سووشون` → `Suvashun`
- [ ] `چشم‌هایش` → `Chashmhayash`
- [ ] `زمستان` → `Zimistan`

### Morphology

- [ ] `کتاب‌ها` → `kitāb-hā`
- [ ] `خانه‌ات` → `khāna-at`
- [ ] `دیدگاه‌هایشان` → `dīdgāh-hā-yi-shān`

### Izafat

- [ ] `تاریخ ادبیات` → `tārīkh-i adabīyāt`
- [ ] `صدای باران` → `ṣidā-yi bārān`
- [ ] `دیوان حافظ` → `dīvān-i ḥāfiẓ`

### Ambiguity behavior

- [ ] `مهر` → `REVIEW_REQUIRED` (`mihr` / `muhr`)
- [ ] `گل` → `REVIEW_REQUIRED` (`gul` / `gil`)
- [ ] `شور` → `REVIEW_REQUIRED` (context-dependent reading)
- [ ] `روی` → `REVIEW_REQUIRED` (context-dependent reading)
- [ ] `شیر` → `FINAL: shīr` because relevant meanings collapse to the same IJMES output

## Runtime-gap acknowledgment

- [ ] I understand that the present engine cannot yet faithfully express the adjudicated PERSON/PLACE/INSTITUTION IJMES presentation policy because the runtime exposes only `ijmes_full` and `ijmes_title`.
- [ ] I approve fixing that runtime policy before treating Phase 4.6C as a product-quality benchmark result.
- [ ] I understand that fixing the runtime must not rewrite the gold corpus.

## Sign-off declaration

Leave blank until explicit approval.

**Human reviewer:**

**Role / basis of review:**

**Date:**

**Decision:** `APPROVE` / `REQUEST_CORRECTIONS`

**Notes:**

Upon `APPROVE`, promotion tooling may record the corpus as human-approved while retaining transparent provenance that the primary case-by-case adjudication was AI-specialist-assisted and then explicitly approved by the named human reviewer.
