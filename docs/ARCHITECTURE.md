# Architecture

The public `transliterate(input, profile, reviewDecisions?, lexicon?)` pipeline is staged and deterministic:

1. **Loss-aware normalization** returns original input, normalized input, and a change log. Meaningful heh forms and ZWNJ survive.
2. **Tokenization** scans Unicode categories. Persian words contain Arabic-script letters plus following combining marks and internal ZWNJ; Arabic/Persian punctuation is always a separate structural token, and Persian digits remain number tokens. Offsets are explicitly normalized-source offsets.
3. **Orthographic analysis** separates normalized token surface from lexical lookup form while retaining explicit vowels, unsupported combining marks, final-kasra/heh izāfat evidence, ZWNJ boundaries, evidenced segments, warnings, and provenance. Only Arabic-script letters advance base-letter indexes; combining marks and ZWNJ never do.
4. **Morpheme analysis** evaluates data-defined suffix rules, validates proposed stems against the indexed `LexiconRepository`, category constraints, and host-ending applicability, and preserves ZWNJ as boundary evidence rather than automatic semantics.
5. **Lexical resolution** resolves either the whole token or the validated stem using indexed lookup and evidence compatibility (`MATCH`, `CONFLICT`, or `UNKNOWN`).
6. **Relation analysis** independently creates confirmed or candidate izāfat relations on bare or inflected hosts. Explicit source evidence outranks curated phrase evidence, which outranks conservative grammatical candidates.
7. **Review issue detection** identifies all blocking uncertainties (`LEXICAL_AMBIGUITY`, `UNKNOWN_TOKEN`, `IZAFAT_CANDIDATE`, `MORPHOLOGY_AMBIGUITY`, `UNSUPPORTED_ALLOMORPH`) and creates deterministic, input-scoped `ReviewIssue`s.
8. **Assisted candidate resolution (Phase 3)** optionally generates advisory suggestions via external language models behind zero-authority boundaries (`docs/ASSISTED_RESOLVER.md`). Suggestions are strictly validated, issue-type constrained, and require explicit human selection.
9. **Human review application** layers explicit `ReviewDecision`s over automatic analysis. Successful overrides assign `USER_OVERRIDE` status and attach distinct user-decision provenance rules (`USER-LEXICAL-READING-SELECTION`, `USER-MANUAL-CANONICAL-OVERRIDE`, `USER-IZAFAT-ACCEPT`, `USER-IZAFAT-REJECT`, `USER-MORPHOLOGY-SELECTION`).
10. **Canonical IJMES rendering** applies deterministic rules to confirmed morphology, relations, and lexical readings (including human-confirmed izāfat).
11. **Output profiles and copyability** format canonical output. Copying is allowed only when all blocking issues have been resolved.

12. **Batch bibliography processing (Phase 4)** extends single-record transliteration to structured CSV batches (`docs/BIBLIOGRAPHY_BATCH.md`):
    - Parses canonical records while preserving custom passthrough columns.
    - Applies field-level policies (`ijmes_title` for titles, `ijmes_full` for creators/places/publishers).
    - Detects Arabic/Persian script to pass Latin metadata through untouched.
    - Scopes review decisions and AI assistance strictly to `(recordId, fieldPath, issueId)`.
    - Computes deterministic record and batch readiness (`READY`, `REVIEW_REQUIRED`, `INVALID`).
    - Serializes authoritative metadata into source-preserving CSV, final scholarly CSV, RIS, and BibTeX (`docs/EXPORT_FORMATS.md`).

Diagnostic consonantal scaffolds are separate from `canonicalTransliteration`. Ambiguous and unresolved tokens use explicit review placeholders, make the aggregate result non-copyable, and never become authoritative by array order.

The domain engine remains 100% independent of React, Next.js, and external AI providers.
