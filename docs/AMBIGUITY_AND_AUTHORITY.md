# Ambiguity and authority

The deterministic engine is authoritative only for documented IJMES transformations. Lexical knowledge and context evidence retain their own provenance; neither confidence nor array order promotes a candidate to authority.

`LEXICON_RESOLVED` means exactly one reviewed lexical reading supplied canonical input. `AMBIGUOUS` means two or more supported readings remain in `alternatives`; `canonicalTransliteration` is null and review is required. `UNRESOLVED` likewise has no canonical transliteration. It may expose a Persian-column consonantal scaffold as diagnostic evidence, but that scaffold is never inserted as final IJMES output.

Aggregate output uses unmistakable `⟦…: ambiguous⟧` or `⟦…: unresolved⟧` placeholders and sets `copyable` to false. The UI disables final-output copying and shows alternatives, diagnostics, warnings, and applied rule IDs.

An unsupported combining mark is evidence, not disposable lookup noise. It is preserved with a normalized-token offset and does not count as a base letter, but Phase 2A does not interpret it. A token containing such evidence remains unresolved and non-copyable even when its mark-stripped lookup form matches a reviewed lexical entry.

Token certainty and relation certainty are independent. Two `LEXICON_RESOLVED` tokens may be connected by an `IZAFAT` relation with status `CANDIDATE`; the aggregate status then becomes `AMBIGUOUS`, output receives a relation-review marker, and copying is disabled. A confirmed final-kasra relation remains copyable. A confirmed heh-orthography relation is still non-copyable when its allomorphic rendering is outside current authoritative coverage.

Explicit lexical vowel evidence evaluates reviewed readings by structured source position. It never searches Latin output strings. Compatibility is tri-state:

- `MATCH`: metadata at the same base position supports the explicit vowel.
- `CONFLICT`: metadata at that position explicitly supports a different vowel.
- `UNKNOWN`: metadata at that position is absent or insufficient.

Exactly one `MATCH` may resolve only when every competitor is `CONFLICT`. Multiple matches, or a match plus any unknown competitor, remain ambiguous. No match with all conflicts is a true evidence conflict. No match with at least one unknown is unresolved because metadata is insufficient, but it is not labelled a conflict. Missing lexical vocalization metadata is absence of evidence, not evidence of conflict.

The current motivating title treats the `i/u` correction as IJMES-authoritative while retaining the joining/hyphenation of `درباره` and `تجددخواهی` as unresolved editorial choices.

A future assisted resolver may propose candidates and evidence, but deterministic validation and human review remain mandatory. No LLM dependency is present in Phase 1.
