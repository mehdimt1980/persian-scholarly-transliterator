# Assisted Candidate Resolver (Phase 3)

The **Assisted Candidate Resolver** provides human scholars with external language model suggestions for unresolved review issues (`ReviewIssue`) while preserving strict deterministic authority boundaries.

---

## 1. Zero-Authority Architecture

The fundamental principle of the assisted resolver is that **AI suggestions have zero automatic authority**.

```text
Deterministic Analysis
  ↓
ReviewIssue Detected
  ↓
User Requests Assistance (Manual Trigger)
  ↓
OpenAI Responses API (Structured Output)
  ↓
Structural Schema Guarantee (Zod Discriminated Union)
  ↓
Domain Authority Validation (validateProviderResolution)
  ↓
AssistedResolution (Advisory Only)
  ↓
Scholar Reviews and Selects Candidate
  ↓
ReviewDecision Created (Provenance: user-decision)
  ↓
Transliteration Engine Recomputes State (USER_OVERRIDE)
```

### Invariants:
1. **Fetching Suggestions Never Alters State:** Requesting or receiving suggestions does not mutate canonical output, token status, copyability, izāfat relations, morphology trees, or the reviewed lexicon.
2. **Human Selection is Mandatory:** An AI suggestion only becomes effective when a human scholar clicks "Use this suggestion", converting it into a typed Phase 2C `ReviewDecision`.
3. **Epistemic Provenance:** Accepted suggestions retain `assistance` metadata (`suggestionId`, `provider`, `model`, `promptVersion`), but the rule authority remains strictly `user-decision`.

---

## 2. Issue-Type Constrained Suggestions

The resolver operates under strict candidate schemas constrained by the target issue's allowed action space:

| ReviewIssue Type | Allowed Suggestion Kind | Scope / Constraints |
|---|---|---|
| `LEXICAL_AMBIGUITY` | `EXISTING_LEXICAL_READING` | Must be an existing allowed alternative. The model cannot invent new reviewed readings. |
| `UNKNOWN_TOKEN` | `MANUAL_CANONICAL` | Max 5 candidate transliterations conforming to manual Unicode safety rules. |
| `INSUFFICIENT_VOCALIZATION` | `EXISTING_LEXICAL_READING` or `MANUAL_CANONICAL` | Exposes still-viable reviewed readings; model cannot choose readings excluded by deterministic vowel conflicts. |
| `UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE` | `MANUAL_CANONICAL` | Unsupported mark remains documented; model proposes canonical string. |
| `UNSUPPORTED_ALLOMORPH` | `MANUAL_CANONICAL` | Suggests manual transliteration; does not confirm morphology. |
| `IZAFAT_CANDIDATE` | `IZAFAT_DECISION` | Ranks `ACCEPT_IZAFAT` or `REJECT_IZAFAT`. Human must confirm before `-i` renders. |
| `MORPHOLOGY_AMBIGUITY` | `MORPHOLOGY_BRANCH` | Ranks `WHOLE_WORD` vs `PRODUCTIVE_SEGMENTATION`. Post-decision review loop handles remaining lexical ambiguity. |

---

## 3. OpenAI Responses API & Structured Output

The adapter communicates with OpenAI using the modern **Responses API**:

- **Method:** `openai.responses.create(...)`
- **Output Guarantee:** Structured Outputs via `zodTextFormat(rawProviderResponseSchema, 'assisted_resolution')` with strict discriminated unions.
- **Privacy & Statelessness:** Explicit `store: false` to ensure queries are session-scoped and not persisted in OpenAI server-side threads.
- **Domain Semantic Validation:** Layered immediately after JSON schema parsing to enforce exact issue IDs, evidence reference authorization, candidate consistency, Unicode safety, rank uniqueness, and duplicate semantic candidate rejection.

---

## 4. Structured Evidence Catalog & Data Minimization

When an assistance request is constructed:
- **Bounded Local Context:** Only the target issue token and a localized window of up to ±4 meaningful (non-whitespace) surrounding tokens are sent. Unrelated document paragraphs are excluded.
- **Structured Orthographic Evidence:** Explicit vowel marks (kasra, fatḥa, ḍamma), unsupported combining marks, ZWNJ boundaries, and izāfat markers are sent as structured typed payloads from `TokenAnalysis`.
- **Evidence Catalog:** All admissible evidence references are assigned stable typed IDs (`context:local-window`, `rule:...`, `orthography:...`, `reading:...`, `source:...`, `relation:...`, `morphology:...`). The model must either cite allowed IDs or declare `MODEL_INFERENCE` with empty evidence references.
- **Prompt Injection Defense:** Source text is strictly delimited as untrusted linguistic data. The model has no tools, no web browsing, and no code execution permissions.

---

## 5. Server Configuration & Model Requirement

The domain is decoupled from network APIs via the `AssistedResolverProvider` interface.

### Environment Variables:
```bash
OPENAI_API_KEY=sk-...
ASSISTED_RESOLVER_MODEL=gpt-4o-2024-08-06
ASSISTED_RESOLVER_TIMEOUT_MS=15000
```

Both `OPENAI_API_KEY` and `ASSISTED_RESOLVER_MODEL` must be explicitly configured. There is no silent default model. If either is missing:
- Deterministic transliteration and human review function completely normally.
- The assistance API returns `503 ASSISTANCE_UNAVAILABLE`.
- The UI displays an advisory message that assistance is unavailable.

---

## 6. Stale Suggestion Invalidation

Suggestions are tied to deterministic, input-scoped issue fingerprints (`computeRequestFingerprint`). If the underlying source text, profile, or candidate set changes:
- Stored suggestions transition to an explicit `stale` state in the UI.
- The "Use this suggestion" button is disabled.
- The scholar must explicitly re-request assistance for the updated context.
