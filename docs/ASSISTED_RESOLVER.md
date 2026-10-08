# Assisted Resolvers

The assistance layer provides human scholars with external language-model suggestions while preserving strict deterministic authority boundaries. It now has two complementary surfaces:

1. the original **issue-level Assisted Candidate Resolver**, which helps with one `ReviewIssue` at a time;
2. the **Automatic Context-Aware Phrase Resolver**, which analyzes the complete current phrase when deterministic analysis remains blocked.

Neither surface grants automatic scholarly authority.

---

## 1. Zero-Authority Architecture

The fundamental principle is that **AI suggestions have zero automatic authority**.

### Issue-level path

```text
Deterministic Analysis
  ↓
ReviewIssue Detected
  ↓
User Requests Assistance
  ↓
OpenAI Responses API (Structured Output)
  ↓
Structural + Domain Validation
  ↓
AssistedResolution (Advisory Only)
  ↓
Scholar Selects Candidate
  ↓
ReviewDecision (user-decision provenance)
  ↓
Engine Recomputes State
```

### Phrase-level path

```text
Deterministic Analysis
  ↓
Multiple-token phrase remains non-copyable
  ↓
Context-Aware Phrase Resolver
  ↓
Whole-phrase proposal
  ├─ scholarlyCanonical
  ├─ renderedOutput
  ├─ tokenReadings
  ├─ confidence / rationale
  └─ assumptions / warnings
  ↓
PROPOSAL IS STILL NON-AUTHORITATIVE
  ↓
Human Accept / Edit / Reject
  ↓
AcceptedPhraseDecision
  ├─ HUMAN_ACCEPTED_AI_SUGGESTION
  └─ HUMAN_EDITED_AI_SUGGESTION
  ↓
Session output becomes user-authorized and copyable
```

### Invariants

1. **Fetching suggestions never alters deterministic state.** Requesting or receiving AI output does not mutate the engine, reviewed lexicon, morphology rules, frozen gold, token status, or runtime authority data.
2. **Human acceptance is mandatory.** Model confidence never converts a proposal into an authoritative result.
3. **Canonical and rendering remain separate.** Phrase assistance returns scholarly canonical transliteration and selected-profile rendering as distinct fields.
4. **Ambiguity may remain blocked.** A model can return `REVIEW_REQUIRED` with no canonical or rendered output rather than forcing a reading.
5. **Accepted phrase decisions are session/user decisions, not new reviewed authority.** They do not automatically persist into the reviewed lexicon or frozen authority layer.
6. **Deterministic diagnostics remain visible.** Accepting a phrase-level proposal changes the selected/copyable UI output but does not erase the underlying unresolved issues shown for audit.

---

## 2. Issue-Level Assisted Candidate Resolver

The original resolver operates under strict candidate schemas constrained by the target issue's allowed action space:

| ReviewIssue Type | Allowed Suggestion Kind | Scope / Constraints |
|---|---|---|
| `LEXICAL_AMBIGUITY` | `EXISTING_LEXICAL_READING` | Must be an existing allowed alternative. The model cannot invent new reviewed readings. |
| `UNKNOWN_TOKEN` | `MANUAL_CANONICAL` | Max 5 candidate transliterations conforming to manual Unicode safety rules. |
| `INSUFFICIENT_VOCALIZATION` | `EXISTING_LEXICAL_READING` or `MANUAL_CANONICAL` | Exposes still-viable reviewed readings; model cannot choose readings excluded by deterministic vowel conflicts. |
| `UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE` | `MANUAL_CANONICAL` | Unsupported mark remains documented; model proposes canonical string. |
| `UNSUPPORTED_ALLOMORPH` | `MANUAL_CANONICAL` | Suggests manual transliteration; does not confirm morphology. |
| `IZAFAT_CANDIDATE` | `IZAFAT_DECISION` | Ranks `ACCEPT_IZAFAT` or `REJECT_IZAFAT`. Human must confirm before `-i` renders. |
| `MORPHOLOGY_AMBIGUITY` | `MORPHOLOGY_BRANCH` | Ranks `WHOLE_WORD` vs `PRODUCTIVE_SEGMENTATION`. Post-decision review loop handles remaining lexical ambiguity. |

The issue-level route remains available for granular scholarly inspection even when the phrase resolver is enabled.

---

## 3. Automatic Context-Aware Phrase Resolver

The phrase resolver is intended for the long tail where token-by-token deterministic processing is safe but too conservative for good user experience.

### Trigger

In the single-transliteration workspace, automatic phrase assistance is eligible when:

- deterministic output is not copyable;
- at least one current `ReviewIssue` exists;
- the source contains at least two Persian-word tokens;
- OpenAI assistance is configured.

The UI waits approximately 900 ms after the input state stabilizes before requesting phrase assistance. A user can also trigger/re-trigger the phrase resolver explicitly.

Single-token unresolved inputs continue to use the granular review workflow by default, though phrase assistance can still be requested manually from the phrase panel when applicable.

### Context sent to the provider

The server recomputes the full `TransliterationResult` from `input`, `profile`, and typed human review decisions. The browser cannot inject token status, review issues, morphology, or relation evidence.

