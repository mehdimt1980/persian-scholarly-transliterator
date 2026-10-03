# Batch Bibliography Processing & Scholarly Metadata

Phase 4 introduces a source-preserving, human-reviewable batch bibliography processing pipeline built on top of the deterministic transliteration engine.

```text
structured CSV bibliography
→ canonical bibliography records
→ field-level Persian script detection
→ field-level deterministic transliteration & policy
→ field-level review / assisted review (Phase 2C / 3)
→ record-level readiness (READY / REVIEW_REQUIRED / INVALID)
→ batch-level readiness
→ source-preserving CSV export / Final scholarly CSV / RIS / BibTeX
```

---

## Core Invariant

```text
source bibliographic metadata
≠
automatic transliteration
≠
AI suggestion
≠
human-reviewed final metadata
```

Source metadata is never overwritten or mutated. Transliterated values and human decisions reside in separate derived structures.

---

## Canonical Record Schema

A canonical `BibliographyRecord` represents standard scholarly citation metadata:

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique record ID (provided or deterministically generated) |
| `type` | `BibliographyRecordType` | `BOOK`, `JOURNAL_ARTICLE`, `BOOK_CHAPTER`, `THESIS`, `OTHER` |
| `title` | `string` | Primary title (**required**) |
| `containerTitle` | `string?` | Book title, journal title, or publication container |
| `authors` | `BibliographyCreator[]` | List of literal author names (`literal: string`) |
| `editors` | `BibliographyCreator[]` | List of literal editor names |
| `translators` | `BibliographyCreator[]` | List of literal translator names |
| `year` | `string?` | Publication year / date |
| `publisher` | `string?` | Publisher name |
| `place` | `string?` | Publication place / city |
| `volume` | `string?` | Journal/series volume |
| `issue` | `string?` | Journal issue number |
| `pageStart` | `string?` | Starting page |
| `pageEnd` | `string?` | Ending page |
| `doi` | `string?` | DOI identifier |
| `url` | `string?` | Publication URL |
| `isbn` | `string?` | ISBN |
| `issn` | `string?` | ISSN |
| `language` | `string?` | Language code / string |
| `notes` | `string?` | Annotations / notes |
| `passthrough` | `Record<string, string>` | Preservation map for unknown custom CSV columns |

---

## Creator Model: No Guessed Surname Structure

In academic Persian studies, names can exhibit complex honorifics, nisbas, patronymics, and multi-part structures (e.g. `محمدعلی همایون کاتوزیان`).
Phase 4 **never infers or guesses** given name vs. family name from Persian text. Creator names are stored and processed as literal strings. In CSV, creators are separated by `|` (e.g. `حسن پیرنیا | عباس اقبال`).

---

## Field-Level Transliteration Policy

Only specific fields are sent to the transliteration engine, each with an explicit IJMES profile:

1. **`title`**: Profile `ijmes_title` (title casing, vowel diacritics removed per IJMES title standard).
2. **`containerTitle`**: Profile `ijmes_title`.
3. **`authors[i].literal`**: Profile `ijmes_full` (full scholarly diacritics: `ā`, `ī`, `ū`, `ḥ`, `ṣ`, etc.).
4. **`editors[i].literal`**: Profile `ijmes_full`.
5. **`translators[i].literal`**: Profile `ijmes_full`.
6. **`publisher`**: Profile `ijmes_full`.
7. **`place`**: Profile `ijmes_full`.

Non-transformable fields (`year`, `volume`, `issue`, `pageStart`, `pageEnd`, `doi`, `url`, `isbn`, `issn`, `language`, `notes`) are never sent to the engine.

---

## Script Detection & Non-Persian Passthrough

Before transliteration, every transformable field is checked for Arabic/Persian script characters (`containsArabicScript`).
- If a field contains no Arabic script (e.g. `title = "State and Society in Iran"`), it is marked as `status: 'PASSTHROUGH'` with `requiresTransliteration: false` and `finalText = sourceText`.
- It is never mutated by the Persian rule engine.

---

## Field-Scoped Review Decisions

To prevent decisions on one record or field from leaking to another record with identical Persian text, batch review decisions are scoped by:

```text
recordId + ":" + fieldPath + ":" + issueId
```

A decision for `record_A / title / کرم` will **never** automatically resolve `record_B / title / کرم`.

---

## Record & Batch Readiness

- A record is `READY` if and only if every Persian transformable field has `transliterationResult.copyable === true` and required metadata (title) is valid.
- If any transformable field is ambiguous or unresolved, the record is marked `REVIEW_REQUIRED`.
- Batch summary tracks: `total`, `ready`, `reviewRequired`, `invalid`.
- Export modes enforce readiness:
  - `STRICT_ALL`: Fails closed if any record is not ready.
  - `READY_ONLY`: Exports only ready records and returns a full diagnostic report of skipped records.
