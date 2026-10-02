# Architecture

The public `transliterate(input, profile)` pipeline is deliberately staged:

1. **Loss-aware normalization** returns original input, normalized input, and a change log. Safe Arabic/Persian yeh and kaf variants are canonicalized. `ۀ` and `ة` remain distinct and carry semantic metadata; ZWNJ is preserved.
2. **Tokenization** preserves order, punctuation, whitespace, numbers, Latin text, and offsets.
3. **Lexical resolution** supplies a canonical reading only when exactly one reviewed reading exists. Multiple readings produce `AMBIGUOUS`; no entry produces `UNRESOLVED`.
4. **Context detection** consumes structured lexical grammatical evidence. It can detect the seeded izāfat relation without checking lexical values in engine code.
5. **Canonical IJMES rendering** drops initial hamza, preserves non-initial `ʾ` and `ʿ`, and renders detected izāfat as `-i`.
6. **Output profiles** leave full scholarly output intact or deterministically remove title diacritics and apply the documented title-capitalization subset.

Diagnostic consonantal scaffolds are separate from `canonicalTransliteration`. Ambiguous and unresolved tokens use explicit review placeholders, make the aggregate result non-copyable, and never become authoritative by array order.

The engine has no React/Next dependency. React displays domain results and enforces the domain’s `copyable` decision.
