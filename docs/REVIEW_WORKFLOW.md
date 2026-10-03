# Human Review and Override Workflow (Phase 2C)

Phase 2C introduces a structured, provenance-preserving human review and override workflow. When automatic analysis encounters unresolved words, lexical ambiguities, unmarked grammatical relations, or competing morphological analyses, it generates deterministic `ReviewIssue`s that can be explicitly resolved by human scholarly decisions.

## 1. Core Principles

1. **Explicit Provenance Distinction:**
   ```text
   reviewed lexical knowledge
   ≠
   automatic analysis
   ≠
   human decision for this input
   ```
   A human override never mutates or silently rewrites the reusable scholarly lexicon, source orthography, or IJMES transliteration rules.

2. **Operational `USER_OVERRIDE` Status:**
   A token or relation whose reading depends on an explicit human decision receives the status `USER_OVERRIDE` (never masquerading as `LEXICON_RESOLVED`).
   The result preserves both the pre-review automatic analysis (`automaticStatus`, `automaticCanonical`) and the applied human decision.

3. **Session-Scoped Application:**
   Overrides apply only to the current transliteration session/input. They are not automatically promoted into reusable lexical records and do not require database persistence in Phase 2C.

4. **Input-Scoped Issue Identity:**
   Review issues are identified by deterministic, input-scoped IDs (e.g. `issue:token:0:کرم:LEXICAL_AMBIGUITY`, `issue:relation:0-2:IZAFAT_CANDIDATE`). If the input changes and shifts token positions, obsolete decisions are safely ignored and never attached to different words.

## 2. Review Issue Model

```ts
export type ReviewIssueType =
  | 'LEXICAL_AMBIGUITY'
  | 'UNKNOWN_TOKEN'
  | 'IZAFAT_CANDIDATE'
  | 'MORPHOLOGY_AMBIGUITY'
  | 'UNSUPPORTED_ALLOMORPH'
  | 'INSUFFICIENT_VOCALIZATION'
  | 'UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE';

export interface ReviewIssue {
  id: string;
  type: ReviewIssueType;
  tokenIndexes: number[];
  relationIndex?: number;
  morphologyIndex?: number;
  surface: string;
  description: string;
  alternatives: ReviewAlternative[];
  allowedActions: ReviewActionType[];
  evidenceSummary?: string;
  provenance?: RuleDefinition[];
}
```

## 3. Supported Decision Types

| Decision Action | Applicable Issue | Behavior | Result Status & Provenance |
| :--- | :--- | :--- | :--- |
| `SELECT_LEXICAL_READING` | `LEXICAL_AMBIGUITY` | Human selects one of the reviewed reading alternatives (e.g. `kirm` for `کرم`). | `USER_OVERRIDE` with rule `USER-LEXICAL-READING-SELECTION` |
| `MANUAL_CANONICAL_OVERRIDE` | `UNKNOWN_TOKEN`, `UNSUPPORTED_ALLOMORPH`, etc. | Human provides explicit manual canonical transliteration (e.g. `mashrūṭa-khvāhī`). | `USER_OVERRIDE` with rule `USER-MANUAL-CANONICAL-OVERRIDE` |
| `ACCEPT_IZAFAT` | `IZAFAT_CANDIDATE` | Confirms candidate izāfat relation. Authoritative IJMES `-i` rendering is then applied. | `USER_OVERRIDE` with rule `USER-IZAFAT-ACCEPT` + `IJMES-P-IZAFAT-RENDER` |
| `REJECT_IZAFAT` | `IZAFAT_CANDIDATE` | Rejects candidate izāfat relation; no `-i` is rendered. Rejection decision is retained in provenance. | Retained relation with rule `USER-IZAFAT-REJECT` |
| `SELECT_MORPHOLOGY` | `MORPHOLOGY_AMBIGUITY` | Resolves competition between `WHOLE_WORD` reading and `PRODUCTIVE_SEGMENTATION`. | `USER_OVERRIDE` with rule `USER-MORPHOLOGY-SELECTION` |

## 4. Structural Safety Validation for Manual Overrides

Manual canonical inputs are validated for structural safety without altering scholarly diacritics:
- **Rejected:** Empty values, whitespace-only, control characters, newlines, and Persian/Arabic script characters.
- **Preserved:** Full Unicode scholarly transliteration characters (`ā`, `ī`, `ū`, `ḥ`, `ṣ`, `ṭ`, `ẓ`, `ż`, `ʿ`, `ʾ`, `š`, `ž`, `č`, `ġ`, `ḍ`, etc.).
- **No silent rewriting:** Does not force ASCII or silently rewrite `e/o` to `i/u`.

## 5. Copyability Contract

Transliteration output is copyable (`copyable = true`) **only** when all blocking uncertainty has been resolved:
- If 2 review issues exist and 1 is resolved: `copyable = false`.
- If all issues are resolved: `copyable = true`.
- Undoing or clearing a decision returns the output to non-copyable status.
