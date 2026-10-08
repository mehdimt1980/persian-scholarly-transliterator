# Phase 8B: IJMES publication-format alignment

Phase 8A deliberately kept the existing `ijmes_citation_title` profile stable. It remains a project-specific, fully diacritized citation-title view. Phase 8B adds the separate `ijmes_publication_v1` presentation policy; it does not redefine the legacy profile.

## Diagnostic fixture

Persian input: `صدای پای باران در کوچه های تهران`

Observed Phase 8A draft: `Ṣadā-yi Pā-yi Bārān Dar Kūchehā-yi Tihrān`

The following differences motivated the additive Phase 8B policy rather than a change to frozen scholarly behavior in PR #52:

1. **Persian short vowels.** The current IJMES Translation and Transliteration Guide says Persian uses `i` and `u`, not modern Iranian `e` and `o`. Phase 8B reports conservative, token-level `e/o` diagnostics without guessing or rewriting unwritten vowels.
2. **English title capitalization.** The new publication renderer keeps its bounded minor words, including medial `dar`, lowercase and handles documented article/prefix structures.
3. **Publication-title diacritics.** `ijmes_publication_v1` removes ordinary letter diacritics while retaining ʿayn and hamza code points. `ijmes_citation_title` continues to preserve full diacritics.

## Explicit expected outcomes for Phase 8B

- A strict IJMES publication-title rendering uses `i/u` short-vowel policy, lowercases medial `dar`, removes title diacritics, preserves ʿayn and non-initial hamza, and retains documented title-prefix behavior.
- The existing fully diacritized citation/technical rendering remains available under an honestly named project profile.
- Frozen Phase 7F/7G benchmarks and reviewed lexical authority are migrated only through an explicit, separately reviewed policy change.

Official source: [IJMES Translation and Transliteration Guide](https://www.cambridge.org/core/journals/international-journal-of-middle-east-studies/information/author-resources/ijmes-translation-and-transliteration-guide), especially General Transliteration Guidelines 4 and 7 and the detailed Persian `i/u` rule.
