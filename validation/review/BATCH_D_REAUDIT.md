# Phase 4.6B — Blind V2 Re-Audit, Batch D

## Status

- **Batch:** D — Book titles
- **Scope:** 12 `BOOK_TITLE` cases
- **Reviewer:** OpenAI GPT-5.6 Sol
- **Reviewer type:** `AI_SPECIALIST`
- **Review date:** 2026-10-05
- **Outcome:** 12 `FINAL`; 0 `REVIEW_REQUIRED`; 0 `UNRESOLVED`
- **Worklist after Batch D:** 96 adjudicated / 12 pending
- **Human governance sign-off:** pending (`humanSignoff = null`)
- **Gold:** not frozen
- **Engine blindness:** `engineEvaluationPerformed = false`

## Method

Reading evidence was taken from the Phase 4.6A acquisition authorities (Dehkhoda, Steingass, Encyclopaedia Iranica) and, where a title construction required clarification, independent scholarly bibliographic evidence. Iranica romanization is reading evidence rather than rendering authority. Canonical strings use the project IJMES-based Persian system and preserve auditable morphology/izafat. `ijmes_title` rendering independently applies current IJMES title policy: English capitalization, no ordinary diacritics, preservation of ʿayn/hamza, and Persian IJMES spellings.

## Decisions

| ID | Persian source | Scholarly canonical | `ijmes_title` rendering |
|---|---|---|---|
| `cand-book-001` | تاریخ بیداری ایرانیان | `Tārīkh-i Bīdārī-yi Īrānīyān` | `Tarikh-i Bidari-yi Iraniyan` |
| `cand-book-002` | سیاست‌نامه | `Siyāsat-nāma` | `Siyasat-nama` |
| `cand-book-003` | قابوس‌نامه | `Qābūs-nāma` | `Qabus-nama` |
| `cand-book-004` | مرزبان‌نامه | `Marzbān-nāma` | `Marzban-nama` |
| `cand-book-005` | سفرنامه ناصرخسرو | `Safarnāma-yi Nāṣir-i Khusraw` | `Safarnama-yi Nasir-i Khusraw` |
| `cand-book-006` | کلیله و دمنه | `Kalīla va Dimna` | `Kalila va Dimna` |
| `cand-book-007` | گلستان | `Gulistān` | `Gulistan` |
| `cand-book-008` | بوستان | `Būstān` | `Bustan` |
| `cand-book-009` | سووشون | `Savūshūn` | `Savushun` |
| `cand-book-010` | چشم‌هایش | `Chashm-hā-yash` | `Chashm-ha-yash` |
| `cand-book-011` | حاجی آقا | `Ḥājī Āqā` | `Haji Aqa` |
| `cand-book-012` | زمستان | `Zimistān` | `Zimistan` |

## High-Risk Notes

### تاریخ بیداری ایرانیان
`Tārīkh-i Bīdārī-yi Īrānīyān` converts Iranica-style `ḵ/e` to IJMES `kh/i` and uses the project explicit post-vocalic `-yi` after `Bīdārī`.

### سیاست‌نامه
The reviewed lexical form is `Siyāsat-nāma`, not `Sīyāsat-nāma`. The initial vowel is short; `yā` participates in the sequence `siyā-` rather than marking an initial long `ī`.

### سفرنامه ناصرخسرو
The canonical is `Safarnāma-yi Nāṣir-i Khusraw`. The first linker is post-vocalic `-yi`; independent scholarly bibliographic practice also supports internal `Nāṣir-i Khusraw`, so the unwritten Persian izafat inside the name is represented rather than omitted.

### کلیله و دمنه
The Persian title is treated as `Kalīla va Dimna`. Iranica's `Demna` is converted to IJMES Persian short-vowel `i`, while the Persian conjunction in the supplied source is `va`.

### سووشون
The reviewed title reading is `Savūshūn`; scholarly discussion records this as Daneshvar's own preferred form. The publication rendering is `Savushun`.

### چشم‌هایش
The canonical layer preserves productive morphology explicitly as `Chashm-hā-yash`. The title rendering removes ordinary diacritics but does not erase the benchmark's audited morpheme boundaries, yielding `Chashm-ha-yash`.

### گلستان / زمستان
Iranica's `o/e` vocalism is reading evidence, not the project rendering system. IJMES Persian `u/i` yields `Gulistān` and `Zimistān`.

## Governance Result

Batch D is scholarly re-audited but is **not human-approved** and is **not frozen release gold**. Batch E remains fully untouched at this stage. Phase 4.6C remains blocked until all 108 cases are re-audited, consolidated, human-signed, and frozen.
