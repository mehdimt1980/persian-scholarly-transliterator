# IJMES rule model

Every provenance item has one authority category:

- **Chart**: IJMES Persian-column character mappings and distinct scholarly Unicode symbols.
- **Current guide**: Persian `i/u` rather than pronunciation-oriented `e/o`, Persian tāʾ marbūṭa as `ih`, izāfat rendering as `-i`, initial-hamza dropping, title diacritic policy, and English title capitalization.
- **Linguistic convention**: evidence that a specific grammatical relation, such as izāfat, exists at a position.
- **Lexical data**: reviewed word readings and alternatives.
- **Editorial**: choices not settled by IJMES, including compound joining or hyphenation.

Izāfat provenance is intentionally split. `PERSIAN-CONTEXT-IZAFAT-DETECTED` says context evidence identifies the relation; `IJMES-P-IZAFAT-RENDER` says the current guide renders that detected relation as `-i`.

Lexical entries provide lowercase canonical scholarly readings. They do not bake in title capitalization. A lexical reading is credited to `LEXICON-READING`; mapping rules are not falsely listed as producers of a lexicon-supplied result. Deterministic canonical and profile transformations are recorded only when applied.

The character chart and detailed guide have different jobs. `PERSIAN_CONSONANT_MAPPINGS` contains character-level consonantal evidence and does not claim `ة → h`. The detailed guide’s Persian vowel-bearing rule `ة → ih` lives in `PERSIAN_GUIDE_SPECIAL_RENDERINGS` with `IJMES-P-TA-MARBUTA-IH` provenance. For unresolved words, `[TM]` marks the character diagnostically because applying `ih` without lexical resolution would make the scaffold look final.

The title policy implemented here removes `ā ī ū ḥ ṣ ṭ ẓ ż`, preserves `ʿ` and non-initial `ʾ`, capitalizes major words, and keeps the supported minor-word set (`va`, `dar`, `az`, `ba`, `bar`, `bi`, `ta`, `u`, `wa`, `al`) lowercase except at title boundaries. Hyphenated `al-` remains lowercase even at a title boundary. Phase 1 also structurally supports `wa-`, `bi-`, `li-`, `la-` and the elided forms `wa-l-`, `bi-l-`, `li-l-`, `la-l-`; the lexical base after those prefixes is title-cased. Other hyphenated compounds title-case their major components and are not treated as articles. This is a small deterministic IJMES-compatible subset, not a complete Arabic morphology or Chicago title-case engine.

The repository stores concise summaries and references rather than reproducing source material. Any future chart/guide discrepancy must be documented explicitly.

## Phase 2A source evidence

The IJMES chart grounds explicit fatḥa → `a`, kasra → `i`, and ḍamma → `u`. These rules interpret marks that actually occur in the source; they never authorize reconstruction of omitted vowels. The current guide remains authoritative for rendering a confirmed Persian izāfat as `-i`. Identifying a relation from final kasra, heh orthography, curated data, or lexical categories is Persian linguistic analysis and is recorded separately from the IJMES rendering rule.
