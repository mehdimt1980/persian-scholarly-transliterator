# Human Adjudication and Explicit Lexicon Promotion (Phase 5E)

## 1. Authority Transition Architecture

Phases 5A through 5D established a strictly non-authoritative evidence and analysis pipeline:

```text
External Source (LoC / Catalog)
      ↓
Raw LexicalEvidence [Immutable Observation]
      ↓
Validated Positional Alignment
      ↓
LexicalCandidate [Non-Authoritative Proposal]
      ↓
Scheme Interpretation & Consensus (Phase 5D)
      ↓
ZERO AUTOMATIC AUTHORITY
```

Phase 5E introduces the first controlled and auditable bridge from non-authoritative evidence into reusable lexicon authority:

```text
LexicalCandidate + Phase 5D Scheme Analysis
      ↓
CandidateReviewPacket [Immutable Review Basis]
      ↓
Human Specialist Review
      ↓
CandidateAdjudicationDecision [Explicit ACCEPT / REJECT / DEFER]
      ↓
LexiconPromotionPlan [Deterministic Action Preview]
      ↓
Explicit Promotion Execution
      ↓
New LexiconRepository Snapshot + Immutable PromotionReceipt
```

### Core Invariants

```text
EVIDENCE
≠
SCHEME HYPOTHESIS
≠
HUMAN DECISION
≠
LEXICON PROMOTION
```

1. **Scheme consensus is never automatic authority**: Even a candidate with `UNANIMOUS_DETERMINISTIC` consensus (e.g. `saʿdī`) has zero authority to mutate the lexicon or set `LexicalCandidate.proposedCanonical`.
2. **Review decision is not promotion**: Recording an `ACCEPT` decision captures human scholarly consent, but does not alter any lexicon repository.
3. **Promotion requires explicit execution**: Promotion is a separate, deliberate governance transaction that returns a new `LexiconRepository` snapshot with attached receipt.
4. **Zero mutation of default lexicon**: Neither `DEFAULT_LEXICON_REPOSITORY` nor `src/data/lexicon.ts` is ever modified automatically.

---

## 2. Review Packet & Review-Basis Fingerprint

A `CandidateReviewPacket` represents the exact semantic state presented to the human reviewer:

```ts
interface CandidateReviewPacket {
  id: string;
  candidateId: string;
  candidateSnapshot: LexicalCandidate;
  schemeAnalysisId: string;
  schemeAnalysisSnapshot: CandidateSchemeAnalysis;
  evidenceIds: string[];
  reviewBasisFingerprint: string;
  preparedAt?: string;
  packetVersion: string;
}
```

### Review-Basis Fingerprint (`reviewBasisFingerprint`)

The review-basis fingerprint (`rev-basis-<digest>`) is a deterministic semantic hash over:
- Candidate identity (`id`, `persianForm`, `normalizedForm`, `entityType`, `status`, derivation strategy);
- Sorted supporting evidence IDs;
- Sorted conflict observations;
- Phase 5D scheme analysis ID, consensus status, consensus target hypothesis, and sorted deterministic hypotheses;
- Sorted applied rule IDs and blocker descriptors;
- Aggregator, interpreter, and rule-set software versions.

Wall-clock timestamps (`preparedAt`, `analyzedAt`, `derivedAt`) are strictly excluded from the fingerprint and packet ID. Re-preparing the packet against identical evidence state yields identical IDs and fingerprints.

---

## 3. Human Decision Model

Human decisions are explicit events recorded in the append-only `AdjudicationLedger`:

```ts
type AdjudicationDisposition = 'ACCEPT' | 'REJECT' | 'DEFER';

interface CandidateAdjudicationDecision {
  id: string;
  reviewPacketId: string;
  reviewBasisFingerprint: string;
  candidateId: string;
  schemeAnalysisId: string;
  disposition: AdjudicationDisposition;
  canonicalSelection: CanonicalSelection | null;
  reviewerRef: string;
  reviewerDisplayName?: string;
  rationale: string;
  decidedAt: string;
  candidateSnapshot: LexicalCandidate;
  schemeAnalysisSnapshot: CandidateSchemeAnalysis;
  decisionVersion: string;
}
```

### Reviewer Provenance & Rationale
All decisions strictly require:
- Non-empty `reviewerRef` (caller-asserted reviewer identifier);
- Non-empty `rationale` (scholarly justification).

