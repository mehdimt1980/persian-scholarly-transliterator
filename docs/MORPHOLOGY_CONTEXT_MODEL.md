# Morphology and context model

## Three distinct forms

- **Surface form** is the preserved normalized token, including vowel marks and ZWNJ.
- **Lookup form** removes only explicitly recorded lookup noise such as supported vowel marks and converts preserved heh izāfat spelling to the reviewed lexical base.
- **Canonical transliteration** exists only after lexical resolution and deterministic IJMES transformations.

The original input remains available separately. Lookup normalization never erases evidence from `TokenAnalysis`.

## Explicit evidence

Fatḥa, kasra, and ḍamma are recorded with source offset, base-letter position, chart provenance, and `a/i/u` value. Reviewed lexical readings may carry matching structured vocalization metadata. Filtering has three outcomes: one candidate resolves, several remain ambiguous, and zero creates a visible evidence conflict. Missing vowels are never reconstructed.

Final kasra confirms an izāfat relation. Final `ۀ` or canonically equivalent heh-plus-mark orthography also confirms the relation, but Phase 2A does not guess a vowel-final `-yi` allomorph; rendering remains review-required. ZWNJ positions create evidenced segments without assigning suffix or compound semantics.

## Relations and precedence

Relations are separate from tokens and expose source/target indexes, `CONFIRMED` or `CANDIDATE` status, evidence, rendering support, warnings, and provenance.

Precedence is deterministic:

1. explicit source orthography;
2. reviewed curated relation evidence;
3. conservative grammatical candidate from resolved lexical categories;
4. no relation.

A grammatical candidate currently requires a resolved noun followed directly (apart from whitespace) by a resolved noun, adjective, or proper noun. Prepositions, conjunctions, punctuation, unsupported boundaries, and unresolved categories block candidates. This is project linguistic analysis requiring future scholarly citation, not an IJMES rule.

Confirmed standard izāfat invokes the authoritative `IJMES-P-IZAFAT-RENDER` rule and remains copyable. Candidates and confirmed-but-unsupported heh allomorphs make the aggregate result review-required and non-copyable.

## Limits

Phase 2A does not perform full parsing, infer omitted short vowels, classify ZWNJ suffixes, split compounds, or settle the editorial joining of `تجددخواهی`.
