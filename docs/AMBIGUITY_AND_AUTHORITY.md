# Ambiguity and authority

The deterministic engine is authoritative only for documented IJMES transformations. Lexical knowledge, context evidence, and human review decisions retain their own distinct provenance; neither confidence nor array order promotes a candidate to authority.

## Evidence Layers

The system maintains strict boundaries between four distinct categories of evidence:
```text
reviewed lexical knowledge
≠
automatic analysis
≠
assisted suggestion (zero automatic authority)
≠
human decision for this input
```

1. **`LEXICON_RESOLVED`**: Exactly one reviewed lexical reading supplied canonical input based on authoritative sources.
2. **`USER_OVERRIDE`**: A human reviewer explicitly resolved uncertainty (e.g. selected an ambiguous reading, confirmed/rejected an izāfat candidate, entered a validated manual transliteration, or accepted an advisory AI suggestion). Token metadata preserves both the automatic analysis and user provenance.
3. **`AMBIGUOUS`**: Two or more supported readings or analyses remain in competition; `canonicalTransliteration` is null and review is required.
4. **`UNRESOLVED`**: No reviewed reading or confirmed rule exists. Consonantal scaffolds provide diagnostic evidence only and are never inserted as final output.

Aggregate output uses unmistakable `⟦…: ambiguous⟧` or `⟦…: unresolved⟧` placeholders and sets `copyable` to false until all review blockers are resolved.

## Assisted Suggestions (Phase 3)

Assisted suggestions from external language models carry **zero automatic authority**. Fetching suggestions never changes token status, canonical output, or copyability. When a human explicitly accepts a suggestion, the resulting authority is recorded as `user-decision` (`USER_OVERRIDE`) with attached `assistance` provenance metadata.

## Review Decision Authority

Human decisions are explicit authority:
- A user decision is recorded under the `user-decision` authority category.
- Selecting a reading records `USER-LEXICAL-READING-SELECTION`.
- Manual entry records `USER-MANUAL-CANONICAL-OVERRIDE`.
- Confirming an izāfat records `USER-IZAFAT-ACCEPT`.
- Rejecting an izāfat records `USER-IZAFAT-REJECT`.
- Selecting morphology records `USER-MORPHOLOGY-SELECTION`.

A manual override is structural session evidence, not reusable scholarly validation. Overrides do not modify the static lexicon repository.
