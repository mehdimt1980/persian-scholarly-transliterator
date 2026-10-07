# Kaikki / Wiktionary Persian Lexical Acquisition Pipeline

## 1. Overview and Purpose

The Persian Scholarly Transliterator project uses a multi-source evidence architecture to discover Persian lexical forms and their attested romanizations.

**Phase 7A** establishes the **Kaikki / English Wiktionary Lexical Acquisition Pilot**. The goal is to ingest community lexicographic datasets at scale to dramatically increase lexical evidence coverage for Persian scholarly transliteration.

### Core Scholarly Invariant

```text
External Observation ≠ Lexical Candidate ≠ Human Decision ≠ Authoritative Lexicon Entry
```

Acquiring external data creates **more evidence**, NOT **more authority**:

```text
Kaikki / Wiktextract Persian JSONL
               ↓
       Line-oriented streaming
               ↓
       Persian record filtering
               ↓
    Exact observation extraction (LOCAL scheme)
               ↓
     Linguistic metadata preservation (IPA, POS, lemmas)
               ↓
    Group by normalized Persian form
               ↓
    Non-authoritative LexicalCandidate synthesis
               ↓
       ZERO automatic authority
```

---

## 2. Source Provenance and Attribution

### Upstream Provenance Chain

1. **Wiktionary**: English Wiktionary (`en.wiktionary.org`) Persian lexical entries (`lang_code = "fa"`).
2. **Wiktextract**: Developed by Tatu Ylonen, an automated parser and extractor converting Wiktionary dumps to structured JSON.
3. **Kaikki.org**: Data distribution endpoint providing pre-extracted JSONL dumps by language.

### Licensing and Intellectual Property

