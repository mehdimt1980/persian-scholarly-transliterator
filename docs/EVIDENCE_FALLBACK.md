# Phase 7C: Evidence-Backed Automatic Lexical Fallback

## 1. Executive Summary & Product Objective

Phase 7C bridges the gap between verified external Wiktionary evidence (acquired in Phase 7A and interpreted in Phase 7B) and the interactive transliteration runtime:

```text
Persian Token
      ↓
Reviewed LexiconRepository Match?
      ├── YES → LEXICON_RESOLVED (Authoritative Scholarly Canonical)
      └── NO
           ↓
   Evidence Fallback Repository Lookup
           ↓
   Eligible Phase 7B Unanimous Deterministic Hypothesis?
           ├── YES → Show clean provisional IJMES reading
           │         Status: UNRESOLVED
           │         Canonical: null
           │         Copyable: BLOCKED
           │         Review Action: ACCEPT_EVIDENCE_DERIVED
           │
           └── NO  → Existing Unresolved Behavior
```

---

## 2. Fundamental Architectural Distinction

```text
DISPLAYABLE AUTOMATIC HYPOTHESIS ≠ AUTOMATIC SCHOLARLY AUTHORITY
Reviewed lexical reading ≠ Evidence-derived hypothesis ≠ Human-accepted session reading ≠ Authoritative lexicon entry
```

1. **Reviewed Lexical Reading**: A curated, peer-verified entry in `DEFAULT_LEXICON_REPOSITORY` carrying scholarly authority.
2. **Evidence-Derived Hypothesis**: A non-authoritative IJMES transliteration proposal derived offline from English Wiktionary evidence. Displayed cleanly to improve user readability, but strictly uncopyable and non-canonical until human confirmation.
3. **Human-Accepted Session Reading**: An explicit human review decision (`USER_OVERRIDE`) recorded in the current research session.
4. **Authoritative Lexicon Entry**: Requires independent scholarly promotion workflows; never created automatically at runtime.

---

## 3. Strict Runtime Precedence

The transliteration engine resolves tokens according to a strict hierarchy:

1. **Frozen Human-Reviewed Phrase Authority**: Verified whole-phrase overrides.
2. **Reviewed Lexicon (`LexiconRepository`)**: Curated lexical items with source citations.
3. **Deterministic Morphology from Reviewed Stems**: Suffix morphology based on reviewed lexical stems.
4. **Evidence-Backed Lexical Fallback**: Consulted ONLY on genuine lexical absence (`NO_LEXICAL_ENTRY`).
5. **Existing Unresolved Behavior**: Held for review if no fallback exists.
6. **Optional AI / Assisted Resolvers**: Advisory downstream assistance; never replaces deterministic evidence.

### What Fallback NEVER Overrides
- **Reviewed Lexicon Entries**: Even if fallback disagrees, the reviewed lexicon always takes precedence.
- **Orthographic & Vocalization Conflicts**: `VOCALIZATION_CONFLICT`, `UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE`, `INSUFFICIENT_VOCALIZATION`.
- **Lexical or Morphological Ambiguity**: `LEXICAL_AMBIGUITY`, `MORPHOLOGY_AMBIGUITY`, `UNSUPPORTED_ALLOMORPH`.
- **Morphological Stem Authority**: Fallback entries cannot serve as reviewed stems to unlock productive suffix authority.
- **Grammatical Relations**: Fallback metadata is not used to infer grammatical relations (izāfat).

---

## 4. Fallback Eligibility & Confidence Tiers

A candidate from Phase 7B enters the generated fallback pack only if:
- `consensusStatus === 'UNANIMOUS_DETERMINISTIC'`
- `consensusTargetHypothesis !== null`
- Every contributing interpretation is non-blocked and has `status === 'DIRECT_EQUIVALENT' || status === 'DETERMINISTIC_EQUIVALENT'`
- `candidate.proposedCanonical === null`
- Exact evidence-set closure is satisfied.

### Descriptive Confidence Tiers
- **`CROSS_PROFILE_CONSENSUS`**: At least one `CLASSICAL_DARI` and at least one `IRANIAN` observation independently converge to the same IJMES hypothesis (e.g. `گفتار` → `guftār`).
- **`MULTI_OBSERVATION_CONSENSUS`**: Multiple observations from a single dialect profile converge.
- **`SINGLE_OBSERVATION_DETERMINISTIC`**: A single unambiguous deterministic observation exists.

