# Phase 8F — AI readiness

A future resolver can consume `LexicalEvidenceIndex.search()` without knowing the provider. The returned candidate separates observed original script (`fieldProvenance` and `providerEvidence`), catalog romanization candidates (`observedLatinVariants`), parallel or otherwise undetermined titles, explicitly translated titles when independently supported, review state, conflicts, and insufficient evidence.

For authentic BSB record `991071006889707356`, `ادب فارسی` is an observed 880 original-script title, `Adab-i fārsī = Persian literature` is linked catalog title evidence, and 246 `Persian literature` is parallel-title provenance with an undetermined Latin classification—not a confirmed translation. None is a reviewed scholarly reading. Record `991144600686807356` similarly supplies title and organization evidence with exact MARC provenance.

Safe future integration should pass only structured, length-bounded evidence fields to an AI request, mark unreviewed observations explicitly, require citations in any proposed reading, and keep the external scholarly-review boundary. Arbitrary catalog strings must never become prompt instructions. This phase makes no LLM calls, changes no inference path, and claims no accuracy gain.