### Dispositions: ACCEPT, REJECT, DEFER
- **`ACCEPT`**: Reviewer approves creation of a reviewed lexical entry/reading. Requires an explicit non-null `canonicalSelection`.
- **`REJECT`**: Reviewer determines the candidate should not enter the lexicon from this review basis (e.g. OCR error, corrupted record). Strictly requires `canonicalSelection: null`.
- **`DEFER`**: Reviewer postpones decision pending additional evidence or lexicographical clarification. Strictly requires `canonicalSelection: null`.

### Explicit Canonical Selection
No default or fallback is ever applied automatically. For `ACCEPT`, the reviewer must supply:
1. **`SELECT_SCHEME_HYPOTHESIS`**:
   - The selected canonical string must exist exactly in `schemeAnalysis.deterministicTargetHypotheses`.
   - Supports selecting between conflicting deterministic hypotheses (e.g. `gulistān` vs `golestān`).
2. **`MANUAL_CANONICAL`**:
   - Reviewer manually enters a scholarly transliteration string.
   - Validated structurally via `validateManualTransliteration()` (no Arabic/Persian script characters, no control characters).
   - Preserves scholarly Unicode exactly without silent engine normalization or character rewrites.
   - Enables expert resolution of `BLOCKED`, `PARTIAL`, or complex entries (e.g. `rūznāmah`).

---

## 4. Stale-State Protection & Fail-Closed Invariants

To protect against concurrent modifications, stale cached data, or evolving rule-sets:

1. **Stale Review Basis Protection**:
   When recording a decision or executing promotion, the live candidate review basis is recomputed from the evidence repository. If the live fingerprint does not match the decision's review-basis fingerprint, the operation fails closed with `StaleReviewBasisError`.

2. **Conflicting Human Decisions**:
   If multiple `ACCEPT` decisions exist for the same review basis selecting different canonical forms, the ledger detects this and blocks promotion with `ConflictingHumanDecisionsError` until governance resolution occurs.

3. **Stale Lexicon Base Protection**:
   A `LexiconPromotionPlan` records `expectedBaseLexiconFingerprint`. If the target lexicon repository changes before `executePromotion()`, the execution fails closed with `StaleLexiconBaseError`.

4. **Double Promotion Prevention**:
   A decision may be promoted at most once. Subsequent attempts fail closed with `DecisionAlreadyPromotedError`.

---

## 5. Promotion Execution & Snapshot Isolation

Promotion execution is performed via `executePromotion()`:

```ts
const result = executePromotion(
  plan,
  evidenceRepository,
  adjudicationLedger,
  currentLexiconRepository,
  {
    promoterRef: 'curator@example.edu',
    promoterDisplayName: 'Curator Name',
    promotedAt: '2026-10-06T12:00:00Z'
  }
);
```

### Execution Actions
- **`CREATE_ENTRY`**: Normalized Persian form does not exist in lexicon. Creates a new `LexicalEntry` with deterministic ID `lex:promoted:<digest>`, conservative metadata mapping (`PERSON` / `PLACE` / `ORGANIZATION` -> `proper-noun`), and reading ID `read:promoted:<digest>`.
- **`ADD_READING`**: Normalized entry exists, but canonical is new. Appends the new `LexicalReading` to the existing entry, preserving all existing readings.
- **`ALREADY_PRESENT`**: Exact canonical reading already exists. Emits receipt without duplicating the reading.

### Reading Provenance & Confidence
- `reading.confidence`: strictly `1.0` (documented as accepted project-review authority, not a statistical estimate).
- `reading.source`: `'Phase 5E human-adjudicated lexical promotion'`.
- `reading.sources`: contains `type: 'REVIEWED_PROJECT_ENTRY'` with references linking back to decision ID, candidate ID, and scheme analysis ID.

### Snapshot Isolation
`executePromotion()` returns:
```ts
{
  repository: LexiconRepository; // Fresh immutable repository snapshot
  receipt: PromotionReceipt;     // Appended to AdjudicationLedger
}
```
The input `currentLexiconRepository` and `DEFAULT_LEXICON_REPOSITORY` remain completely unmodified.

---

## 6. Ledger Hardening & Authority-Integrity Invariants

