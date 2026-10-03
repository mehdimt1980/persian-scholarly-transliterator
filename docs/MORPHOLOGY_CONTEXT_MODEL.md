# Morphology and context model

Phase 2B inserts explicit morpheme analysis after orthographic analysis and before lexical and relation resolution. `TransliterationResult.morphology` exposes the proposed stem, typed segments, normalized spans, evidence, status, warnings, and provenance. Segmentation is never hidden inside `lookupForm`.

## Five distinct representations

- **Original input** is retained globally before NFC, character canonicalization, joiner conversion, or whitespace collapse.
- **Normalized input** is the complete string after the documented normalization stage.
- **Normalized token surface** is a token slice of normalized input, including retained vowel marks and ZWNJ.
- **Lookup form** removes combining marks only after supported and unsupported evidence has been recorded, and converts preserved heh izāfat spelling to the reviewed lexical base.
- **Canonical transliteration** exists only after lexical resolution and deterministic IJMES transformations.

`normalizedStart` and `normalizedEnd` index normalized input only. They are never presented as original-input offsets. Exact original-token span alignment is not implemented because NFC composition, variant conversion, ZWJ→ZWNJ, and whitespace collapse can change alignment. Lookup normalization never erases evidence from `TokenAnalysis`.

## Explicit evidence

Fatḥa, kasra, and ḍamma are recorded with `normalizedTokenOffset`, base-letter position, chart provenance, and `a/i/u` value. Reviewed readings may carry structured vocalization metadata. Compatibility is `MATCH`, `CONFLICT`, or `UNKNOWN`; missing metadata is absence of evidence, not conflict. One match resolves only if every competitor conflicts. A match plus an unknown remains review-required. All conflicts produce a true conflict; any unknown without a match produces an insufficient-metadata state. Missing vowels are never reconstructed.

Other Unicode combining marks, including shadda, are retained as `unsupportedCombiningMarks` with their normalized-token offset, preceding base-letter index, and provenance. They do not advance base-letter positions and are removed only from the lookup form after their evidence is captured. Phase 2A does not interpret their linguistic semantics, and their presence blocks authoritative lexical resolution instead of silently discarding them or allowing a reviewed lookup entry to appear conclusive.

## Token boundaries

Tokenization uses Unicode categories rather than the broad Arabic block. Arabic-script letters may be followed by combining marks and internal ZWNJ in a Persian word token. Arabic/Persian punctuation—including `،`, `؛`, and `؟`—is emitted as structural punctuation, Persian digits as numbers, and whitespace separately. Consequently punctuation closes relation adjacency while both surrounding words can still resolve normally.

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

The orthographic form `های` is analyzed as plural `ها` plus explicit izāfat evidence, not as an opaque lexical suffix. The relation source is the inflected token, so `کتاب‌های ایران` relates `[کتاب + PLURAL_HA]` to `ایران`. In contrast, `کتاب‌ها ایران` supplies no explicit izāfat yā and remains only the existing unmarked relation candidate.

## Limits

Phase 2B does not perform full parsing, infer omitted short vowels, classify arbitrary ZWNJ segments, split compounds, analyze verbs or prefixes, or settle the editorial joining of `تجددخواهی`.
