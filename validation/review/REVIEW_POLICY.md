# Phase 4.6B Scholarly Adjudication Policy

## Status

Phase 4.6B performs substantive scholarly adjudication of the frozen independent external acquisition corpus created in Phase 4.6A.

This stage is intentionally separated from engine evaluation. No adjudication decision may be changed merely because the current engine performs poorly on it.

## Reviewer truthfulness

Primary scholarly adjudication is performed by **OpenAI GPT-5.6 Sol** acting as a specialist reviewer under explicit evidence and authority constraints. Because the primary adjudicator is not a human being, these records MUST NOT be labeled `HUMAN_REVIEWED` solely on that basis.

The Phase 4.6B artifact therefore remains:

`EXPERT_ADJUDICATED_PENDING_HUMAN_SIGNOFF`

until a human reviewer explicitly signs off on the reviewed artifact. Human sign-off may rely on the recorded evidence, policy, notes, and spot-checks; it does not require repeating the entire acquisition process.

## Governing authorities

Rendering policy authority:

1. Current Cambridge IJMES Translation and Transliteration Guide.
2. Current IJMES Arabic/Persian transliteration chart.
3. Current IJMES Word List where applicable.

Reading / identity evidence may come from the verified Phase 4.6A acquisition sources, including Encyclopaedia Iranica, VIAF/ISNI/GeoNames, scholarly dictionaries, grammars, and catalog records.

**Important:** Encyclopaedia Iranica romanization is reading/identity evidence, not IJMES rendering authority. Persian IJMES requires `i/u`, not Iranica `e/o`.

## Decision classes

Each candidate receives one of:

- `FINAL` — evidence is sufficient to establish a single scholarly rendering.
- `REVIEW_REQUIRED` — the source string is genuinely ambiguous, context-dependent, or governed by competing accepted forms such that the input alone cannot safely support one authoritative output.
- `UNRESOLVED` — evidence is insufficient to establish a defensible reading/rendering.

`REVIEW_REQUIRED` and `UNRESOLVED` are valid scholarly outcomes and must never be converted to `FINAL` merely to improve coverage metrics.

## Rendering classes

### 1. `TECHNICAL_FULL`

Applies normally to:

- `TERM`
- `RELIGIOUS_TERM`
- `COMPOUND`
- `MORPHOLOGY`
- `IZAFAT`

Use full IJMES scholarly transliteration with diacritics. Persian short vowels use `i/u`, not Iranica `e/o`. Persian izāfat is `-i`.

### 2. `PROPER_NODIACRITIC`

Applies normally to:

- `PERSON`
- `PLACE`
- `INSTITUTION`

Current IJMES policy says personal names, place names, and organization names are written without diacritics, while preserving ʿayn and hamza (except initial hamza) and following normal capitalization. Accepted English spellings take precedence when clearly established under IJMES policy.

The current runtime only exposes `ijmes_full` and `ijmes_title`; therefore Phase 4.6B must not silently pretend that `ijmes_full` is publication-correct for proper names. Gold promotion must either map these cases to a correct no-diacritic rendering profile or introduce a dedicated category-aware/non-diacritic presentation policy before release evaluation.

### 3. `TITLE_NODIACRITIC`

Applies to:

- `BOOK_TITLE`
- future `ARTICLE_TITLE`

Use IJMES title presentation: remove diacritics other than ʿayn/hamza, preserve initial-hamza rule, and apply English capitalization conventions while leaving articles/conjunctions/prepositions appropriately lowercase.

### 4. `AMBIGUITY_BLOCKED`

Applies to genuinely ambiguous unvocalized forms where the source string alone supports multiple readings. Gold disposition should normally be `REVIEW_REQUIRED`, with documented allowed readings where evidence permits.

## Accepted-English policy

For prominent personal names and place names, current IJMES policy permits or requires accepted English spellings. An authority-file English label is evidence, but is not automatically treated as an IJMES-approved accepted spelling merely because it exists. The adjudication record must say when an accepted English spelling is used instead of mechanical IJMES transliteration.

## Evidence discipline

- Do not infer Persian spelling from Latin romanization.
- Do not infer an unattested reading solely from the current engine or lexicon.
- Do not treat topic relevance as reading evidence.
- Do not use the current engine output to decide gold truth.
- Do not change acquisition provenance during adjudication except to correct demonstrable source errors in a separate provenance correction.

## Freeze rule

Once an adjudicated case is signed off and promoted to the gold corpus, its expected scholarly outcome is frozen. Engine remediation happens after blind evaluation and must not rewrite gold truth to make tests pass.

## Release relationship

Phase 4.6B produces reviewed scholarly truth. Phase 4.6C performs the first blind engine evaluation against that truth. Only after Phase 4.6C may targeted remediation change lexicon/rules/coverage behavior.
