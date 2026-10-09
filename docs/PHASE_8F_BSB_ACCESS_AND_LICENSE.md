# Phase 8F — BSB access and license

## Verified interface

The provider is the official BSB Alma SRU endpoint, `https://bsb.alma.exlibrisgroup.com/view/sru/49BVB_BSB`. Its live Explain response on 2026-10-09 identified SRU 1.2, `searchRetrieve`, 1-based `startRecord`, a maximum of 50 records per response, and the `marcxml` (MARC21 slim) schema. It exposed `language` with exact relations, `all_for_ui` with `all`, and `dc_title` with `all`, `=`, and `==`. No catalog pages were scraped.

## Rights scope

The [official BSB SRU documentation](https://www.bsb-muenchen.de/bsblab/datenschnittstellen/bsb-sru/) states that BSB title data are available free for reuse under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). BSB also disclaims uninterrupted, timely, error-free, complete delivery and possible third-party rights. Phase 8F therefore treats only returned bibliographic/title metadata as CC0 catalog data. It makes no rights claim for digitized books, manuscripts, images, scans, OCR, or full text.

Provider attribution is retained as `BSB_SRU_MARCXML`, with endpoint URL, source record ID, source URL, exact field/subfields, source checksum, and retrieval timestamps in the pilot log. No credentials or sensitive values were used.

## Reused and extended boundaries

Persian normalization, Phase 8E candidate/review states, external trusted-candidate enforcement, CiNii extraction, and the canonical `LexicalEvidenceIndex` remain unchanged in meaning. Phase 8F adds optional provider evidence and a versioned BSB extraction value; old Phase 8E/CiNii artifacts remain valid. Production transliteration and AI inference are untouched.