The phrase request includes:

- original and normalized current phrase;
- profile and context kind (`BOOK_OR_ARTICLE_TITLE` or `GENERAL_SCHOLARLY_TEXT`);
- deterministic status, copyability, and diagnostic output;
- structured token state;
- current review issues and allowed actions;
- morphology evidence;
- phrase relations such as izāfat candidates/confirmations.

Unlike the issue-level resolver's bounded ±4-token window, the phrase resolver intentionally receives the **complete current phrase**, because phrase-level grammar and title structure are the feature's unit of analysis. It does not receive unrelated document paragraphs.

### Required model behavior

The prompt requires the model to:

- analyze the phrase as a whole rather than independently guessing each unknown token;
- distinguish `scholarlyCanonical` from `renderedOutput`;
- transliterate rather than translate;
- preserve deterministic evidence as constraints;
- avoid invented citations or claims of external lookup;
- return `REVIEW_REQUIRED` instead of forcing materially uncertain readings;
- omit chain-of-thought and provide only concise scholarly rationale.

### Output contract

A complete advisory proposal is:

```text
PROPOSED
scholarlyCanonical = <full scholarly transliteration>
renderedOutput      = <selected profile rendering>
confidence          = advisory model score
rationale           = concise explanation
tokenReadings       = explanatory phrase-token mappings
assumptions         = unresolved assumptions disclosed to the user
```

A safely blocked result is:

```text
REVIEW_REQUIRED
scholarlyCanonical = null
renderedOutput      = null
assumptions/warnings explain the blocking ambiguity
```

All provider payloads pass strict Zod structural validation plus domain checks before reaching the UI. Persian/Arabic script is rejected from Latin transliteration fields.

---

## 4. Human Acceptance, Editing, Rejection, and Provenance

For a `PROPOSED` phrase resolution the user can:

- **Accept resolution** — records `HUMAN_ACCEPTED_AI_SUGGESTION`;
- **Edit before accepting** — validates both fields and records `HUMAN_EDITED_AI_SUGGESTION`;
- **Reject** — discards the current proposal and leaves deterministic review state unchanged.

Accepted phrase-decision metadata records:

- provider;
- model;
- prompt version;
- deterministic request fingerprint;
- model confidence;
- accepted timestamp;
- canonical and rendered values selected by the user.

An accepted phrase decision is currently session-scoped. It does **not** write to the reviewed lexicon, frozen scholarly gold, or persistent runtime authority data.

---

## 5. Stale-State Protection

Both assisted surfaces are fingerprint-bound to deterministic input state.

Legacy phrase decisions retain the original fingerprint, which covers source text, profile/context, deterministic status/output, token evidence, current review issues, morphology, relations, prompt version, provider, and model. New decisions additionally carry reading identity V2. V2 covers source and semantic context, canonical deterministic evidence, review/morphology/relation evidence, prompt version, provider, and model, but excludes the selected rendering profile, rendered token strings, and aggregate rendered output.

For V2 decisions, a rendering-only profile change does not trigger another provider request. If the source, semantic context, deterministic evidence, or current review state changes:

- the proposal is no longer applicable;
- a previously accepted phrase decision is revoked from the selected output;
- a fresh phrase resolution is required.

This prevents a model proposal for one analysis state from being silently reused on another.

---

## 6. OpenAI Responses API & Structured Output

Both OpenAI adapters use the server-side Responses API:

- `openai.responses.create(...)`;
- strict structured output using `zodTextFormat(...)`;
- `store: false`;
- no browser-side API key;
- no model tool access in the resolver prompts;
- refusal, timeout, invalid JSON, and invalid domain payloads fail closed.

The phrase route is:

```text
POST /api/assist/phrase
```

Availability metadata is exposed without secrets at:

```text
GET /api/assist/status
```

The existing issue route remains:

```text
POST /api/assist
```

---

## 7. Server Configuration & Deployment

The same environment variables configure both assisted surfaces:

```bash
OPENAI_API_KEY=sk-...
ASSISTED_RESOLVER_MODEL=<configured-model-id>
ASSISTED_RESOLVER_TIMEOUT_MS=15000
```

Both `OPENAI_API_KEY` and `ASSISTED_RESOLVER_MODEL` must be explicitly configured. There is no silent default model.

If either is missing:

- deterministic transliteration continues normally;
- manual human review continues normally;
- `/api/assist` and `/api/assist/phrase` fail closed with assistance-unavailable behavior;
- the phrase panel tells the user that AI is implemented but not connected.

For deployment, keep `OPENAI_API_KEY` server-side only. Do not expose it through `NEXT_PUBLIC_*` variables or client code.

---

## 8. Scope Boundary

The first phrase-resolver integration is wired into the **single transliteration workspace**, which is the interaction shown when a user types or pastes a phrase/title. The phrase API and domain contracts are reusable, but bibliography-batch fields continue to use the existing issue-level field-scoped assistance in this version.

This separation is intentional: batch persistence/export semantics should be extended only after phrase-level acceptance is given an explicit record-level persistence contract.
