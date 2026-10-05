# Phase 4.6B — Blind V2 Re-Audit, Batch C

## Status

- **Batch:** C — Named Entities
- **Scope:** 18 `PERSON` + 12 `PLACE` + 6 `INSTITUTION`
- **Reviewer:** OpenAI GPT-5.6 Sol
- **Reviewer type:** `AI_SPECIALIST`
- **Review date:** 2026-10-05
- **Outcome:** 36 `FINAL`; 0 `REVIEW_REQUIRED`; 0 `UNRESOLVED`
- **Governance:** proposed V2 scholarly ground truth only; human sign-off remains pending; gold is not frozen.
- **Engine blindness:** `engineEvaluationPerformed = false`.

## Method

The review followed `REAUDIT_PROTOCOL_V2.md`. Reading/identity evidence comes from the Phase 4.6A authority records (VIAF/ISNI/GeoNames plus Encyclopaedia Iranica). Iranica romanization is treated as reading/identity evidence, not as the rendering authority. Scholarly canonical forms are converted to the project’s IJMES-based Persian system (`i/u`, IJMES consonantal distinctions, explicit Persian izāfat `-i/-yi`).

Publication rendering follows current IJMES proper-name policy: personal names, place names, and organizations are written without ordinary diacritics while retaining ʿayn/hamza where applicable; strongly established English spellings are used for prominent figures and places where the evidence is clear. No English translation is substituted for institution names in this benchmark.

## Persons

| ID | Persian source | Scholarly canonical | Publication rendering |
|---|---|---|---|
| `cand-pers-001` | محمدعلی جمال‌زاده | `Muḥammad-ʿAlī Jamālzāda` | `Mohammad-Ali Jamalzadeh` |
| `cand-pers-002` | صادق هدایت | `Ṣādiq Hidāyat` | `Sadeq Hedayat` |
| `cand-pers-003` | علی‌اکبر دهخدا | `ʿAlī-Akbar Dihkhudā` | `Ali-Akbar Dehkhoda` |
| `cand-pers-004` | ملک‌الشعرای بهار | `Malik al-Shuʿarā-yi Bahār` | `Malek al-Shoʿara Bahar` |
| `cand-pers-005` | جلال آل‌احمد | `Jalāl Āl-i Aḥmad` | `Jalal Al-e Ahmad` |
| `cand-pers-006` | سیمین دانشور | `Sīmīn Dānishvar` | `Simin Daneshvar` |
| `cand-pers-007` | نیما یوشیج | `Nīmā Yūshīj` | `Nima Yushij` |
| `cand-pers-008` | غلامحسین ساعدی | `Ghulām-Ḥusayn Sāʿidī` | `Gholam-Hossein Saʿedi` |
| `cand-pers-009` | پروین اعتصامی | `Parvīn Iʿtiṣāmī` | `Parvin Eʿtesami` |
| `cand-pers-010` | بدیع‌الزمان فروزانفر | `Badīʿ al-Zamān Furūzānfar` | `Badiʿ al-Zaman Foruzanfar` |
| `cand-pers-011` | عبدالحسین زرین‌کوب | `ʿAbd al-Ḥusayn Zarrīnkūb` | `ʿAbd al-Husayn Zarrinkub` |
| `cand-pers-012` | مجتبی مینوی | `Mujtabā Mīnuvī` | `Mojtaba Minovi` |
| `cand-pers-013` | احمد کسروی | `Aḥmad Kasravī` | `Ahmad Kasravi` |
| `cand-pers-014` | ایرج افشار | `Īraj Afshār` | `Iraj Afshar` |
| `cand-pers-015` | هوشنگ ابتهاج | `Hūshang Ibtihāj` | `Hushang Ebtehaj` |
| `cand-pers-016` | سهراب سپهری | `Suhrāb Sipihrī` | `Sohrab Sepehri` |
| `cand-pers-017` | مهدی اخوان ثالث | `Mihdī Akhavān-i Sālis` | `Mehdi Akhavan-Sales` |
| `cand-pers-018` | فروغ فرخزاد | `Furūgh Farrukhzād` | `Forugh Farrokhzad` |

## Places

