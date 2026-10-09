# Phase 8C baseline report

> **FRAMEWORK VALIDATION — MOCKED/SYNTHETIC — NOT REAL MODEL ACCURACY**

## Authentic dataset composition and review coverage

The independent pilot has **2 authentic user-observed diagnostic cases**, both in `DEVELOPMENT_DIAGNOSTIC`, both `UNREVIEWED`, and both sourced from the Phase 8C specification. Independently reviewed references: **0/2**. Locked evaluation cases: **0**. Corpus SHA-256: `76ee6a1773570176ccf60d0be6d08bb9b8a1b44c5a1f0cb09ce098693aafc264`.

Because no independently reviewed reference exists, authentic canonical accuracy, token accuracy, linguistic-feature accuracy, publication accuracy, validator precision/recall, and correction burden are **NOT MEASURABLE**. No headline accuracy percentage is reported.

## Provider/model and live status

Live OpenAI evaluation: **NOT RUN**. No paid model request was authorized or made. Model, token usage, and cost are therefore unavailable.

## Offline framework validation

The committed report at `src/validation/reports/phase8c-offline-framework-summary.json` uses three visibly synthetic cases: two scored test oracles and one pending reference. Its 1/2 exact, 2/2 accepted-alternative, 4/4 conditional and end-to-end token results, feature checks, presentation checks, and independently reference-labeled validator matrices demonstrate evaluator branches only. Unreviewed exclusions and prediction failures are separate fields. They are not evidence about Persian accuracy, a model, a population, or scholarly quality. Wilson intervals are emitted to verify statistical behavior; the tiny artificial sample has no inferential meaning.

## Diagnostic case studies

- `صدای پای باران در کوچه های تهران`: historical draft `Ṣadā-yi Pā-yi Bārān Dar Kūchehā-yi Tihrān`. Open questions cover short vowels, capitalization, izafat, canonical correctness, publication rendering, and the Tehran convention.
- `صدای پای آب در بیشه‌زارهای تمنا`: historical draft `ṣidā-yi pā-yi āb dar bīshe-zār-hā-yi tamannā`. Open questions cover `صدا`, short vowels, compound/plural morphology, izafat, and policy-warning behavior.

Neither draft is gold and neither has a hardcoded correction.

## Error taxonomy and correction proxy

The framework supports the complete v1 taxonomy and separate validator matrices. Authentic taxonomy counts and correction burden are **NOT MEASURABLE**. The automatic distance proxy is explicitly not editing time or actual human effort.

## Recommendation

The next step is scholarly annotation, not resolver tuning: independently verify provenance and reference readings, adjudicate disagreement, then freeze a sufficiently diverse locked subset before any real-model baseline or engineering response.
