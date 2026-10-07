# Wiktionary Persian Source-Scheme Interpretation & IJMES Hypothesis Generation

## 1. Overview and Core Philosophy

Phase 7B establishes an offline, source-aware interpretation pipeline that transforms direct lexical evidence extracted from English Wiktionary (via Kaikki / Wiktextract in Phase 7A) into non-authoritative IJMES target hypotheses:

```text
Wiktionary Persian Evidence (Kaikki)
               +
  Source Profile Classification
  (CLASSICAL_DARI vs IRANIAN)
               +
   Persian-Script Orthography
               ↓
    Script-Aware Transduction
               ↓
     IJMES Target Hypothesis
               ↓
  Candidate Consensus Aggregation
               ↓
        ZERO Authority
```

### The Invariant

```text
External romanization ≠ IJMES hypothesis ≠ human decision ≠ authoritative lexical reading
```

Phase 7B generates auditable hypotheses. It **does not** produce authority, does not modify runtime transliteration, does not mutate the default lexicon repository, and performs zero automatic promotions.

---

## 2. Why `LOCAL` ≠ Uninterpretable Forever

In Phase 7A, Kaikki evidence is cataloged with:
```ts
evidence.romanizationScheme === 'LOCAL'
```
because Wiktionary does not conform to standardized national or library cataloging schemes (such as Library of Congress ALA-LC). Instead, it reflects an internal, community-maintained Persian romanization convention.

Labeling the evidence as `LOCAL` prevents it from colliding with standardized catalog schemes. However, `LOCAL` does not mean the evidence is semantically opaque or uninterpretable. Under explicit source-profile definitions and auditable conversion rules, `LOCAL` vocalization observations can be systematically reconstructed into standardized IJMES hypotheses.

---

## 3. Separation of Source Profile from Global Scheme

The global `RomanizationScheme` enum classifies the overarching cataloging/provenance standard (`ALA_LC`, `UNGEGN`, `EI2`, `DMG`, `LOCAL`).

In contrast, `WiktionaryPersianRomanizationProfile`:
```ts
export type WiktionaryPersianRomanizationProfile =
  | 'CLASSICAL_DARI'
  | 'IRANIAN'
  | 'UNCLASSIFIED'
  | 'CONFLICTING';
```
is an interpretation-level, source-specific classification that captures English Wiktionary's internal transliteration policies:

1. **`CLASSICAL_DARI`**: Reflects classical/historical phonology and contemporary Dari/Afghan Persian conventions (e.g., preserving historical short vowels `/i/` and `/u/`, long vowels `ā, ī, ū`, majhūl vowels `ē, ō`, and diphthongs `ay, aw`).
2. **`IRANIAN`**: Reflects contemporary standard Tehrani/Iranian Persian phonological shifts (e.g., short vowel shifts `/i/ → /e/`, `/u/ → /o/`, back long vowel `/ɒː/ → â`, and diphthong shifts `/aw/ → ow`, `/ay/ → ey`).
3. **`UNCLASSIFIED`**: Romanizations lacking unambiguous variety/dialect tags.
4. **`CONFLICTING`**: Evidence containing mutually inconsistent variety tags.

### Evidence-Based Classification (No Typographic Guessing)

Profile classification is strictly evidence-based, derived from explicit tags (`romanizationTags` and `varietyTags`):
- Tags like `Classical-Persian`, `Dari`, `Hazaragi` → `CLASSICAL_DARI`.
- Tags like `Iranian-Persian`, `Tehrani`, `Iran` → `IRANIAN`.
- Untagged observations → `UNCLASSIFIED`.
- Mixed tags → `CONFLICTING`.

**Rule**: Typographic markers alone (such as `â` or `ā`) MUST NEVER be used to infer the dialect profile. Untagged entries fail closed to `UNCLASSIFIED`.

---

## 4. Why Naive Latin-to-Latin Conversion is Prohibited

A naive string replacement pipeline:
```text
// PROHIBITED ARCHITECTURE:
goftâr → replace 'o' with 'u' → replace 'â' with 'ā' → guftār
```
is structurally unsafe because Wiktionary Persian romanization is partly phonological and collapses distinct Persian consonantal phonemes:

| Persian Orthography | Wiktionary Iranian Romanization | Scholarly IJMES Target |
| :--- | :--- | :--- |
| ث / س / ص | `s` | `s` (ث: `s̱`, س: `s`, ص: `ṣ`) |
| ذ / ز / ض / ظ | `z` | `z` (ذ: `ẕ`, ز: `z`, ض: `ż`, ظ: `ẓ`) |
| ح / ه | `h` | `h` (ح: `ḥ`, ه: `h`) |
| غ / ق | `ġ` / `q` / `gh` | غ: `gh`, ق: `q` |
| ط / ت | `t` | ط: `ṭ`, ت: `t` |
| ع | `'` / omitted | `ʿ` |
| ء / ئ / ؤ / أ | `'` / omitted | `ʾ` |

Relying solely on external Latin text discards the rich consonantal and glottal distinctions preserved in the original Persian script.

---

## 5. Script-Aware Reconstruction Architecture

Phase 7B employs a bi-directional transduction engine:
1. **Persian Script Orthography**: Supplies ground-truth consonantal identity (`PERSIAN_CONSONANT_MAPPINGS`), long-vowel letters (`ا`, `و`, `ی`), ʿayn (`ع`), and hamza (`ء`, `أ`, `إ`, `ؤ`, `ئ`).
2. **Wiktionary Romanization**: Supplies unwritten short-vowel vocalization, syllable boundaries, and pronunciation context.