| ID | Persian source | Scholarly canonical | Publication rendering |
|---|---|---|---|
| `cand-plc-001` | مازندران | `Māzandarān` | `Mazandaran` |
| `cand-plc-002` | خوزستان | `Khūzistān` | `Khuzestan` |
| `cand-plc-003` | آذربایجان | `Āzarbāyjān` | `Azerbaijan` |
| `cand-plc-004` | سیستان و بلوچستان | `Sīstān va Balūchistān` | `Sistan and Baluchestan` |
| `cand-plc-005` | کرمانشاه | `Kirmānshāh` | `Kermanshah` |
| `cand-plc-006` | نیشابور | `Nīshāpūr` | `Nishapur` |
| `cand-plc-007` | تخت جمشید | `Takht-i Jamshīd` | `Persepolis` |
| `cand-plc-008` | پاسارگاد | `Pāsārgād` | `Pasargadae` |
| `cand-plc-009` | دماوند | `Damāvand` | `Damavand` |
| `cand-plc-010` | زاگرس | `Zāgrus` | `Zagros` |
| `cand-plc-011` | زاینده‌رود | `Zāyanda-rūd` | `Zayandeh Rud` |
| `cand-plc-012` | هرمزگان | `Hurmuzgān` | `Hormozgan` |

## Institutions

| ID | Persian source | Scholarly canonical | Publication rendering |
|---|---|---|---|
| `cand-inst-001` | فرهنگستان زبان و ادب فارسی | `Farhangistān-i Zabān va Adab-i Fārsī` | `Farhangistan-i Zaban va Adab-i Farsi` |
| `cand-inst-002` | دانشگاه تهران | `Dānishgāh-i Tihrān` | `Danishgah-i Tihran` |
| `cand-inst-003` | کتابخانه ملی ایران | `Kitābkhāna-yi Millī-yi Īrān` | `Kitabkhana-yi Milli-yi Iran` |
| `cand-inst-004` | مجلس شورای ملی | `Majlis-i Shūrā-yi Millī` | `Majlis-i Shura-yi Milli` |
| `cand-inst-005` | دارالفنون | `Dār al-Funūn` | `Dar al-Funun` |
| `cand-inst-006` | انجمن آثار ملی | `Anjuman-i Āsār-i Millī` | `Anjuman-i Asar-i Milli` |

## High-Risk Policy Notes

### صادق هدایت
The canonical is `Ṣādiq Hidāyat`, not a mechanically Anglicized `Sadeq Hedayat`: the current IJMES Persian chart maps `ص` to `ṣ` and Persian short vowels to `i/u`. The established English publication spelling remains `Sadeq Hedayat` in the rendering layer.

### ملک‌الشعرای بهار
The exact supplied Persian surface contains the explicit yeh of izāfat in `الشعرای`, so the canonical preserves that morphology as `Malik al-Shuʿarā-yi Bahār`; it does not silently reconstruct an Arabic final hamza in place of the written Persian linker. The publication layer uses the established English-facing `Malek al-Shoʿara Bahar` form without ordinary diacritics. Independent bibliographic evidence also attests `Malik al-Shuʿarā-yi Bahār` for this exact Persian construction.

### جلال آل‌احمد
The scholarly canonical uses the project IJMES izāfat form `Āl-i Aḥmad`; the widely established publication spelling `Jalal Al-e Ahmad` belongs only to the rendering layer.

### تخت جمشید / پاسارگاد
The scholarly canonical stays source-faithful (`Takht-i Jamshīd`, `Pāsārgād`). IJMES explicitly permits accepted English place-name spellings, so the publication layer uses `Persepolis` and `Pasargadae` respectively.

### آذربایجان / هرمزگان / زاگرس
Canonical forms preserve the IJMES Persian scholarly system (`Āzarbāyjān`, `Hurmuzgān`, `Zāgrus`), while the publication layer uses established English `Azerbaijan`, `Hormozgan`, and `Zagros`.

### Institutions
Institution names are not translated into English in this benchmark. The canonical layer retains full scholarly transliteration and izāfat; the publication layer follows IJMES proper-name presentation by removing ordinary diacritics.

## Governance Result

Batch C is substantively reviewed but **not** human-approved and **not** release gold.

Expected worklist state after Batch C is recorded:
- 84 completed/adjudicated
- 24 pending
- `humanSignoff = null`
- gold unfrozen
- `engineEvaluationPerformed = false`
- Phase 4.6C blocked

No runtime, lexicon, morphology, profile, bibliography, or engine remediation is authorized by this batch.
