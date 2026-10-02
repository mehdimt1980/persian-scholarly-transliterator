# IJMES rule model

Every provenance item has one authority category:

- **Chart**: IJMES Persian-column character mappings and distinct scholarly Unicode symbols.
- **Current guide**: Persian `i/u` rather than pronunciation-oriented `e/o`, izāfat rendering as `-i`, initial-hamza dropping, title diacritic policy, and English title capitalization.
- **Linguistic convention**: evidence that a specific grammatical relation, such as izāfat, exists at a position.
- **Lexical data**: reviewed word readings and alternatives.
- **Editorial**: choices not settled by IJMES, including compound joining or hyphenation.

Izāfat provenance is intentionally split. `PERSIAN-CONTEXT-IZAFAT-DETECTED` says context evidence identifies the relation; `IJMES-P-IZAFAT-RENDER` says the current guide renders that detected relation as `-i`.

Lexical entries provide lowercase canonical scholarly readings. They do not bake in title capitalization. A lexical reading is credited to `LEXICON-READING`; mapping rules are not falsely listed as producers of a lexicon-supplied result. Deterministic canonical and profile transformations are recorded only when applied.

The title policy implemented here removes `ā ī ū ḥ ṣ ṭ ẓ ż`, preserves `ʿ` and non-initial `ʾ`, capitalizes major words, and keeps the supported minor-word set (`va`, `dar`, `az`, `ba`, `bar`, `bi`, `ta`, `u`, `wa`, `al`) lowercase except at title boundaries. This is a small deterministic IJMES-compatible subset, not a complete Chicago title-case engine.

The repository stores concise summaries and references rather than reproducing source material. Any future chart/guide discrepancy must be documented explicitly.
