# Ambiguity and authority

The deterministic engine is authoritative only for documented IJMES transformations. Lexical knowledge and context evidence retain their own provenance; neither confidence nor array order promotes a candidate to authority.

`LEXICON_RESOLVED` means exactly one reviewed lexical reading supplied canonical input. `AMBIGUOUS` means two or more supported readings remain in `alternatives`; `canonicalTransliteration` is null and review is required. `UNRESOLVED` likewise has no canonical transliteration. It may expose a Persian-column consonantal scaffold as diagnostic evidence, but that scaffold is never inserted as final IJMES output.

Aggregate output uses unmistakable `⟦…: ambiguous⟧` or `⟦…: unresolved⟧` placeholders and sets `copyable` to false. The UI disables final-output copying and shows alternatives, diagnostics, warnings, and applied rule IDs.

The current motivating title treats the `i/u` correction as IJMES-authoritative while retaining the joining/hyphenation of `درباره` and `تجددخواهی` as unresolved editorial choices.

A future assisted resolver may propose candidates and evidence, but deterministic validation and human review remain mandatory. No LLM dependency is present in Phase 1.