*Note*: Confidence tiers are descriptive diagnostics; all tiers remain strictly **non-authoritative** and require human review.

---

## 5. Token State & Clean Output

Before human acceptance:
```ts
token.status = 'UNRESOLVED';
token.canonicalTransliteration = null;
token.automaticCanonical = null;
token.blockingReason = 'EVIDENCE_DERIVED_REVIEW_REQUIRED';
token.rendered = 'guftār'; // Clean scholarly display
token.evidenceDerivedProposal = { ... };
result.copyable = false;
```

Main output displays readable text (e.g., `guftār`) without confusing bracketed placeholders, while copy operations remain disabled and an informative notice explains that review is required.

In the citation title profile (`ijmes_citation_title`), `rendered` displays capitalized output (`Guftār`) while `hypothesis` remains canonical (`guftār`).

---

## 6. Review Issue & Tamper-Resistant Acceptance

1. **Review Issue**: Emitted as `type: 'EVIDENCE_DERIVED_READING'` with allowed actions `['ACCEPT_EVIDENCE_DERIVED', 'MANUAL_CANONICAL_OVERRIDE']`.
2. **Acceptance Action**: `ACCEPT_EVIDENCE_DERIVED` binds the decision to the specific `fallbackEntryId` and `hypothesis`.
3. **Tamper Resistance**: If client-supplied decision metadata mismatches the active proposal or tampers with the canonical value, the decision is rejected and marked stale.
4. **Automatic Snapshot Preservation**: After acceptance, the token becomes `USER_OVERRIDE` with canonical transliteration for this workspace, but `token.automatic` preserves the unresolved evidence snapshot and its provenance.

---

## 7. Workspace Persistence & Stale Decision Handling

- Decisions persist in IndexedDB as part of `reviewDecisions`.
- Fallback pack data itself is NOT persisted in IndexedDB; it loads synchronously and immutably from the application bundle.
- On workspace reload, saved decisions revalidate against the current fallback pack. If a pack version update modifies or removes an entry ID, the saved decision fails closed to `staleDecisions`.

---

## 8. Fallback Pack Generation & Size Guard

Run the pack generator CLI:
```bash
npm run build:kaikki-fallback -- --input <path-to-jsonl> --output src/data/generated/kaikki-fallback.v1.json
```

A strict size ceiling guard (`maxPackBytes = 5MB`) prevents accidental bundle bloat.

### Generator Scaling Note
The pilot fallback pack generator (`src/domain/evidence/kaikki/fallback/generator.ts`) parses the input stream and aggregates candidates in memory. This is designed for pilot/medium dataset builds (1,000–10,000 entries). Full streaming sink-based scaling for large 100k+ bulk dumps will be implemented in subsequent phases.

---

## 9. Dependency Injection & Custom Lexicon Isolation

The transliteration engine isolates test and custom lexicons from the production fallback repository:
```ts
// Production default: uses default lexicon AND default evidence fallback
transliterate(input);

// Custom lexicon: does NOT inherit production fallback repository unless explicitly provided
transliterate(input, profile, reviewDecisions, customLexicon); // Fallback disabled

// Custom lexicon with explicit fallback opt-in:
transliterate(input, profile, reviewDecisions, customLexicon, fallbackRepository);
```

## 10. Evaluation CLI: Display vs Authoritative Coverage

Run evaluation:
```bash
npm run evaluate:fallback
```

Reports two distinct coverage metrics:
- **Display Coverage**: Percentage of Persian tokens for which clean Latin output can be presented to the user. *(Intentionally increased in Phase 7C)*.
- **Authoritative Coverage**: Percentage of Persian tokens resolved through reviewed or human-approved authority. *(Strictly unchanged in Phase 7C)*.

---

## 11. Governance Metrics

Every execution of Phase 7C runtime and evaluation enforces:
```text
Automatic promotions to lexicon:   0
Authoritative lexicon mutations:    0
Frozen scholarly canonical truth:   UNCHANGED
FALSE_AUTHORITATIVE:                0
UNDER_BLOCKED:                      0
```
