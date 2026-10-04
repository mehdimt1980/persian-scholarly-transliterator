# Phase 4.6B — Scholarly Adjudication Summary

## Status

**Current state:** `EXPERT_ADJUDICATED_PENDING_HUMAN_SIGNOFF`

This review was performed independently of the transliteration engine. No current engine output, lexicon hit, review suggestion, or coverage result was used to set gold truth.

The primary adjudicator is OpenAI GPT-5.6 Sol acting as a specialist reviewer under explicit evidence constraints. The artifact is therefore **not** `HUMAN_REVIEWED` yet. A human must explicitly approve the adjudicated corpus before gold promotion.

## Corpus

Frozen acquisition source:

`validation/acquisition/external-candidates.v1.json`

Total cases: **108**

- `FINAL`: **103**
- `REVIEW_REQUIRED`: **5**
- `UNRESOLVED`: **0**

Category composition is unchanged from the frozen acquisition corpus:

- TERM: 15
- RELIGIOUS_TERM: 10
- PERSON: 18
- PLACE: 12
- INSTITUTION: 6
- BOOK_TITLE: 12
- COMPOUND: 5
- MORPHOLOGY: 10
- IZAFAT: 8
- AMBIGUITY: 12

## Governing IJMES decisions

### Technical and scholarly terms

Technical terms are rendered with full IJMES diacritics unless the current IJMES Word List gives an explicit exception.

Two important Word List outcomes in the benchmark are:

- `زکات` → `zakat`
- `عاشورا` → `ʿAshuraʾ`

The benchmark deliberately treats the Word List as higher-level editorial authority when it supplies a prescribed form.

### Persian vowels and izafat

For Persian scholarly transliteration:

- Persian short `e` is represented as `i`.
- Persian short `o` is represented as `u`.
- Persian izafat is `-i`.
- explicit post-vocalic written linker `ی` may require `-yi`.

External Iranica romanizations are reading/identity evidence only; they are not copied mechanically into IJMES output.

### Personal names, place names, organizations

Current IJMES policy removes ordinary diacritics from personal names, place names, and organizations while retaining ʿayn/hamza where applicable, and allows established English spellings for prominent people/places.

This exposed a real runtime design gap:

- the runtime currently has only `ijmes_full` and `ijmes_title`;
- the frozen acquisition had PERSON/PLACE/INSTITUTION candidates marked `ijmes_full`;
- `ijmes_full` is not publication-correct for these IJMES categories.

All **36** PERSON/PLACE/INSTITUTION gold cases are therefore flagged `RUNTIME_PROFILE_GAP`.

This is not a reason to alter gold truth. The runtime must later be aligned to the policy before blind evaluation is interpreted as a product-quality result.

Representative accepted spellings include:

- `صادق هدایت` → `Sadeq Hedayat`
- `جلال آل‌احمد` → `Jalal Al-e Ahmad`
- `سیمین دانشور` → `Simin Daneshvar`
- `پروین اعتصامی` → `Parvin E'tesami`
- `سهراب سپهری` → `Sohrab Sepehri`
- `فروغ فرخزاد` → `Forugh Farrokhzad`
- `تخت جمشید` → `Persepolis`
- `پاسارگاد` → `Pasargadae`

## Book-title audit

Book titles use IJMES title presentation: no ordinary diacritics, preserve ʿayn/hamza, and apply English capitalization conventions while leaving structural minor elements appropriately lowercase.

Important independently re-audited cases:

- `تاریخ بیداری ایرانیان` → `Tarikh-i Bidari-i Iraniyan`
  - catalog transcription independently establishes `Tārīkh-i bīdārī-i Īrāniyān`.
- `سیاست‌نامه` → `Siyasat-nama`
  - `-nama` is treated as a structural suffix and remains lowercase.
- `سووشون` → `Suvashun`
  - distinguished from the English translation/publication title `Savushun`.
- `چشم‌هایش` → `Chashmhayash`
  - independent Iranica evidence gives `Čašmhāyaš`.
- `زمستان` → `Zimistan`
  - full Persian scholarly rendering supports `Zimistān`; title presentation removes the macron.

## Post-draft correction audit

A post-draft source audit found two corrections that are recorded in:

`validation/review/adjudication-amendments.v1.json`

They must be consolidated before human sign-off:

1. `نوسازی`: `nūsāzī` → **`nusāzī`**
   - scholarly bibliography attests `Nusāzī`; the first vowel is short `u`, not long `ū`.
2. `روشنفکری`: `rushanfikrī` → **`rawshanfikrī`**
   - Cambridge/Iranian Studies scholarship explicitly uses the stem `rawshanfikr`; this is not a simple Iranica e/o → IJMES i/u substitution.

No engine result caused either correction.

## Morphology

Morphology cases were adjudicated from cited grammar evidence and formal scholarly Persian rendering rather than current runtime support.

Representative cases:

- `کتاب‌ها` → `kitāb-hā`
- `نامه‌های` → `nāma-hā-i`
- `بزرگ‌ترین` → `buzurg-tarīn`
- `کتابم` → `kitāb-am`
- `خانه‌ات` → `khāna-at`
- `دیدگاه‌هایشان` → `dīdgāh-hā-yi-shān`

A runtime inability to derive one of these later counts as coverage behavior; it does not alter the adjudicated form.

## Izafat

All eight frozen IZAFAT cases have sufficient cited phrase/context evidence to be adjudicated `FINAL`.

Representative cases:

- `تاریخ ادبیات` → `tārīkh-i adabīyāt`
- `حقوق بشر` → `ḥuqūq-i bashar`
- `صدای باران` → `ṣidā-yi bārān`
- `دیوان حافظ` → `dīvān-i ḥāfiẓ`

## Ambiguity adjudication

The acquisition category `AMBIGUITY` does **not** automatically mean that the gold outcome is `REVIEW_REQUIRED`. The relevant question is whether distinct source readings remain distinct after IJMES rendering.

### Gold `REVIEW_REQUIRED`

Five cases retain genuine transliteration-level ambiguity:

- `مهر` — `mihr` / `muhr`
- `سر` — distinct contextual readings remain
- `گل` — `gul` / `gil`
- `شور` — materially distinct readings such as `shūr` vs consultation-related `showr/shawr`
- `روی` — distinct lexical readings remain

These must not be forced to one output without context.

### Gold `FINAL` despite lexical/semantic ambiguity

Seven cases have multiple meanings or grammatical uses but no material IJMES-output distinction for the relevant readings:

- `شیر` → `shīr`
- `باد` → `bād`
- `بار` → `bār`
- `داد` → `dād`
- `گوش` → `gūsh`
- `راست` → `rāst`
- `گاو` → `gāv`

This distinction is central to the benchmark: semantic polysemy alone is not a transliteration ambiguity.

## Remaining release-blocking policy work

Phase 4.6B does **not** change runtime behavior.

Before Phase 4.6C is treated as a product-quality evaluation, the following must be handled explicitly:

1. consolidate the two post-draft adjudication corrections;
2. record human approval of the adjudicated artifact;
3. solve the IJMES proper-name/place/organization rendering-policy gap without changing gold truth;
4. replace the legacy release-tier name `REAL_DISSERTATION` with an independent benchmark-appropriate name such as `EXTERNAL_BENCHMARK` or `INDEPENDENT_SCHOLARLY`;
5. keep all engine remediation until after the gold corpus is frozen.

## Freeze principle

After human sign-off and gold promotion, expected outputs may only change through an explicit scholarly corpus-correction process with recorded reason/evidence. Engine failures must never be repaired by rewriting gold truth.
