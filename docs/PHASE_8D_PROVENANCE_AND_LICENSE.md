# Phase 8D Provenance, Access, and License Notes

## Source and attribution

The source adapter identifies records as `CINII_RESEARCH_OPENSEARCH_V2` and attributes CiNii Research to Japan's National Institute of Informatics (NII). The endpoint and the [official OpenSearch specification](https://support.nii.ac.jp/en/cir/r_opensearch) are stored with every evidence record.

## Authentication and acceptable use

NII's [API developer guidance](https://support.nii.ac.jp/en/cinii/api/developer) requires API user registration and an application ID. It also directs commercial and other specified users to consult NII before applying. Phase 8D therefore does not assume commercial-use permission. Operators must confirm that their registered purpose and downstream use comply with NII rules before a live run.

The reviewed documentation does not publish a numeric request-per-second limit for this endpoint. NII warns that very large access over a short period may be blocked. The client's pacing, retry, and 100-record constraints are conservative project controls, not a restatement of an official numeric quota.

## Rights boundary

An API response is not treated as a universal open-data license. Bibliographic fields may involve NII terms, contributing institutions, and third-party rights. Artifacts preserve attribution and a cautionary license note; they do not assert ownership, redistribution rights, or permission for production-scale harvesting. A production or commercial expansion requires a fresh terms review and, where applicable, consultation with NII.

No private material, authentication bypass, CAPTCHA bypass, robots circumvention, or HTML scraping is permitted. CiNii Books is in a transition to CiNii Research, so the implementation uses the structured v2 endpoint and does not depend on legacy HTML.

## Credential and audit controls

`CINII_APP_ID` is read only from the process environment in live mode. It is never committed, serialized, or included in safe request logs. Raw-record checksums prove what parser input produced an evidence record without claiming that the repository stores an authoritative mirror of CiNii.

Live pilot status for this delivery: **NOT RUN**.
