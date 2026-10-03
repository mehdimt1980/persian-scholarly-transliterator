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
Assisted Resolver Provider Suggests Candidates (Advisory Only)
  ↓
Scholar Reviews and Selects Candidate
  ↓
ReviewDecision Created (Provenance: user-decision)
  ↓
Transliteration Engine Recomputes State (USER_OVERRIDE)
```

### Invariants:
1. **Fetching Suggestions Never Alters State:** Requesting or receiving suggestions does not mutate canonical output, token status, copyability, izāfat relations, morphology trees, or the reviewed lexicon.
2. **Human Selection is Mandatory:** An AI suggestion only becomes effective when a human scholar clicks "Use this suggestion", converting it into a standard Phase 2C `ReviewDecision`.
3. **Epistemic Provenance:** Accepted suggestions retain `assistance` metadata (`suggestionId`, `provider`, `model`, `promptVersion`), but the rule authority remains strictly `user-decision`.

---

## 2. Issue-Type Constrained Suggestions

The resolver operates under strict candidate schemas constrained by the target issue type:

| ReviewIssue Type | Allowed Suggestion Kind | Scope / Constraints |
|---|---|---|
| `LEXICAL_AMBIGUITY` | `EXISTING_LEXICAL_READING` | Must be an existing allowed alternative. The model cannot invent new reviewed readings. |
| `UNKNOWN_TOKEN` | `MANUAL_CANONICAL` | Max 5 candidate transliterations conforming to manual Unicode safety rules. |
| `INSUFFICIENT_VOCALIZATION` | `EXISTING_LEXICAL_READING` or `MANUAL_CANONICAL` | Cannot choose readings excluded by deterministic vowel evidence. |
| `UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE` | `MANUAL_CANONICAL` | Unsupported mark remains documented; model proposes canonical string. |
| `UNSUPPORTED_ALLOMORPH` | `MANUAL_CANONICAL` | Suggests manual transliteration; does not confirm morphology. |
| `IZAFAT_CANDIDATE` | `IZAFAT_DECISION` | Ranks `ACCEPT_IZAFAT` or `REJECT_IZAFAT`. Human must confirm before `-i` renders. |
| `MORPHOLOGY_AMBIGUITY` | `MORPHOLOGY_BRANCH` | Ranks `WHOLE_WORD` vs `PRODUCTIVE_SEGMENTATION`. Post-decision review loop handles remaining lexical ambiguity. |

---

## 3. Data Minimization & Privacy

When an assistance request is constructed:
- **Bounded Local Context:** Only the target issue token and a localized window of up to ±4 surrounding tokens are sent. Unrelated document paragraphs are excluded.
- **Evidence Whitelist:** Only structural evidence IDs and citations present in the domain analysis are referenced.
- **Prompt Injection Defense:** Source text is strictly delimited as untrusted linguistic data. The model has no tools, no web browsing, and no code execution permissions.

---

## 4. Provider Abstraction & Server Configuration

The domain is completely decoupled from network APIs via the `AssistedResolverProvider` interface.

### Environment Variables:
```bash
OPENAI_API_KEY=sk-...
ASSISTED_RESOLVER_MODEL=gpt-4o-mini
ASSISTED_RESOLVER_TIMEOUT_MS=15000
```

If `OPENAI_API_KEY` is not configured:
- Deterministic transliteration and human review function completely normally.
- The assistance API returns `503 Unavailable`.
- The UI displays an advisory message that assistance is unavailable.

---

## 5. Stale Suggestion Invalidation

Suggestions are tied to deterministic, input-scoped issue fingerprints (`computeRequestFingerprint`). If the underlying source text or candidate set changes:
- Previously generated suggestions become stale.
- Stale suggestions cannot be applied.
- The scholar must explicitly request new suggestions for the updated context.
