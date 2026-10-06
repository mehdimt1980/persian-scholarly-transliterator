# Library of Congress Lexical Evidence Connector (Phase 5B)

## 1. Overview & Core Invariant

The Library of Congress (LoC) Pilot Evidence Connector provides an automated, source-neutral pipeline for importing bibliographic cataloging observations into the project's evidence repository.

### Fundamental Principle
```text
Library of Congress Record
           ≠
    LexicalCandidate
           ≠
Authoritative Lexicon Entry
```

External observations from the Library of Congress catalog represent external cataloging practice (specifically ALA-LC Persian romanization). They are **never** authoritative merely because they originate from a major national library.

- **Evidence Only:** Observations are stored as `LexicalEvidence` with `romanizationScheme: 'ALA_LC'` and `sourceType: 'LIBRARY_CATALOG'`.
- **Zero Lexicon Contamination:** The connector has zero direct path to `LexiconRepository` and never alters authoritative transliteration or frozen benchmark data.
- **No ALA-LC → IJMES Conversion:** Transliteration mapping is strictly deferred to Phase 5D.

---

## 2. Machine-Readable Interface & Protocol

The connector interfaces with the official machine-readable services of the Library of Congress:

1. **Endpoint:** Search/Retrieve via URL (SRU v1.1) service on the Library of Congress Database (LCDB):
   - Production Default Base URL: `https://lx2.loc.gov/sru/lcdb`
   - Reference: [Library of Congress Z39.50/SRU Gateway](https://www.loc.gov/standards/z3950/lcserver.html)
   - Production requests require HTTPS. Transport mocks remain injectable for offline deterministic testing.
2. **Schema:** `recordSchema=marcxml` with `recordPacking=xml`.
3. **Lookup by LCCN:** Queries using Contextual Query Language (CQL): `bath.lccn="{lccn}"` with `maximumRecords=1&startRecord=1`.
4. **Bounded SRU Search:** Queries using arbitrary CQL with bounded page sizes (`maximumRecords <= 20`).
5. **No HTML Scraping:** Strictly disallows human web interface scraping.

---

## 3. Pure MARCXML Parsing & SRU Response Validation

MARCXML records and SRU responses are parsed using a pure TypeScript, zero-dependency parser ([`xmlParser.ts`](file:///d:/persian-scholarly-transliterator/src/domain/evidence/loc/xmlParser.ts)):

- **XXE Prevention:** Implements a direct character/regex scanner with zero external entity resolution, eliminating XML External Entity (XXE) attack vectors.
- **Entity Decoding:** Automatically decodes XML predefined entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`) and numeric character entities (`&#x1E25;` $\rightarrow$ `ḥ`, `&#x6AF;` $\rightarrow$ `گ`, `&#x200C;` $\rightarrow$ ZWNJ).
- **Envelope & Diagnostic Validation:**
  - Explicitly inspects `numberOfRecords`.
  - Detects and parses SRU diagnostics (`<zs:diagnostics>`), surfacing `LocSruDiagnosticError` with diagnostic URI, message, and detail.
  - Distinguishes valid zero-result queries (`numberOfRecords == 0`) from protocol failures and malformed payloads.
  - Verifies that `fetchLccn` returns a record whose `001`/`010` identifier matches the requested LCCN.
  - Rejects truncated or malformed XML by throwing `MarcXmlParseError` rather than silently returning partial or empty records.

---

## 4. MARC Field 880 & Subfield $6 Linkage Algorithm

In MARC 21, non-Latin script data (such as Persian in Arabic script) is stored in alternate graphic representation fields (**Tag 880**) linked to their regular Latin-script counterparts via **Subfield `$6`**.

### Linkage Syntax
```text
Regular field:    Tag TTT  |  $6 880-NN
Alternate field:  Tag 880  |  $6 TTT-NN/(script-id)/(orientation)
```
Where:
- `TTT` is the 3-digit associated MARC tag (e.g. `100`, `240`, `245`, `700`).
- `NN` is the 2-digit occurrence number (`01` through `99`).
- `(script-id)/(orientation)` is the script identification (e.g. `(3/r` for Arabic right-to-left script).

### Linkage Classification & Evidence Extraction Semantics

| Linkage Status | Condition | Evidence Extraction Behavior |
| :--- | :--- | :--- |
| `MATCHED` | Regular field and 880 field match on `(associatedTag, occurrenceNumber)` | Extracts linked paired observation (`observedText` + `observedRomanization`). |
| `OCCURRENCE_00` | 880 field with occurrence number `00` (`$6 TTT-00`) | Extracts Persian-only observation with `observedRomanization: null`. |
| `UNMATCHED_NONZERO` | Regular or 880 field has nonzero occurrence without valid counterpart | **Fails closed.** Suppresses lexical evidence extraction; linkage diagnostic is inspectable. |
| `AMBIGUOUS_DUPLICATE` | Multiple regular or 880 fields share the same linkage key | **Fails closed.** Suppresses lexical evidence extraction; does not arbitrarily select one field. |
| `MALFORMED_LINKAGE` | Subfield `$6` syntax is malformed | **Fails closed.** Suppresses lexical evidence extraction. |

---

## 5. Supported MARC Field Whitelist

Phase 5B defines a deliberate, high-value field whitelist:

| MARC Tag | Subfield | Entity Type | Description |
| :--- | :--- | :--- | :--- |
| `100` | `$a` | `PERSON` | Main Entry — Personal Name |
| `110` | `$a` | `ORGANIZATION` | Main Entry — Corporate Name |
| `111` | `$a` | `OTHER` | Main Entry — Meeting / Conference Name |
| `130` | `$a` | `WORK` | Main Entry — Uniform Title |
| `240` | `$a` | `WORK` | Uniform Title |
| `245` | `$a` | `TITLE` | Title Statement — Title proper |
| `245` | `$b` | `TITLE` | Title Statement — Remainder of title / Subtitle |
| `246` | `$a` | `TITLE` | Varying Form of Title |
| `600` | `$a` | `PERSON` | Subject Added Entry — Personal Name |
| `610` | `$a` | `ORGANIZATION` | Subject Added Entry — Corporate Name |
| `630` | `$a` | `WORK` | Subject Added Entry — Uniform Title |
| `650` | `$a` | `PHRASE` | Subject Added Entry — Topical Term |
| `651` | `$a` | `PLACE` | Subject Added Entry — Geographic Name |
| `700` | `$a` | `PERSON` | Added Entry — Personal Name |
| `710` | `$a` | `ORGANIZATION` | Added Entry — Corporate Name |
| `730` | `$a` | `WORK` | Added Entry — Uniform Title |

Administrative subfields (dates, relator codes, pagination, LCCNs, ISBNs) are excluded from lexical evidence extraction.

---

## 6. Persian Language & Script Validation

To prevent non-Persian records or corrupted linkages from entering the repository:

1. **Record-Level Language Evidence:**
   - Fixed-field `008` (bytes 35-37) must equal `per`.
   - Content language subfields in `041` (`$a` primary/content language, `$d` sung/spoken, `$e` libretto, `$j` subtitles) or an unambiguous `546$a` language note.
   - **Translation vs. Content Distinction:** Subfield `041$h` designates original source language before translation. A record with `041$a=ara` and `041$h=per` represents an Arabic translation of a Persian work; its cataloged content is Arabic and it is strictly rejected.
   - Records lacking affirmative Persian content language (e.g. pure Arabic `ara`, Ottoman Turkish `ota`) are conservatively skipped.
2. **Script Direction & Distinction:**
   - The alternate graphic field must contain actual Arabic/Persian script characters (`containsArabicScript(text) === true`).
   - Arabic-script text is not classified as Persian based solely on Unicode script; affirmative language metadata is mandatory.
   - The regular field must contain Latin romanization characters.
   - Alternate scripts in Cyrillic, Hebrew, CJK, etc. are rejected.
   - Pairs where both sides are Arabic or both sides are Latin are rejected.

---

## 7. Exact Raw Source Preservation

Observations are extracted with absolute fidelity to the source catalog record:
- Unicode characters, ZWNJ (`\u200C`), combining macrons (`ā`, `ī`, `ū`), underdots (`ḥ`, `ṣ`, `ṭ`, `ẓ`), and turned commas (`ʻ`) are preserved exactly.
- Strings are **not** lowercased, title-cased, trimmed lossily, or stripped of terminal cataloging punctuation.

---

## 8. Network Safety & Bounded Transport

The HTTP client ([`client.ts`](file:///d:/persian-scholarly-transliterator/src/domain/evidence/loc/client.ts)) incorporates production safeguards:

- **HTTPS Enforcement:** Production requests are restricted to HTTPS.
- **Bounded Page Limits:** Caps SRU queries to `maximumRecords <= 20`.
- **Safety Timeouts:** Default 10-second timeout via `AbortController`.
- **HTTP 429 Handling:** Detects HTTP 429 Rate Limiting responses, throws `LocRateLimitError`, and surfaces `Retry-After` header values.
- **Exponential Backoff:** Retries transient network/5xx errors (up to 2 retries) with exponential delay.
- **User-Agent Identification:** Complies with LoC guidelines by sending descriptive identification (`PersianScholarlyTransliterator/0.2.0 (research pilot; mailto:mehdi.mt@gmail.com)`).
- **Scope Note:** The pilot client provides bounded request execution and transient error recovery. High-throughput crawling or distributed rate scheduling is out of scope for the pilot connector.

---

## 9. Deterministic Offline Fixtures

Unit and regression tests run 100% offline using verified, genuine Library of Congress records:

- [`2016404617.marcxml.xml`](file:///d:/persian-scholarly-transliterator/src/domain/evidence/loc/fixtures/2016404617.marcxml.xml): Saʻdī manuscript of *Kitāb-i Gulistān* (LCCN 2016404617).
- [`2002341405.marcxml.xml`](file:///d:/persian-scholarly-transliterator/src/domain/evidence/loc/fixtures/2002341405.marcxml.xml): Medical treatise *Mīzān al-ṭibb* by Muḥammad Akbar Shāh Arzānī (LCCN 2002341405).
- [`2025364468.marcxml.xml`](file:///d:/persian-scholarly-transliterator/src/domain/evidence/loc/fixtures/2025364468.marcxml.xml): Illustrated lithograph serials *Dawrah-ʼi rūznāmahʼhā-yi Sharaf va Sharāfat* (LCCN 2025364468).
- [`syntheticEdgeCases.marcxml.xml`](file:///d:/persian-scholarly-transliterator/src/domain/evidence/loc/fixtures/syntheticEdgeCases.marcxml.xml): Synthetic edge cases for testing occurrence mismatches, unlinked occurrence 00 fields, ambiguous duplicate linkages, malformed `$6` subfields, translation source `041$h` exclusion, misleading `546` notes, Cyrillic script, and missing language metadata.

---

## 10. Operator Pilot CLI

To inspect a Library of Congress catalog record and observe non-authoritative evidence extraction:

```bash
# Query live Library of Congress SRU by LCCN:
npm run evidence:loc:pilot -- --lccn 2016404617

# Parse an offline fixture:
npm run evidence:loc:pilot -- --fixture src/domain/evidence/loc/fixtures/2016404617.marcxml.xml
```

---

## 11. Known Limitations & Next Phases

- **Phase 5C (Alignment & Candidate Extraction):** Will handle multi-word token alignment and candidate synthesis.
- **Phase 5D (Scheme Normalization):** Will handle deterministic ALA-LC to IJMES transliteration mapping.
- **Phase 5E (Human Adjudication):** Will provide human review workflows for promoting candidates to authoritative lexicon entries.

