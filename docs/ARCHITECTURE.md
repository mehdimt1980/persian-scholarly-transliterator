# Architecture

The public `transliterate(input, profile)` pipeline is deliberately staged:

1. **Loss-aware normalization** returns original input, normalized input, and a change log. Meaningful heh forms and ZWNJ survive.
2. **Tokenization** scans Unicode categories. Persian words contain Arabic-script letters plus following combining marks and internal ZWNJ; Arabic/Persian punctuation is always a separate structural token, and Persian digits remain number tokens. Offsets are explicitly normalized-source offsets.
3. **Orthographic analysis** separates normalized token surface from lexical lookup form while retaining explicit vowels, unsupported combining marks, final-kasra/heh izāfat evidence, ZWNJ boundaries, evidenced segments, warnings, and provenance. Only Arabic-script letters advance base-letter indexes; combining marks and ZWNJ never do.
4. **Lexical resolution** compares reviewed candidates using `MATCH`, `CONFLICT`, or `UNKNOWN`. Missing metadata is absence of evidence, not evidence of conflict. Resolution occurs only when exactly one reading matches and every competitor conflicts.
5. **Relation analysis** independently creates confirmed or candidate izāfat relations. Explicit source evidence outranks curated phrase evidence, which outranks conservative grammatical candidates.
6. **Canonical IJMES rendering** applies deterministic rules only to confirmed, supported relations and resolved lexical readings.
7. **Output profiles** format canonical output. Candidate or unsupported-allomorph relations add review markers and disable copying.

Diagnostic consonantal scaffolds are separate from `canonicalTransliteration`. Because a consonantal scaffold cannot safely synthesize the vowel in Persian `ة → ih`, it emits `[TM]` and attaches the guide rule as review evidence rather than pretending `h` is a final IJMES rendering. Ambiguous and unresolved tokens use explicit review placeholders, make the aggregate result non-copyable, and never become authoritative by array order.

The engine has no React/Next dependency. React displays token analyses and relations and enforces the domain’s `copyable` decision.

`originalInput` and `normalizedInput` are both retained. `Token.normalizedSurface`, `normalizedStart`, `normalizedEnd`, the public `TokenResult` fields of the same names, and the corresponding `TokenAnalysis` fields refer only to normalized input. Normalization can change code-point composition or length, so Phase 2A does not claim exact original-token spans; an original↔normalized alignment map remains a contained future improvement.