### 6.1 Untrusted Persistence Boundary & Intrinsic Validation
The `AdjudicationLedger` treats historical JSON input as an untrusted boundary. Any decision added to the ledger or deserialized must pass `validateAdjudicationDecisionIntegrity(decision)`:
- Non-empty `id`, `reviewerRef`, `rationale`, and valid `disposition`;
- `ACCEPT` strictly requires valid `canonicalSelection`; `REJECT` and `DEFER` require `canonicalSelection: null`;
- `MANUAL_CANONICAL` passes `validateManualTransliteration()`;
- `SELECT_SCHEME_HYPOTHESIS` canonical must exist in `schemeAnalysisSnapshot.deterministicTargetHypotheses`;
- Candidate snapshot matches Phase 5C origin (`ALIGNED_SEGMENT_SYNTHESIS`, `proposedCanonical: null`);
- Decision snapshot integrity: Recomputed `computeReviewBasisFingerprint(candidateSnapshot, schemeAnalysisSnapshot)` strictly equals `reviewBasisFingerprint`;
- Recomputed `generateDecisionId(...)` strictly equals `decision.id`.

### 6.2 Full Promotion Plan Semantic Binding & Equivalence
Every executable semantic field is bound into `generatePromotionPlanId()`:
- `decisionId`, `candidateId`, `canonical`, `normalizedPersian`, `persianSurface`, `action`, `targetEntryId`, `targetReadingId`, `expectedBaseLexiconFingerprint`, `reviewBasisFingerprint`, `planVersion`.
Tampering with ANY executable semantic field changes the plan ID. Pure intrinsic validator `validatePromotionPlanIntegrity(plan)` ensures the plan ID recomputes from its fields. Furthermore, before promotion execution, `executePromotion()` recomputes the live plan and executes `assertExactSamePromotionPlan(plan, recomputedPlan)`, rejecting any deviation with `InvalidPromotionPlanError` and zero lexicon mutation.

### 6.3 Promotion Plan Snapshot & Complete Receipt Identity
`PromotionReceipt` preserves an immutable defensive snapshot `promotionPlanSnapshot: LexiconPromotionPlan`.
Deterministic `generatePromotionReceiptId()` binds the 15 executable semantic outcome fields into receipt identity:
1. `decisionId`
2. `promotionPlanId`
3. `candidateId`
4. `reviewPacketId`
5. `reviewBasisFingerprint`
6. `schemeAnalysisId`
7. `canonical`
8. `action`
9. `lexiconEntryId`
10. `lexicalReadingId`
11. `baseLexiconFingerprint`
12. `resultLexiconFingerprint`
13. `promoterRef`
14. `promotedAt`
15. `promotionVersion`

*(Note: `promoterDisplayName` is excluded from the cryptographic receipt ID hash as decorative display metadata, ensuring receipt identity depends purely on verifiable governance fields).*

### 6.4 Receipt ↔ Plan ↔ Decision Governance Rules & Result Fingerprints
`AdjudicationLedger.addReceipt()` validates governance references immediately on ingress:
- `validatePromotionPlanIntegrity(receipt.promotionPlanSnapshot)` passes;
- `receipt.promotionPlanId === receipt.promotionPlanSnapshot.id`;
- Receipt fields (`decisionId`, `candidateId`, `canonical`, `action`, `lexiconEntryId`, `lexicalReadingId`, `baseLexiconFingerprint`, `reviewBasisFingerprint`) match the embedded `promotionPlanSnapshot` exactly;
- Referenced decision exists in ledger with `ACCEPT` disposition, non-null `canonicalSelection`, and matching fields (`canonical`, `candidateId`, `reviewPacketId`, `reviewBasisFingerprint`, `schemeAnalysisId`);
- For `ALREADY_PRESENT` action, `resultLexiconFingerprint === baseLexiconFingerprint` is strictly enforced;
- Recomputed receipt ID strictly matches `receipt.id`;
- Re-adding existing receipt with altered plan snapshot fails closed with `ReceiptImmutabilityViolationError`;
- Rejects orphaned receipts and receipts for `REJECT` / `DEFER` decisions.

---

## 7. Relationship to Session-Scoped Review (Phase 2C)

| Dimension | Phase 2C Session Review | Phase 5E Human Adjudication & Promotion |
|---|---|---|
| **Scope** | Single transliteration run / session | Reusable lexical authority |
| **Object** | Token-level `ReviewDecision` / `USER_OVERRIDE` | Candidate `CandidateAdjudicationDecision` & `PromotionReceipt` |
| **Persistence** | Ephemeral or batch-run export | Append-only `AdjudicationLedger` & new `LexiconRepository` |
| **Lexicon Impact** | Zero (runtime override only) | Generates new reviewed lexicon repository snapshots |

