# v0.2.0 — Governed Validation V2 & Reviewed Authority

Release date: 2026-10-05

`v0.2.0` is the first release built around the repository's separated Validation V2 contract, governed scholarly benchmark, frozen-gold lifecycle, measured pre-remediation baseline, deterministic reviewed-authority remediation, anti-overreach evidence, and permanent dependency-security gate.

This project is not an official IJMES or Cambridge product.

## Highlights

### 1. Scholarly canonical vs publication rendering

The validation model now treats these as separate dimensions:

1. **Scholarly canonical transliteration** — source-faithful reading, full relevant diacritics, morphology, and izāfat/linker structure.
2. **Publication/profile rendering** — profile-specific presentation such as IJMES Word List forms, ordinary-diacritic removal where policy requires it, capitalization, or established English proper-name/place rendering.

A rendering rule may transform presentation; it does not silently redefine scholarly canonical truth.

### 2. Blind 108-case V2 scholarly re-audit

The independently acquired benchmark was re-audited without using engine output or historical V1 answers as first-pass evidence.

Final scholarly review state:

- total: **108**
- `FINAL`: **103**
- `REVIEW_REQUIRED`: **5**
- `UNRESOLVED`: **0**

The five genuinely ambiguous unvocalized forms remain deliberately non-authoritative:

- مهر — `mihr` / `muhr`
- سر — `sar` / `sirr`
- گل — `gul` / `gil`
- شور — `shūr` / `shawr`
- روی — `rūy` / `ravī`

Case-level primary review provenance remains **OpenAI GPT-5.6 Sol / `AI_SPECIALIST`**. The subsequent human governance decision approved the benchmark for freeze without retroactively representing the 108 case decisions as human case-by-case adjudication.

### 3. Human governance approval and immutable frozen gold

Human governance decision: **APPROVE**.

Frozen benchmark:

- artifact: `validation/corpus/phase4.6b-external-benchmark.v2.json`
- promoted gold version: `2.0.0`
- exact frozen Git blob: `be46b312e2cb82cc4ec0f95ed1c019f8f5e27162`

The frozen scholarly payload is immutable for runtime remediation.

### 4. Independent pre-remediation Phase 4.6C baseline

The engine was measured against frozen gold **before** benchmark-derived reviewed authority was introduced.

Historical baseline:

| Classification | Count |
|---|---:|
| `CORRECT_AUTHORITATIVE` | 5 |
| `FALSE_AUTHORITATIVE` | 0 |
| `CORRECT_REVIEW_REQUIRED` | 0 |
| `OVER_BLOCKED` | 98 |
| `UNDER_BLOCKED` | 0 |
| `ISSUE_TYPE_MISMATCH` | 5 |
| `INVALID_GOLD_CASE` | 0 |

Interpretation: the primary pre-remediation weakness was coverage / generic `UNKNOWN_TOKEN`, not false scholarly authority.

This baseline remains preserved as historical evidence and is not rewritten after remediation.

### 5. Deterministic reviewed-authority remediation

After the independent baseline, the human-approved reviewed decisions were promoted into a narrow deterministic runtime authority layer.

Authority boundary:

- exact normalized Persian input;
- exact profile;
- no fuzzy matching;
- no substring or prefix matching;
- no edit-distance matching;
- no semantic matching;
- five ambiguity cases remain non-copyable `LEXICAL_AMBIGUITY` results;
- misses continue through the previous fail-closed compositional pipeline;
- established morphology/izāfat paths are preserved rather than replaced when they already provide the intended structural evidence.

After this promotion, the 108-case artifact is explicitly a **regression suite**, not an unseen post-remediation accuracy benchmark.

Hard frozen regression result:

- **103 / 103** authoritative exact matches;
- **5 / 5** review-required cases correctly blocked;
- `FALSE_AUTHORITATIVE = 0`;
- `OVER_BLOCKED = 0`;
- `UNDER_BLOCKED = 0`;
- `ISSUE_TYPE_MISMATCH = 0`;
- `INVALID_GOLD_CASE = 0`.

### 6. Authority-independent portability / anti-overreach gate

A separate release gate uses **13 cases with zero exact-key overlap with frozen reviewed authority**:

- 8 compositional positive cases;
- 5 fail-closed negative / near-miss cases;
- frozen-authority overlap: **0**.

This verifies a narrower property: reviewed authority does not leak into nearby or wrong-profile inputs, while core compositional behavior continues to work outside the promoted exact lookup set.

It is **not** presented as a broad unseen scholarly accuracy benchmark.

### 7. Release security hardening

Release dependency/tooling line:

- Next.js `16.3.8`
- React `19.3.0`
- React DOM `19.3.0`
- Vitest `4.1.11`
- oxlint `1.86.0` (development-only)

The vulnerable legacy `eslint` / `eslint-config-next` dependency chain was removed. CI permanently executes:

```bash
npm audit --audit-level=high
```

The release dependency state passes this gate.

## Safety and claim boundaries

The release intentionally does **not** claim that:

- every unknown Persian string can be transliterated authoritatively;
- the 108-case post-remediation regression is an unseen generalization benchmark;
- the 13-case portability set measures broad scholarly accuracy;
- AI-generated case adjudication became human case adjudication after governance approval;
- the project is an official IJMES or Cambridge implementation.

The release does claim, with repository-backed tests, that:

- frozen gold is governed and integrity-checked;
- scholarly canonical and publication rendering are independently modeled;
- genuine ambiguity can remain safely non-authoritative;
- the frozen regression has zero false-authoritative and zero under-blocked results;
- reviewed authority is exact-match/profile-bounded rather than fuzzy;
- the independent portability gate has zero frozen-authority overlap;
- the current dependency graph passes the configured high/critical audit gate.

## Primary release verification

```bash
npm ci
npm audit --audit-level=high
npm test
npm run validate:acquisition
npm run validate:adjudication
npm run validate:reaudit-worklist
npm run validate:v2-benchmark
npm run validate:gold-freeze
npm run evaluate:v2-frozen
npm run validate:v2-regression
npm run validate:portability
npm run validate:corpus
npm run typecheck
npm run lint
npm run build
```

Primary safety invariants:

- `FALSE_AUTHORITATIVE = 0`
- `UNDER_BLOCKED = 0`
- frozen scholarly gold is never changed merely to improve engine metrics