- **Wiktionary Content**: English Wiktionary text is dual-licensed under the **Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0)** and the **GNU Free Documentation License (GFDL)**. For terms, see [Wiktionary:Copyrights](https://en.wiktionary.org/wiki/Wiktionary:Copyrights) and [CC BY-SA 4.0 Legal Code](https://creativecommons.org/licenses/by-sa/4.0/).
- **Wiktextract / Kaikki Data**: Distributed under the same upstream Wiktionary licensing terms. Tooling copyright © 2018–2024 Tatu Ylonen.
- **Non-Vendoring Policy**: Full bulk datasets (e.g. 80MB+ JSONL files) are **never** committed or vendored directly into this Git repository. Only tiny synthetic and representative test fixtures are included under `src/domain/evidence/kaikki/fixtures/`.
- **Non-Authority Representation**: The project explicitly does **not** represent unadjudicated Wiktionary data as reviewed scholarly authority.

### Scholarly Citation

When citing or publishing research utilizing lexical evidence acquired via Wiktextract / Kaikki, use the official citation supplied by Kaikki:

```text
Tatu Ylonen,
“Wiktextract: Wiktionary as Machine-Readable Structured Data,”
Proceedings of the Thirteenth Language Resources and Evaluation Conference (LREC 2022),
Marseille, France, 20–25 June 2022,
pp. 1317–1325.
```

---

## 3. Architecture and Invariants

### Zero Runtime Transliteration Output Change

Phase 7A introduces evidence acquisition infrastructure only:
- Scholarly runtime transliteration output change = **ZERO**.
- Default authoritative lexicon (`src/data/lexicon.ts`) mutations = **ZERO**.
- Automatically promoted entries = **ZERO**.
- Automatically resolved unknown tokens = **ZERO**.

### Scalable Streaming Architecture

To support large datasets without out-of-memory errors:
- Streaming JSONL parser reads line by line from `NodeJS.ReadableStream` or local file path.
- `KaikkiAcquisitionAccumulator` aggregates metrics incrementally per normalized lexical group without requiring all raw observation objects to be held in memory.
- Malformed JSON rows fail isolated to that specific line without aborting the batch (unless `--strict` mode is explicitly requested).
- Malformed row counts are reported in the acquisition summary.

### Persian Filtering Criteria

- `lang_code === "fa"`
- Non-empty `word` containing valid Persian/Arabic unicode script characters (`\u0600-\u06FF`, `\uFB50-\uFDFF`, `\uFE70-\uFEFF`).
- Punctuation-only, symbol-only, and isolated combining-mark records are safely rejected.
- Historical, Classical, Dari, and regional Persian entries are preserved.

### Romanization Extraction and Scheme Classification

- Every valid romanization in `forms` (tagged `romanization`) is extracted as an independent `LexicalEvidence` record.
- **No First-Wins Truncation**: Multiple romanizations for a single word are all preserved.
- **Per-Romanization Tag Isolation**: Tags for Romanization A remain attached to Romanization A and are not merged into entry-global tags.
- **Stable Field Locators**: `sourceField` references the actual index in the source `forms` array (e.g. `forms[3]`).
- **Exact Romanization Preservation**: Observed romanization strings are never rewritten (e.g. `goftâr` is preserved as `goftâr` without forced conversion to `guftār` or IJMES).
- **Conservative Scheme Labeling**: All Wiktionary romanizations are assigned the `LOCAL` scheme. They are not assumed to follow IJMES, ALA-LC, or IRANICA.

### Candidate Synthesis by Normalized Persian Form

- Raw observations preserve their exact external spelling (`كتاب` vs `کتاب`).
- Candidates group all supporting evidence sharing the same project-normalized Persian string into a single `LexicalCandidate`.
- Normalization collisions remain reported and traceable.
- `proposedCanonical` is set to `null` and status is set to `UNREVIEWED` with zero automatic promotion.

### Linguistic Metadata Preservation

Linguistic signals are preserved alongside evidence in typed metadata structures (`KaikkiEvidenceMetadata`):
- **Source Record Identity**: Includes word, language, POS, `etymology_number`, and `head_nr` to prevent cross-etymology collisions.
- **Sense Identifiers**: Captures both singular `id` and Wiktextract `senseid` arrays without inventing missing identifiers.
- **Lemma Status**: Classified as `LEMMA`, `NON_LEMMA_FORM`, or `UNKNOWN_LEMMA_STATUS`.
- **Lemma Relations**: `form_of` and `alt_of` targets (e.g. `فهرست‌ها` -> `فهرست`) are preserved for future morphology indexing.
- **IPA Observations**: Full phonetic transcriptions with dialect/variety tags (e.g. `Iranian-Persian`, `Classical-Persian`, `Dari`, `Tehrani`) and notes are preserved.

### Read-Only Lexicon Overlap and Collision Analysis

- Compares extracted normalized forms against `DEFAULT_LEXICON_REPOSITORY` in a strictly read-only manner.
- Detects normalization collisions where multiple distinct raw spellings collapse to the same normalized Persian string.

---

## 4. CLI Usage and Operations

### Running the Pilot CLI

To run acquisition on the built-in sample fixture:

```bash
npm run acquire:kaikki
```

To run against an external downloaded JSONL file:

```bash
npm run acquire:kaikki -- --input /path/to/kaikki.org-dictionary-Persian.jsonl --limit 10000 --output report.json
```

### Supported CLI Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--input`, `-i` | Path to Kaikki / Wiktextract JSONL file | Built-in test fixture |
| `--stdin` | Read JSONL stream from standard input | false |
| `--limit`, `-l` | Maximum valid Persian records to process | Unlimited |
| `--offset`, `-o` | Valid Persian records to skip before processing | 0 |
| `--output` | File path to write machine-readable JSON report | None |
| `--strict` | Fail closed immediately on any malformed JSON row | false |
| `--only-lemmas` | Ingest only primary lemma entries (excludes `NON_LEMMA_FORM` and `UNKNOWN_LEMMA_STATUS`) | false |
| `--json` | Output machine-readable JSON to stdout | false |
| `--help`, `-h` | Display command help | - |

### Example Summary Output

```text
================================================================
Kaikki Persian Acquisition Pilot
================================================================
Rows read:                                 10
Malformed rows:                             1
Valid Persian records:                      7
Distinct Persian forms:                     6
Distinct normalized forms:                  6
Lemma records:                              5
Non-lemma forms:                            1
Unknown lemma status records:               0
Entries with romanization:                  5
Romanization observations:                  8
Forms with 1 romanization:                  3
Forms with >1 romanization:                 2
Forms with no romanization:                 1
Forms with IPA:                             4
Existing project lexicon:                   2
New lexical forms:                          4
Candidate records generated:                6
Normalization collisions:                   0
Automatically promoted:                     0
Authoritative lexicon changes:              0
================================================================
```
