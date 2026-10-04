# Phase 4.6B — Human Sign-Off Checklist

> [!WARNING]
> **HUMAN GOVERNANCE SIGN-OFF PAUSED**
>
> Formal human governance sign-off on Phase 4.6B is currently **PAUSED**.
>
> During attempted human review, a material contract ambiguity was identified between **Scholarly Canonical Transliteration** (linguistic/scholarly reading truth preserving all diacritics) and **Publication Rendering** (style-dependent presentation such as proper-name diacritic removal, title capitalization, and IJMES Word List forms).
>
> Sign-off may resume only after:
> 1. The validation contract is formally updated (see `CANONICAL_RENDERING_CONTRACT.md`);
> 2. Affected benchmark cases are systematically re-audited to separate canonical gold from rendering gold;
> 3. The consolidated benchmark artifact is regenerated/updated;
> 4. A fresh representative human review is performed against the separated fields.
>
> All checklist items below remain unapproved drafts pending completion of the contract repair and re-audit.

## Purpose

This checklist is the final human approval layer over the specialist adjudication in:

- `validation/review/adjudication.v1.json`
- `validation/review/adjudication-amendments.v1.json`
- `validation/review/REVIEW_POLICY.md`
- `validation/review/REVIEW_SUMMARY.md`
- `validation/review/ADJUDICATION_AUDIT.md`

Primary case-by-case adjudication was performed by OpenAI GPT-5.6 Sol acting as a specialist reviewer. Human sign-off does **not** retroactively make the AI the human reviewer; provenance must continue to state both roles truthfully.

Do not sign until all recorded amendments have been consolidated into the final adjudication artifact and the checklist has been checked against that consolidated artifact.

## Policy assertions to approve

- [ ] I approve Cambridge IJMES as the rendering-policy authority for this benchmark.
- [ ] I approve the separation of reading/identity evidence (e.g. Iranica, dictionaries, authority files) from IJMES rendering authority.
- [ ] I approve Persian `i/u`, IJMES diphthong handling, consonant-final izafat `-i`, and post-vocalic/linker `-yi` as applied in this review.
- [ ] I approve IJMES Word List forms taking precedence where explicitly prescribed (e.g. `zakat`, `ʿAshuraʾ`).
- [ ] I approve no-diacritic presentation for personal names, place names, and organizations, with established English spellings used where appropriate.
- [ ] I approve IJMES no-diacritic title presentation with ʿayn/hamza retained and English capitalization conventions.
- [ ] I approve source-faithfulness: adjudication must transliterate the supplied Persian source string rather than silently substitute a different personal/place/title name.
- [ ] I approve `REVIEW_REQUIRED` as a correct gold outcome where the Persian surface alone cannot safely determine one reading.
- [ ] I confirm that gold truth must not be altered later merely to improve engine metrics.

## Representative case spot-checks

The purpose of these samples is to expose each major policy decision, not to conceal the full corpus behind a small subset.

### Technical terms

- [ ] `نوسازی` → `nawsāzī`
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
- [ ] `ملک‌الشعرای بهار` → `Malek al-Shoʿara Bahar`
- [ ] `جلال آل‌احمد` → `Jalal Al-e Ahmad`
- [ ] `پروین اعتصامی` → `Parvin E'tesami`
- [ ] `سهراب سپهری` → `Sohrab Sepehri`

### Places

- [ ] `آذربایجان` → `Azerbaijan`
- [ ] `تخت جمشید` → `Persepolis`
- [ ] `پاسارگاد` → `Pasargadae`

### Organizations

- [ ] `کتابخانه ملی ایران` → `Kitabkhana-yi Milli-yi Iran`
- [ ] `مجلس شورای ملی` → `Majlis-i Shura-yi Milli`
- [ ] `دارالفنون` → `Dar al-Funun`

### Book titles

- [ ] `تاریخ بیداری ایرانیان` → `Tarikh-i Bidari-yi Iraniyan`
- [ ] `سیاست‌نامه` → `Siyasat-nama`
- [ ] `سفرنامه ناصرخسرو` → `Safarnama-yi Nasir-i Khusraw`
- [ ] `سووشون` → `Suvashun`
- [ ] `چشم‌هایش` → `Chashmhayash`
- [ ] `زمستان` → `Zimistan`

### Morphology

- [ ] `کتاب‌ها` → `kitāb-hā`
- [ ] `نامه‌های` → `nāma-hā-yi`
- [ ] `خانه‌ات` → `khāna-at`
- [ ] `دیدگاه‌هایشان` → `dīdgāh-hā-yi-shān`
- [ ] `گزارش‌های` → `guzārish-hā-yi`

### Izafat

- [ ] `تاریخ ادبیات` → `tārīkh-i adabīyāt`
- [ ] `خانه پدری` → `khāna-yi pidarī`
- [ ] `صدای باران` → `ṣidā-yi bārān`
- [ ] `دیوان حافظ` → `dīvān-i ḥāfiẓ`

### Ambiguity behavior

- [ ] `مهر` → `REVIEW_REQUIRED` (`mihr` / `muhr`)
- [ ] `سر` → `REVIEW_REQUIRED` (`sar` / `sirr`)
- [ ] `گل` → `REVIEW_REQUIRED` (`gul` / `gil`)
- [ ] `شور` → `REVIEW_REQUIRED` (`shūr` / `shawr`)
- [ ] `روی` → `REVIEW_REQUIRED` (`rūy` / `ravī`)
- [ ] `شیر` → `FINAL: shīr` because the relevant readings collapse to the same material IJMES output

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
