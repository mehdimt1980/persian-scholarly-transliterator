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

**Important:** Encyclopaedia Iranica romanization is reading/identity evidence, not IJMES rendering authority. Persian IJMES uses the IJMES vowel/consonant system and must not be produced by mechanically copying Iranica's pronunciation-oriented `e/o` conventions.

## Decision classes

Each candidate receives one of:

- `FINAL` — evidence is sufficient to establish a single scholarly rendering.
- `REVIEW_REQUIRED` — the source string is genuinely ambiguous, context-dependent, or governed by competing accepted forms such that the input alone cannot safely support one authoritative output.
- `UNRESOLVED` — evidence is insufficient to establish a defensible reading/rendering.

`REVIEW_REQUIRED` and `UNRESOLVED` are valid scholarly outcomes and must never be converted to `FINAL` merely to improve coverage metrics.

## Scholarly Canonical Transliteration vs. Publication Rendering

During human governance review of Phase 4.6B, a key architectural distinction was formalized in `CANONICAL_RENDERING_CONTRACT.md`:

1. **Scholarly Canonical Transliteration:** The linguistically rigorous, source-faithful, diacritic-preserving representation that records the reading and morphological truth of the supplied Persian source string under the project's adopted scholarly transliteration scheme.
2. **Publication Rendering:** A deterministic, style-dependent presentation transformation applied to an established canonical reading under a named presentation policy (e.g. proper-name diacritic stripping, title capitalization, publisher-specific word list forms, or explicitly permitted established English spellings).

### Governance Rules for the Benchmark

- **This policy defines the relationship between canonical truth and rendering. It does not determine the exact scholarly canonical strings of the pending benchmark re-audit.**
- **Gold scholarly truth must be established independently of the runtime's current profile limitations.**
- **Rendering conventions must not be allowed to overwrite scholarly canonical truth.**
- Earlier Phase 4.6B draft adjudication sometimes used the field name `canonical` for publication-form outputs. The benchmark metadata and schemas will be updated in dedicated follow-up work to maintain clean separation between canonical gold and rendered gold.
- Formal human governance sign-off is paused until this contract separation is reflected in the benchmark data and audit ledgers. No provisional human feedback or illustrative example is gold truth until formal re-audit and approval.

## Rendering classes

### 1. `TECHNICAL_FULL`

Applies normally to:

- `TERM`
- `RELIGIOUS_TERM`
- `COMPOUND`
- `MORPHOLOGY`
- `IZAFAT`

Use full IJMES scholarly transliteration with diacritics.

Persian vowel/izafat policy used in this review:

- short modern Persian `e/o` are normally represented by IJMES `i/u` where that is the correct lexical reading;
- written Persian diphthongs must be handled as diphthongs rather than mechanically converted to short `i/u`; the current IJMES chart includes `aw/au` and `ay/ai`;
- consonant-final izafat is `-i`;
- post-vocalic izafat/linker is `-yi` where required, including explicit `های` after plural `-hā`.

The `-i` / `-yi` distinction is part of gold truth and must not be collapsed merely because the present runtime models some izafat paths differently.

### 2. `PROPER_NODIACRITIC`

Applies normally to:

- `PERSON`
- `PLACE`
- `INSTITUTION`

Current IJMES policy says personal names, place names, and organization names are written without ordinary diacritics, while preserving ʿayn and hamza (except initial hamza) and following normal capitalization. Accepted English spellings take precedence when clearly established under IJMES policy.

Gold output must remain source-faithful: an accepted English form may normalize the spelling of the **same name/entity expressed by the input**, but must not silently substitute a different personal name or title. For example, `ملک‌الشعرای بهار` cannot be adjudicated as `Mohammad-Taqi Bahar`, because that replaces the supplied epithet/name string rather than transliterating it.

The current runtime only exposes `ijmes_full` and `ijmes_title`; therefore Phase 4.6B must not silently pretend that `ijmes_full` is publication-correct for proper names. Gold promotion must either map these cases to a correct no-diacritic rendering profile or introduce a dedicated category-aware/non-diacritic presentation policy before release evaluation.

### 3. `TITLE_NODIACRITIC`

Applies to:

- `BOOK_TITLE`
- future `ARTICLE_TITLE`

Use IJMES title presentation: remove ordinary diacritics other than ʿayn/hamza, preserve the initial-hamza rule, and apply English capitalization conventions while leaving structural minor elements appropriately lowercase. Persian izafat/linker distinctions (`-i` vs post-vocalic `-yi`) remain meaningful even when ordinary diacritics are removed.

### 4. `AMBIGUITY_BLOCKED`

Applies to genuinely ambiguous unvocalized forms where the source string alone supports multiple readings. Gold disposition should normally be `REVIEW_REQUIRED`, with documented allowed readings where evidence permits.

Semantic polysemy does not by itself require blocking when all relevant senses collapse to the same material IJMES rendering.

## Accepted-English policy

For prominent personal names and place names, current IJMES policy permits or requires accepted English spellings. An authority-file English label is evidence, but is not automatically treated as an IJMES-approved accepted spelling merely because it exists. The adjudication record must say when an accepted English spelling is used instead of mechanical IJMES transliteration.

## Evidence discipline

- Do not infer Persian spelling from Latin romanization.
- Do not infer an unattested reading solely from the current engine or lexicon.
- Do not treat topic relevance as reading evidence.
- Do not use the current engine output to decide gold truth.
- Do not change acquisition provenance during adjudication except to correct demonstrable source errors in a separate provenance correction.
- Do not treat one external romanization system as a mechanical character-substitution source for IJMES.
- Do not alter the input's identity by substituting a different name/title even when it refers to the same person or work.

## Freeze rule

Once an adjudicated case is signed off and promoted to the gold corpus, its expected scholarly outcome is frozen. Engine remediation happens after blind evaluation and must not rewrite gold truth to make tests pass.

## Release relationship

Phase 4.6B produces reviewed scholarly truth. Phase 4.6C performs the first blind engine evaluation against that truth. Only after Phase 4.6C may targeted remediation change lexicon/rules/coverage behavior.
