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

### Persian vowels, diphthongs, and izafat

For Persian scholarly transliteration:

- Persian short `e` is generally represented as `i`.
- Persian short `o` is generally represented as `u`.
- written diphthongs must not be collapsed mechanically into those short vowels; the current IJMES chart includes `aw/au` and `ay/ai`.
- consonant-final Persian izafat is `-i`.
- post-vocalic izafat/linker is represented as `-yi` where required, including explicit `های` sequences after plural `-hā`.

External Iranica romanizations are reading/identity evidence only; they are not copied mechanically into IJMES output.

### Personal names, place names, organizations

Current IJMES policy removes ordinary diacritics from personal names, place names, and organizations while retaining ʿayn/hamza where applicable, and permits established English spellings for prominent people/places.

This exposed a real runtime design gap:

- the runtime currently has only `ijmes_full` and `ijmes_title`;
- the frozen acquisition had PERSON/PLACE/INSTITUTION candidates marked `ijmes_full`;
- `ijmes_full` is not publication-correct for these IJMES categories.

All **36** PERSON/PLACE/INSTITUTION gold cases are therefore flagged `RUNTIME_PROFILE_GAP`.

This is not a reason to alter gold truth. The runtime must later be aligned to the policy before blind evaluation is interpreted as a product-quality result.

Representative accepted spellings include:

- `صادق هدایت` → `Sadeq Hedayat`
- `ملک‌الشعرای بهار` → `Malek al-Shoʿara Bahar`
- `جلال آل‌احمد` → `Jalal Al-e Ahmad`
- `سیمین دانشور` → `Simin Daneshvar`
- `پروین اعتصامی` → `Parvin E'tesami`
- `سهراب سپهری` → `Sohrab Sepehri`
- `فروغ فرخزاد` → `Forugh Farrokhzad`
- `تخت جمشید` → `Persepolis`
- `پاسارگاد` → `Pasargadae`

The Bahar case is intentionally source-faithful: the input `ملک‌الشعرای بهار` must not be replaced by the person's different personal name `محمدتقی بهار`.

## Book-title audit

Book titles use IJMES title presentation: no ordinary diacritics, preserve ʿayn/hamza, and apply English capitalization conventions while leaving structural minor elements appropriately lowercase.

Important independently re-audited cases:

- `تاریخ بیداری ایرانیان` → `Tarikh-i Bidari-yi Iraniyan`
  - `Bīdārī` is vowel-final, so its following izafat is post-vocalic `-yi`.
- `سیاست‌نامه` → `Siyasat-nama`
  - `-nama` is treated as a structural suffix and remains lowercase.
- `سفرنامه ناصرخسرو` → `Safarnama-yi Nasir-i Khusraw`
  - vowel-final `Safarnāma` takes post-vocalic `-yi`.
- `سووشون` → `Suvashun`
  - distinguished from the English translation/publication title `Savushun`.
- `چشم‌هایش` → `Chashmhayash`
  - independent Iranica evidence gives `Čašmhāyaš`.
- `زمستان` → `Zimistan`
  - full Persian scholarly rendering supports `Zimistān`; title presentation removes the macron.

## Post-draft correction audit

The second scholarly audit is recorded in:

`validation/review/adjudication-amendments.v1.json`

It now contains corrections that must be consolidated into the primary adjudication artifact before human sign-off. Principal corrections include:

- `نوسازی`: `nūsāzī` → **`nawsāzī`**
- `روشنفکری`: `rushanfikrī` → **`rawshanfikrī`**
- `ملک‌الشعرای بهار`: `Mohammad-Taqi Bahar` → **`Malek al-Shoʿara Bahar`**
- `کتابخانه ملی ایران`: `Kitabkhana-i Milli-i Iran` → **`Kitabkhana-yi Milli-yi Iran`**
- `تاریخ بیداری ایرانیان`: `Tarikh-i Bidari-i Iraniyan` → **`Tarikh-i Bidari-yi Iraniyan`**
- `سفرنامه ناصرخسرو`: `Safarnama-i Nasir-i Khusraw` → **`Safarnama-yi Nasir-i Khusraw`**
- `نامه‌های`: `nāma-hā-i` → **`nāma-hā-yi`**
- `گزارش‌های`: `guzārish-hā-i` → **`guzārish-hā-yi`**
- `خانه پدری`: `khāna-i pidarī` → **`khāna-yi pidarī`**

No engine result caused these corrections.

## Morphology

Morphology cases were adjudicated from cited grammar evidence and formal scholarly Persian rendering rather than current runtime support.

Representative cases after the second audit:

- `کتاب‌ها` → `kitāb-hā`
- `نامه‌های` → `nāma-hā-yi`
- `بزرگ‌ترین` → `buzurg-tarīn`
- `کتابم` → `kitāb-am`
- `خانه‌ات` → `khāna-at`
- `دیدگاه‌هایشان` → `dīdgāh-hā-yi-shān`
- `گزارش‌های` → `guzārish-hā-yi`

A runtime inability to derive one of these later counts as coverage behavior; it does not alter the adjudicated form.

## Izafat

All eight frozen IZAFAT cases have sufficient cited phrase/context evidence to be adjudicated `FINAL`.

Representative cases:

- `تاریخ ادبیات` → `tārīkh-i adabīyāt`
- `حقوق بشر` → `ḥuqūq-i bashar`
- `خانه پدری` → `khāna-yi pidarī`
- `صدای باران` → `ṣidā-yi bārān`
- `دیوان حافظ` → `dīvān-i ḥāfiẓ`

The review now explicitly distinguishes consonant-final `-i` from post-vocalic `-yi`.

## Ambiguity adjudication

The acquisition category `AMBIGUITY` does **not** automatically mean that the gold outcome is `REVIEW_REQUIRED`. The relevant question is whether distinct source readings remain distinct after IJMES rendering.

### Gold `REVIEW_REQUIRED`

Five cases retain genuine transliteration-level ambiguity:

- `مهر` — `mihr` / `muhr`
- `سر` — `sar` / `sirr`
- `گل` — `gul` / `gil`
- `شور` — `shūr` / `shawr`
- `روی` — `rūy` / `ravī`

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

## Remaining work before gold freeze

Phase 4.6B does **not** change runtime behavior.

Before gold promotion:

1. consolidate all adjudication amendments into `adjudication.v1.json`;
2. ensure the review summary and human sign-off sheet match the consolidated artifact exactly;
3. obtain explicit human approval of the completed adjudication;
4. build/validate promotion mechanics without evaluating the current engine against the benchmark;
5. preserve the 36 proper-name/place/institution `RUNTIME_PROFILE_GAP` cases as gold truth rather than hiding them.

After gold freeze, but before interpreting Phase 4.6C as a product-quality evaluation:

- solve the IJMES proper-name/place/organization rendering-policy gap without changing gold truth;
- replace the legacy release-tier name `REAL_DISSERTATION` with an independent benchmark-appropriate name such as `EXTERNAL_BENCHMARK` or `INDEPENDENT_SCHOLARLY`;
- keep engine/lexicon remediation downstream of the first blind comparison.

## Freeze principle

After human sign-off and gold promotion, expected outputs may only change through an explicit scholarly corpus-correction process with recorded reason/evidence. Engine failures must never be repaired by rewriting gold truth.
