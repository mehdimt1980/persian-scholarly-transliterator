# Persian Scholarly Transliterator

A provenance-aware scholarly Persian transliteration system, initially targeting IJMES. The project separates **scholarly canonical transliteration** from **publication/profile rendering**, preserves uncertainty instead of guessing, and supports source-preserving bibliography workflows and scholarly exports (CSV, RIS, BibTeX).

This is not an official IJMES or Cambridge product. It is not a general pronunciation engine or a character-substitution transliterator. Persian short vowels are normally unwritten, so unknown and genuinely ambiguous words remain review items rather than being silently promoted to authoritative output.

## v0.2.0 milestone

Version `0.2.0` establishes the governed Validation V2 and reviewed-authority release baseline:

- Canonical scholarly transliteration and publication rendering are explicit, independently validated dimensions.
- A 108-case independently acquired external benchmark was blindly re-audited under the V2 contract: **103 FINAL + 5 REVIEW_REQUIRED + 0 UNRESOLVED**.
- Case-level primary review provenance remains truthful: OpenAI GPT-5.6 Sol / `AI_SPECIALIST`; a separate human governance review approved the benchmark for gold freeze.
- The frozen benchmark is bound to exact Git blob `be46b312e2cb82cc4ec0f95ed1c019f8f5e27162` and promoted gold version `2.0.0`.
- The independent pre-remediation Phase 4.6C baseline is preserved historically and is not rewritten after runtime remediation.
- After reviewed-authority promotion, the same 108 cases are used as a **frozen regression suite**, not described as an unseen post-remediation accuracy benchmark.
- The hard regression gate requires **103/103 authoritative exact matches + 5/5 safely blocked review-required cases**, with `FALSE_AUTHORITATIVE = 0` and `UNDER_BLOCKED = 0`.
- A separate 13-case portability / anti-overreach gate has zero exact-key overlap with frozen reviewed authority and verifies compositional behavior plus fail-closed near-miss behavior. It is a narrow portability check, not a broad scholarly generalization benchmark.
- Release CI permanently blocks high/critical dependency advisories with `npm audit --audit-level=high`.

See `docs/RELEASE_v0.2.0.md` for the release evidence and claim boundaries.

## Current scope

Implemented:
- Loss-aware Unicode normalization.
- Unicode-category tokenization.
- Orthographic evidence and combining-mark preservation.
- Scalable, indexed **reviewed scholarly lexicon repository** with stable IDs, source citations, and proper-name metadata (`docs/LEXICON_MODEL.md`).
- Stem-first morphology for plural `ها`, comparative `تر`, superlative `ترین`, six post-consonantal possessive-enclitic realizations, and plural-host `های` izāfat evidence.
- Context relation analysis (confirmed and candidate izāfat).
- Explicit Validation V2 canonical/rendering separation and frozen scholarly-gold governance.
- Deterministic reviewed-authority lookup with exact normalized Persian + exact-profile matching only; no fuzzy, substring, prefix, edit-distance, or semantic matching.
- **Human review / override workflow** (`docs/REVIEW_WORKFLOW.md`) supporting lexical reading selection, safe manual overrides, izāfat decisions, and morphology branch selection with `USER_OVERRIDE` provenance.
- **Human-gated assisted candidate resolver** (`docs/ASSISTED_RESOLVER.md`) providing advisory language-model suggestions for unresolved issues behind strict zero-authority boundaries and human selection.
- **Batch bibliography processing & scholarly exports** (`docs/BIBLIOGRAPHY_BATCH.md`, `docs/EXPORT_FORMATS.md`):
  - RFC-4180 CSV import with unknown column passthrough.
  - Field-level Persian script detection and IJMES policy assignment.
  - Field-scoped review decisions and assisted suggestion integration.
  - Deterministic record and batch readiness evaluation.
  - Source-preserving CSV export.
  - Final scholarly CSV export with `STRICT_ALL` and `READY_ONLY` export modes.
  - Scholarly UTF-8 RIS export (Zotero/EndNote compatible) with CRLF endings and newline sanitization.
  - Scholarly BibTeX export with deterministic citation keys, author formatting, and structural character escaping.
- Interactive Next.js Single and Batch Workspaces.

Arabic/Persian punctuation is structural punctuation, not word material merely because its code point lies inside the Arabic Unicode block. The result retains the original input globally; public token fields are deliberately named `normalizedSurface`, `normalizedStart`, and `normalizedEnd`. They describe normalized input and do not claim original-input spans.

## Run and verify

```bash
npm ci
npm audit --audit-level=high
npm test
npm run validate:v2-regression
npm run validate:portability
npm run validate:corpus
npm run typecheck
npm run lint
npm run build
```

The full CI suite additionally validates acquisition provenance, historical adjudication integrity, the V2 re-audit worklist, consolidated benchmark reproducibility, gold freeze integrity, and the preserved Phase 4.6C evaluation path.

The framework-independent engine is in `src/domain`. See `docs/BIBLIOGRAPHY_BATCH.md`, `docs/EXPORT_FORMATS.md`, `docs/ASSISTED_RESOLVER.md`, `docs/REVIEW_WORKFLOW.md`, `docs/LEXICON_MODEL.md`, and `validation/review/CI_SCOPE.md` for architecture and verification details.
