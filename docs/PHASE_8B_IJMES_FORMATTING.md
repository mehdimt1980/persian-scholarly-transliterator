# Phase 8B: IJMES publication-format alignment

Phase 8A deliberately keeps the existing `ijmes_citation_title` profile stable. The profile is a project-specific, fully diacritized citation-title view; it is not presently an IJMES publication-ready title renderer.

## Diagnostic fixture

Persian input: `صدای پای باران در کوچه های تهران`

Observed Phase 8A draft: `Ṣadā-yi Pā-yi Bārān Dar Kūchehā-yi Tihrān`

The following differences require a broader policy decision and are deferred rather than silently changing frozen scholarly behavior in PR #52:

1. **Persian short vowels.** The current IJMES Translation and Transliteration Guide says Persian uses `i` and `u`, not modern Iranian `e` and `o`. Phase 8B must validate AI proposals and reviewed lexical forms against that rule without guessing unwritten vowels.
2. **English title capitalization.** IJMES says articles, prefixes, coordinating conjunctions, and prepositions remain lowercase in transliterated titles. For this fixture, medial `dar` should therefore render lowercase in an IJMES-compliant title profile.
3. **Publication-title diacritics.** IJMES publication titles omit diacritical marks while retaining ʿayn and non-initial hamza. The current `ijmes_citation_title` profile intentionally preserves full diacritics; Phase 8B should add or select a distinct publication renderer instead of redefining this profile silently.

## Explicit expected outcomes for Phase 8B

- A strict IJMES publication-title rendering uses `i/u` short-vowel policy, lowercases medial `dar`, removes title diacritics, preserves ʿayn and non-initial hamza, and retains documented title-prefix behavior.
- The existing fully diacritized citation/technical rendering remains available under an honestly named project profile.
- Frozen Phase 7F/7G benchmarks and reviewed lexical authority are migrated only through an explicit, separately reviewed policy change.

Official source: [IJMES Translation and Transliteration Guide](https://www.cambridge.org/core/journals/international-journal-of-middle-east-studies/information/author-resources/ijmes-translation-and-transliteration-guide), especially General Transliteration Guidelines 4 and 7 and the detailed Persian `i/u` rule.
