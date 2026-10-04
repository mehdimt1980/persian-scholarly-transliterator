# Scholarly Canonical vs. Publication Rendering Contract

## Purpose & Scope

This contract formally defines the conceptual and architectural distinction between **Scholarly Canonical Transliteration** and **Publication Rendering** for the Persian Scholarly Transliterator project, its evaluation benchmarks, and its governance framework.

During human governance review of Phase 4.6B, a conceptual ambiguity was identified: earlier adjudication and validation terminology conflated linguistic/scholarly canonical reading with publication-level presentation transformations (such as diacritic stripping, title casing, IJMES Word List overrides, and established English spellings).

This document establishes the authoritative contract separating these layers.

> **Governing Principle:** This contract defines the relationship between canonical truth and rendering. It does not determine the exact scholarly canonical strings of the pending benchmark re-audit.

---

## Conceptual Architecture

The transliteration pipeline operates in two distinct, sequential stages:

```text
Persian Source
      |
      v
Reading / Identity Resolution
      |
      v
Scholarly Canonical Transliteration
      |
      v
Rendering Profile
      |
      +--> IJMES publication rendering (e.g. no-diacritic proper names, Word List forms)
      +--> Title / Bibliographic rendering (e.g. title capitalization, diacritic policy)
      +--> Other future publication / citation style policies
```

### Core Invariant Rules

1. **This contract defines the relationship between canonical truth and rendering. It does not determine the exact scholarly canonical strings of the pending benchmark re-audit.**
2. **Rendering transforms presentation; it does not silently redefine scholarly canonical truth.**
3. **A benchmark must not call a publication rendering "canonical" when it is actually evaluating presentation behavior.**
4. **Scholarly canonical truth must be established independently of any runtime profile limitations.**

---

## 1. Scholarly Canonical Transliteration

The **Scholarly Canonical Transliteration** is the rigorous, linguistic representation of the supplied Persian source text.

### Properties & Principles

- **Source-Faithful:** It directly transliterates the exact Persian input string supplied, never substituting an alternate epithet, honorific, formal title, or related entity name.
- **Preserves Full Scholarly Diacritics:**
  - Long-vowel macrons (`ā`, `ī`, `ū`);
  - Consonantal under-dots and macrons (`ḥ`, `ṣ`, `ṭ`, `ẓ`, `ż`, `kh`, `dh`, `sh`, `gh`, `ch`, `zh`, etc.);
  - Explicit representation of ʿayn (`ʿ`) and hamza (`ʾ`) where linguistically and scholarly appropriate;
  - Morphological boundary hyphens (e.g. plural `-hā`, possessive enclitics, compound stems);
  - Systematic izāfat and linker representation (consonant-final `-i`, post-vocalic `-yi`).
- **Represents Linguistic Truth:** It records the established phonological and lexical reading of the Persian expression.
- **Independent of Publication Conventions:** It does not strip diacritics, apply Anglicized spellings, or alter morphology for specific journal house styles.
- **Admits Legitimate Ambiguity:** Where the unvocalized Persian surface cannot safely support a single authoritative reading, the canonical state must remain `REVIEW_REQUIRED` or `UNRESOLVED`.

---

## 2. Publication Rendering

The **Publication Rendering** is a style-dependent, deterministic presentation transformation applied to an already established scholarly canonical reading under a named presentation policy.

### Properties & Permissible Transformations

- **Diacritic Modification:** Removal of ordinary diacritics from proper nouns, places, institutions, or titles where mandated by a publication guide (e.g. IJMES proper-name policy).
- **Capitalization:** Title case capitalization for book and article titles, preserving lowercase structural prefixes (`al-`, `wa-l-`) and minor conjunctions/prepositions (`va`, `dar`, `az`).
- **Lexical Word List Exceptions:** Specific publisher-prescribed lexical forms where explicitly mandated (e.g. publisher word-list spellings; illustrative only, non-authoritative pending benchmark re-audit).
- **Established English Presentation:** Widely recognized English conventional spellings **only where explicitly permitted and scoped by the active rendering policy** (illustrative only, non-authoritative pending benchmark re-audit).
- **Bibliographic / Citation Formatting:** Field-specific formatting required for structured export (CSV, RIS, BibTeX).

### Prohibited Rendering Behaviors

- Rendering must **not** silently resolve lexical or morphological ambiguity.
- Rendering must **not** invent or substitute a different underlying personal name, title, or entity identity.
- Rendering must **not** overwrite or erase the underlying canonical scholarly reading in the audit ledger.

---

## 3. Separation of Scholarly Authorities

| Authority Type | Source Examples | Authoritative Scope | Non-Authoritative Scope |
| :--- | :--- | :--- | :--- |
| **Reading & Identity Authority** | Encyclopaedia Iranica, Dehkhoda, Mo'in, Academic Grammars, VIAF, ISNI, GeoNames | Persian lexical reading, vocalization, historical identity, morphological structure | IJMES journal presentation, English house style |
| **Rendering & Presentation Authority** | Cambridge IJMES Guide, IJMES Transliteration Chart, IJMES Word List | Publication diacritic policy, title casing, publisher-specific word list exceptions | Linguistic Persian reading, phonetic vowel substitution |

A publication-style string from a journal or catalog is **not** automatically the scholarly canonical string.

---

## 4. Benchmark & Governance Implications

### Current Draft Adjudication Status

The current 108-case Phase 4.6B adjudication (`validation/review/adjudication.v1.json`, version `1.0.2-draft`) contains benchmark cases where recorded `canonical` fields reflect publication-level rendering rather than pure scholarly canonical transliteration (e.g. proper names without diacritics, Anglicized place names, Word List forms).

As a result:
1. **Adjudication Remains DRAFT:** Status remains `EXPERT_ADJUDICATED_PENDING_HUMAN_SIGNOFF`.
2. **Human Governance Sign-Off is PAUSED:** Formal human sign-off cannot occur until the benchmark data and schemas are systematically updated to separate canonical gold from rendering gold.
3. **Engine Evaluation Remains BLOCKED:** No evaluation of the 108-case benchmark against the transliteration engine will occur (`engineEvaluationPerformed = false`).
4. **No Silent Data Rewrites in this PR:** This PR establishes the contract only. Benchmark data re-audit and schema alignment belong in subsequent dedicated PRs.

---

## 5. Primary Safety Invariant

$$\text{FALSE\_AUTHORITATIVE} = 0$$

An authoritative claim must represent validated truth. The transliterator must always prefer `REVIEW_REQUIRED` or `UNRESOLVED` status over emitting a false or unverified authoritative canonical transliteration.