### Example: Convergence on گفتار (`guftār`)

```text
Persian Script:   گ   ف   ت   ا   ر
                  |   |   |   |   |
Classical (Dari): g   u   f   t   ā   r   → IJMES: guftār
                  |   |   |   |   |
Iranian (Tehran): g   o   f   t   â   r   → (o → u, â → ā) → IJMES: guftār
```

Both source profiles converge deterministically to the single scholarly IJMES hypothesis `guftār`.

---

## 6. Source-Backed Rule Registry

All rules are auditable and cite published source and target standards (Cambridge University Press / IJMES Transliteration Guide):

- `WIKT_SCRIPT_CONSONANT_RECONSTRUCTION`: Reconstructs Persian consonants from script (`ح → ḥ`, `ص → ṣ`, `ض → ż`, `ط → ṭ`, `ظ → ẓ`, `ع → ʿ`, `خ → kh`, `غ → gh`, `ق → q`, `ژ → zh`, `ش → sh`, `چ → ch`).
- `WIKT_SCRIPT_AYN_RECONSTRUCTION`: Restores ʿayn (`ع → ʿ`).
- `WIKT_SCRIPT_HAMZA_RECONSTRUCTION`: Restores hamza (`ء/أ/إ/ؤ/ئ → ʾ`).
- `WIKT_CLASSICAL_SHORT_A/I/U`: Preserves classical short vowels `a, i, u`.
- `WIKT_CLASSICAL_LONG_A/I/U`: Preserves classical long vowels `ā, ī, ū`.
- `WIKT_IRANIAN_SHORT_E_TO_IJMES_I`: Transduces Iranian short `e → i`.
- `WIKT_IRANIAN_SHORT_O_TO_IJMES_U`: Transduces Iranian short `o → u`.
- `WIKT_IRANIAN_LONG_A_TO_IJMES_A_MACRON`: Transduces Iranian long `â → ā`.
- `WIKT_IRANIAN_LONG_I_TO_IJMES_I_MACRON`: Transduces Iranian long `i` (backed by `ی`) to `ī`.
- `WIKT_IRANIAN_LONG_U_TO_IJMES_U_MACRON`: Transduces Iranian long `u` (backed by `و`) to `ū`.
- `WIKT_IRANIAN_DIPHTHONG_OW/EY`: Reconstructs Iranian `ow → aw` and `ey → ay`.

---

## 7. Blocker Semantics & Safe Failure

When evidence is incomplete, ambiguous, or unsupported, the interpreter fails closed with an explicit blocker code:

- `UNCLASSIFIED_WIKTIONARY_PROFILE`: Romanization lacks explicit variety tags.
- `CONFLICTING_WIKTIONARY_PROFILE`: Conflicting dialect/variety tags present.
- `SOURCE_SCRIPT_ALIGNMENT_FAILED`: Character counts or structural alignment between script and romanization do not match.
- `UNSUPPORTED_WIKTIONARY_SYMBOL`: Presence of unmapped symbols (e.g., majhūl vowels `ē, ō`).
- `AMBIGUOUS_FINAL_HEH`: Unvocalized or ambiguous silent final `ه`.
- `NON_LEMMA_SOURCE_FORM`: Inflected or non-lemma entry.
- `NO_ROMANIZATION`: Observation lacks romanization text.

---

## 8. Candidate-Level Consensus Aggregation

Aggregates individual interpretations across all evidence items for a given lexical candidate:

- **`UNANIMOUS_DETERMINISTIC`**: All observations produce deterministic hypotheses that are identical.
- **`CONFLICTING_DETERMINISTIC`**: Observations produce divergent deterministic hypotheses (e.g., multiple valid pronunciations).
- **`PARTIAL`**: At least one deterministic hypothesis exists alongside blocked or unclassified observations.
- **`BLOCKED`**: All observations are blocked.
- **`NO_INTERPRETABLE_EVIDENCE`**: No valid evidence items exist.

### Invariant Checks
Candidate aggregation enforces:
1. Exact `candidate.evidenceIds` closure.
2. Persian-script normalization matching.
3. Provenance origin verification (`KAIKKI_ENWIKTIONARY_FA`).
4. `candidate.proposedCanonical === null` (strictly zero automatic authority).

---

## 9. Relationship to Phase 5D and Future Phase 7C

| Dimension | Phase 5D (LoC Library Evidence) | Phase 7B (Wiktionary Evidence) | Future Phase 7C (Lexical Fallback) |
| :--- | :--- | :--- | :--- |
| **Evidence Topology** | Catalog phrase → Positional alignment → Segment synthesis | Direct lexical dictionary observation | Multi-source consensus |
| **Lineage Invariant** | `ALIGNED_SEGMENT_SYNTHESIS` | `DIRECT_LEXICAL_ENTRY` | Verified candidate analysis |
| **Target Output** | `ALA_LC` → IJMES Hypothesis | `LOCAL` (Wiktionary) → IJMES Hypothesis | Candidate fallback ranking |
| **Authority** | ZERO | ZERO | Controlled fallback / review |

---

## 10. Summary Governance Metrics

Every execution of `npm run interpret:kaikki` enforces:
```text
Automatically promoted:        0
Authoritative lexicon changes:  0
Runtime output changes:         0
```
