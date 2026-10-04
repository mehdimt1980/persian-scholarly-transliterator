# Adjudication Audit Log

This log records substantive post-draft scholarly checks performed before human sign-off.

## Status

The primary case-by-case adjudication is complete, but the corpus is still `EXPERT_ADJUDICATED_PENDING_HUMAN_SIGNOFF`.

No decision in this audit was made by consulting current transliteration-engine output.

## Confirmed corrections

### `cand-term-001` — نوسازی

Draft: `nūsāzī`

Audited: `nawsāzī`

Reason: the written نو contains the Persian diphthong represented in full scholarly IJMES transliteration as `aw/au`, not long `ū`. Cambridge scholarly indexing independently attests `nawsāzī` in a Persian modernization context.

### `cand-term-012` — روشنفکری

Draft: `rushanfikrī`

Audited: `rawshanfikrī`

Reason: independent scholarly Persian usage attests the stem `rawshanfikr`; written روشن is not safely derived by mechanically replacing modern Persian `o/e` with IJMES `u/i`.

### `cand-pers-004` — ملک‌الشعرای بهار

Draft: `Mohammad-Taqi Bahar`

Audited: `Malek al-Shoʿara Bahar`

Reason: gold output must faithfully transliterate the supplied source string. Substituting the person's different personal name محمدتقی بهار changes the input rather than transliterating it. Cambridge scholarly bibliography independently uses `Malek al-Shoʿara Bahar`; ordinary diacritics are removed under IJMES personal-name policy while ʿayn is retained.

### `cand-inst-003` — کتابخانه ملی ایران

Draft: `Kitabkhana-i Milli-i Iran`

Audited: `Kitabkhana-yi Milli-yi Iran`

Reason: the izafat hosts `khāna` and `millī` are vowel-final; post-vocalic Persian izafat is represented as `-yi` in scholarly IJMES-derived practice.

### `cand-book-001` — تاریخ بیداری ایرانیان

Earlier draft: `Tarikh-i Bidari-i Iraniyan`

Audited: `Tarikh-i Bidari-yi Iraniyan`

Reason: `Bīdārī` is vowel-final, so the following Persian izafat is post-vocalic `-yi`. Independent catalog transcription establishes the lexical reading `Tārīkh-i bīdārī-i/yi Īrāniyān`; IJMES title presentation removes ordinary diacritics.

### `cand-book-005` — سفرنامه ناصرخسرو

Draft: `Safarnama-i Nasir-i Khusraw`

Audited: `Safarnama-yi Nasir-i Khusraw`

Reason: `Safarnāma` is vowel-final; the following izafat is post-vocalic `-yi`.

### `cand-book-009` — سووشون

Initial draft: `Savushun`

Audited: `Suvashun`

Reason: Persian-title transliteration must remain distinct from the English publication/translation title `Savushun`; scholarly evidence attests `Suvašun` / `Sūvashūn`, with IJMES title presentation removing diacritics.

### `cand-book-010` — چشم‌هایش

Initial draft: `Chashmhayish`

Audited: `Chashmhayash`

Reason: Encyclopaedia Iranica independently attests `Čašmhāyaš`.

### `cand-mrp-002` — نامه‌های

Draft: `nāma-hā-i`

Audited: `nāma-hā-yi`

Reason: the written sequence `های` explicitly contains the post-vocalic yā linker after plural `-hā`; scholarly IJMES practice uses forms such as `-hā-yi`.

### `cand-mrp-010` — گزارش‌های

Draft: `guzārish-hā-i`

Audited: `guzārish-hā-yi`

Reason: same explicit plural + post-vocalic izafat sequence `های`.

### `cand-izf-004` — خانه پدری

Draft: `khāna-i pidarī`

Audited: `khāna-yi pidarī`

Reason: `khāna` is vowel-final; its izafat is post-vocalic `-yi`.

## Confirmed high-risk cases

- `مشروطه‌خواهی` → `mashrūṭih-khwāhī`: independent constitutional-history scholarship supports the `mashrūṭih/mashrūṭah` stem and `khwāh` derivation; IJMES Persian full transliteration retains the scholarly consonant/vowel distinctions.
- `کشورمندی` → `kishvarmandī`: scholarly usage independently attests `kishvar`; derivational `-mandī` is retained.
- `دادگستری` → `dādgustarī`: authority/catalog usage independently supports the reading.
- `میهن‌پرستی` → `mīhan-parastī`: retained as full scholarly IJMES transliteration; pronunciation-oriented systems are not rendering authority.
- `حسینیه` → `ḥusaynīyih`: retained under the Persian IJMES nisba-ending policy rather than Iranica's pronunciation-oriented `ḥosaynīya`.
- `دیدگاه‌هایشان` → `dīdgāh-hā-yi-shān`: plural `-hā`, explicit post-vocalic linker `-yi`, and possessive `-shān` are kept distinct.
- `خانه‌ات` → `khāna-at`: preserved as a gold scholarly form independently of current runtime support; runtime limitations are evaluated later rather than used to rewrite gold truth.

## Ambiguity audit

The following remain context-dependent and therefore gold `REVIEW_REQUIRED`:

- `مهر` — `mihr` / `muhr`
- `سر` — `sar` / `sirr`; the earlier unsupported reference to `sur` was removed
- `گل` — `gul` / `gil`
- `شور` — `shūr` / `shawr`
- `روی` — `rūy` / `ravī`

The following acquisition-ambiguity cases collapse to a single material IJMES rendering and therefore remain gold `FINAL`:

- `شیر` → `shīr`
- `باد` → `bād`
- `بار` → `bār`
- `داد` → `dād`
- `گوش` → `gūsh`
- `راست` → `rāst`
- `گاو` → `gāv`

Semantic polysemy alone is not sufficient reason to block when the transliteration is the same.

## Authority boundary

- Cambridge IJMES guide/chart/Word List govern rendering policy.
- Phase 4.6A sources govern attested source text, reading, identity, and bibliographic identity.
- Iranica romanization is evidence, not IJMES rendering authority.
- Current engine output, lexicon coverage, and resolver suggestions were not used to choose adjudicated gold outputs.
