# Phase 4.6B — Final Expert Scholarly Review Verdict

## Reviewer

Primary specialist adjudication: **OpenAI GPT-5.6 Sol**

Review date: **2026-10-04**

Status: **EXPERT_ADJUDICATION_COMPLETE — PENDING HUMAN GOVERNANCE SIGN-OFF**

This is not labeled `HUMAN_REVIEWED`: the case-by-case specialist review was performed by an AI specialist under explicit evidence constraints. A human repository owner/reviewer may later approve the reviewed corpus as a governance/sign-off act without pretending to have performed the original case-by-case adjudication.

## Review basis

The review was conducted independently of current transliteration-engine output.

Rendering authority:

1. Current Cambridge IJMES Translation and Transliteration Guide.
2. IJMES Transliteration Chart.
3. IJMES Word List where it prescribes a specific form.

Reading/identity evidence:

- frozen, provenance-verified Phase 4.6A acquisition records;
- scholarly dictionaries and grammars recorded there;
- Encyclopaedia Iranica only as reading/identity/bibliographic evidence, never as IJMES rendering authority;
- verified authority records for people/places/institutions.

## Final disposition summary

Total candidates: **108**

- `FINAL`: **103**
- `REVIEW_REQUIRED`: **5**
- `UNRESOLVED`: **0**

The absence of `UNRESOLVED` cases is not the result of forcing coverage. Phase 4.6A deliberately retained candidates with sufficient external evidence for adjudication. Five surfaces remain genuinely context-dependent at transliteration level and are intentionally blocked.

## Final genuinely ambiguous cases

The following are gold `REVIEW_REQUIRED`:

- `مهر` — `mihr` / `muhr`
- `سر` — `sar` / `sirr`
- `گل` — `gul` / `gil`
- `شور` — `shūr` / `shawr`
- `روی` — `rūy` / `ravī`

No single reading may be made authoritative from the isolated Persian surface.

## Acquisition-ambiguity cases that are nevertheless FINAL

These have multiple meanings/uses but no material IJMES transliteration distinction for the reviewed readings:

- `شیر` → `shīr`
- `باد` → `bād`
- `بار` → `bār`
- `داد` → `dād`
- `گوش` → `gūsh`
- `راست` → `rāst`
- `گاو` → `gāv`

Semantic polysemy is not by itself transliteration ambiguity.

## Final policy findings

### Technical terms

Technical terms remain fully transliterated with IJMES diacritics unless an explicit Word List exception controls.

The final review explicitly distinguishes Persian `i/u` from Iranica `e/o`, while also preserving genuine IJMES diphthongs rather than mechanically mapping every modern `o/e` sound to `u/i`.

Examples:

- `نوسازی` → `nawsāzī`
- `روشنفکری` → `rawshanfikrī`
- `کارگزاری` → `kārguzārī`
- `مشروطه‌خواهی` → `mashrūṭih-khwāhī`

### IJMES Word List overrides

- `زکات` → `zakat`
- `عاشورا` → `ʿAshuraʾ`

These are editorially prescribed forms and therefore override an otherwise mechanically full-diacritic output.

### Personal names, places, organizations

Current IJMES policy requires no ordinary diacritics for these categories, while retaining ʿayn/hamza where applicable and using established English spellings where the guide calls for them.

This exposes **36 runtime-profile-gap cases** because the current product has only `ijmes_full` and `ijmes_title`.

Representative gold forms:

- `صادق هدایت` → `Sadeq Hedayat`
- `ملک‌الشعرای بهار` → `Malek al-Shoʿara Bahar`
- `جلال آل‌احمد` → `Jalal Al-e Ahmad`
- `تخت جمشید` → `Persepolis`
- `پاسارگاد` → `Pasargadae`
- `کتابخانه ملی ایران` → `Kitabkhana-yi Milli-yi Iran`

The runtime must later adapt to gold policy; gold policy must not be weakened to match the current runtime.

### Titles

Book titles use IJMES no-diacritic title presentation with ʿayn/hamza retained and English capitalization conventions.

Representative final forms:

- `تاریخ بیداری ایرانیان` → `Tarikh-i Bidari-yi Iraniyan`
- `سیاست‌نامه` → `Siyasat-nama`
- `سفرنامه ناصرخسرو` → `Safarnama-yi Nasir-i Khusraw`
- `سووشون` → `Suvashun`
- `چشم‌هایش` → `Chashmhayash`
- `زمستان` → `Zimistan`

### Morphology and izafat

The review distinguishes consonant-final `-i` from post-vocalic/linker `-yi` when the written Persian structure requires the yā linker.

Representative final forms:

- `کتاب‌ها` → `kitāb-hā`
- `نامه‌های` → `nāma-hā-yi`
- `دیدگاه‌هایشان` → `dīdgāh-hā-yi-shān`
- `گزارش‌های` → `guzārish-hā-yi`
- `خانه پدری` → `khāna-yi pidarī`
- `صدای باران` → `ṣidā-yi bārān`

## Source-faithfulness rule

Gold output transliterates the supplied source string. It does not silently replace it with a different name or label referring to the same entity.

For example:

`ملک‌الشعرای بهار` must not be silently replaced with `محمدتقی بهار` merely because both refer to the same person.

## Effective machine-readable adjudication

The effective scholarly truth is now consolidated in one primary artifact:

`validation/review/adjudication.v1.json`

Current version:

`1.0.2-draft`

The file:

`validation/review/adjudication-amendments.v1.json`

is retained only as the historical correction ledger. Its corrections have already been consolidated into the primary artifact and the validation CLI verifies that every historical `to` value is present.

The consolidated artifact still deliberately records:

- `status = EXPERT_ADJUDICATED_PENDING_HUMAN_SIGNOFF`
- `humanSignoff = null`
- `engineEvaluationPerformed = false`

so no governance state is fabricated.

## Engine-blindness declaration

The current transliteration engine has not been used to decide any expected output in this review.

No case was changed because the engine would pass or fail it.

The first engine comparison belongs to Phase 4.6C after gold freeze.

## Expert verdict

**SCHOLARLY ADJUDICATION COMPLETE AND CONSOLIDATED.**

The 108-case corpus is ready for validation and human governance sign-off. It is not yet `HUMAN_REVIEWED`, not yet gold-frozen, and must not yet be used to tune the engine.
