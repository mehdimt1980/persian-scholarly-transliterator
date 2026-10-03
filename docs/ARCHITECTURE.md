# Architecture

The public `transliterate(input, profile)` pipeline is deliberately staged:

1. **Loss-aware normalization** returns original input, normalized input, and a change log. Meaningful heh forms and ZWNJ survive.
2. **Tokenization** preserves order, punctuation, whitespace, numbers, Latin text, Persian combining marks, ZWNJ, and offsets.
3. **Orthographic analysis** separates surface form from lexical lookup form while retaining explicit vowels, final-kasra/heh izāfat evidence, ZWNJ boundaries, evidenced segments, warnings, and provenance.
4. **Lexical resolution** filters reviewed candidates using structured vowel-position evidence. Zero compatible readings is an explicit conflict; one resolves; multiple remain ambiguous.
5. **Relation analysis** independently creates confirmed or candidate izāfat relations. Explicit source evidence outranks curated phrase evidence, which outranks conservative grammatical candidates.
6. **Canonical IJMES rendering** applies deterministic rules only to confirmed, supported relations and resolved lexical readings.
7. **Output profiles** format canonical output. Candidate or unsupported-allomorph relations add review markers and disable copying.

Diagnostic consonantal scaffolds are separate from `canonicalTransliteration`. Because a consonantal scaffold cannot safely synthesize the vowel in Persian `ة → ih`, it emits `[TM]` and attaches the guide rule as review evidence rather than pretending `h` is a final IJMES rendering. Ambiguous and unresolved tokens use explicit review placeholders, make the aggregate result non-copyable, and never become authoritative by array order.

The engine has no React/Next dependency. React displays token analyses and relations and enforces the domain’s `copyable` decision.
