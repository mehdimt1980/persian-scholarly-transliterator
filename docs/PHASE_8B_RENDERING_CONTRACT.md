# Phase 8B rendering contract

## Data boundaries

`scholarlyCanonical` is the established reading supplied to presentation. Rendering returns a new NFC string and never mutates or verifies that reading. `AI_DRAFT`, `HUMAN_ACCEPTED`, and independently reviewed scholarly authority remain distinct states.

Legacy engine profiles remain `ijmes_full` and `ijmes_citation_title`. The additive presentation policies are:

- `full_scholarly_v1`: preserves the canonical string.
- `ijmes_publication_v1`: requires an explicit content category and applies the implemented IJMES publication rules.
- `custom_scholarly_v1`: requires a bounded diacritic mode, capitalization mode, and category; unsupported combinations fail closed.

Supported categories are book/article title, personal name, place name, technical term, and general scholarly text. Ordinary letter diacritics are removed only where the publication policy calls for it. Independent ʿayn and hamza, punctuation, hyphens, and supplied morphology remain intact.

## Title policy

Rule `IJMES-TITLE-CAPS-01` implements bounded English title casing. The supported minor-word set is `al`, `az`, `ba`, `bar`, `bi`, `dar`, `fi`, `la`, `li`, `ta`, `u`, `va`, and `wa`. First and final minor words are capitalized except the structural Arabic article `al-`.

Rule `IJMES-PREFIXES-01` recognizes `al-`, `wa-`, `bi-`, `li-`, `la-` and contractions `wa-l-`, `bi-l-`, `li-l-`, `la-l-`. It capitalizes the lexical base, not the structural prefix. Structural suffixes `-i`, `-yi`, `-ha/-hā`, and the documented possessive forms remain lowercase. Other hyphenated segments are treated as lexical compounds and capitalized; no unknown morphology is inferred.

Authority: the official [IJMES Translation and Transliteration Guide](https://www.cambridge.org/core/journals/international-journal-of-middle-east-studies/information/author-resources/ijmes-translation-and-transliteration-guide), General Guidelines 2–7 and Detailed Guidelines. The renderer implements only the subset identified in `PHASE_8B_POLICY_AUDIT.md`.

## Identity contract

Reading identity V3 includes source text, explicit semantic context, deterministic canonical evidence, complete interpretation-relevant review evidence, morphology, relations, prompt version, provider, and model. It excludes the legacy engine profile, aggregate rendered output, and token rendered strings. V2 remains a read-only compatibility algorithm for decisions created before remediation. Rendering identity is the presentation profile plus its policy version and context. Therefore a rendering-only switch is local and makes zero AI calls; a source, evidence, or semantic-context change invalidates the reading.
