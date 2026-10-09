# Phase 8C annotation guide

## Workflow

1. Verify the Persian source and provenance independently of the evaluated model.
2. Mark the case `REVIEW_PENDING`; do not enter a scored reference until a qualified independent reviewer has completed it.
3. Record the primary scholarly canonical, every legitimate accepted alternative, token indexes/surfaces, and only the linguistic features actually reviewed.
4. Document izafat source/target indexes and `-i` versus `-yi`, morphological boundaries, proper-name conventions, IJMES considerations, and citations.
5. Annotate validator ground truth separately inside the reference, including layer-specific labels and independent reviewer/date/citation provenance. Use `null` for unknown labels; do not copy model warnings or self-assessments into truth.
6. Set `INDEPENDENTLY_REVIEWED` with reviewer identity/date. If reviewers disagree, set `ADJUDICATION_REQUIRED`, preserve the disagreement, and exclude the case.
7. After independent adjudication, set `ADJUDICATED`, record adjudicator identity/date and notes, and preserve accepted alternatives rather than forcing false unanimity.

The evaluated model's draft may be inspected only after the reference is frozen. A reference must never be copied from or established solely by that draft. Suspected issues on an unreviewed diagnostic belong in `diagnosticObservation`; they are questions, not labels.

## Token and feature scope

Token indexes must match the product request's authoritative indexes, including whitespace gaps. A token canonical is the reviewed lexical reading without silently absorbing neighboring tokens. Feature records use phrase, token, or relation scope and explicit token indexes. Annotate short/long vowels, consonants, izafat, suffixes, compounds, names, hamza, and ʿayn only where the reviewer can support a label.

## Error attribution

Use the versioned taxonomy in `types.ts`. Multiple categories may apply. Attribute canonical-reading errors to the model, presentation-only errors to the formatter, validator misses/false warnings to the validator, unresolved disagreements to `REFERENCE_DISPUTE`, and alignment/infrastructure failures separately. Do not classify an accepted alternate as an error.

The CSV worksheet is an interchange aid. Before importing annotations into JSON, a second person should check provenance, reviewer metadata, alternatives, token alignment, and citations.
