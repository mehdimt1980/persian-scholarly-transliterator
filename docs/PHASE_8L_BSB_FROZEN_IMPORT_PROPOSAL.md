# Phase 8L — frozen, review-only BSB import proposal

## Source provenance
The sole allowed source is the successful, bounded **Phase 8K read-only Staging reconciliation** GitHub Actions artifact:

- Workflow run: https://github.com/mehdimt1980/persian-scholarly-transliterator/actions/runs/37980848653
- Artifact: `phase8k-bsb-fixture-reconciliation` (ID `11640448692`)
- Source artefact expires **2026-10-16**. Download the sealed output and securely archive it outside ephemeral Actions artifacts if it is to be used after that date.
- The original permanent, verified Neon Staging active snapshot remains `snapshot-7946161b2af2652b776a6bd4`.

This phase downloads the **existing** source artifact. It must not fetch BSB again while assembling the frozen package. It checks the original `package-checksums.json`, every source XML SHA-256, the original query/record/page positions, candidate identities, extracted candidate content hashes, the source-to-candidate mapping and source/staging difference classification. The original raw SRU pages remain alongside the derived 48-record MARC collection and seal.

## Exactly what is in the proposal
- **48** `NEW_RECORD` MARC identities, each with a canonical record checksum and original raw SRU source page reference.
- **72** new `UNREVIEWED` and `NON_AUTHORITATIVE_CANDIDATE` candidate identities. These are bibliographic source evidence, not standards-certified IJMES romanizations.
- Both previously imported MARC 001 identities `991071006889707356` and `991144600686807356` are explicitly excluded; their three existing candidates also remain out of the import proposal.
- Output: `frozen-new-records.marcxml`, `frozen-seal.json` (baseline snapshot, source run, checksums, record and candidate review queue), and the original `source/` proof files (five BSB SRU XML pages and five audit/review files).
- No live DB writes and no Blob uploads. Successful CI is **not** scientific review or approval to publish.

## How the one-time read-only job operates
1. Trigger the PR's labeled `Phase 8L frozen BSB proposal` Action, scoped only to the dedicated branch and PR.
2. Verify permanent Neon Staging is the correct isolated branch, active snapshot and manifest are intact, and `writes_enabled=false`.
3. Download the pinned source artifact from run `37980848653` with GitHub's read-only Actions token.
4. Validate all original provenance, reconstruct the 48-record/72-candidate proposal, write only a GitHub Actions **review artifact**, and verify output SHA-256.
5. Verify the Staging baseline is *still* unchanged after generating the proposal. Recheck input artifact identities and remove the label after the one-time run.

## Next phase: strictly separate operator-gated import
Before a persistent Staging import may be implemented or executed, require all of:
1. Human evidence review, including handling of observed romanization proposals versus actual IJMES transliteration (do not mark any review decision automatically).
2. Source license/attribution review and retention requirements.
3. Frozen artifact retained with immutable hash, preserved raw SRU responses, page lineage and review decision provenance.
4. A genuine dry-run against active Neon Staging, expected previous snapshot ID and manifest checksum enforced **again at commit**, plus 48-MARC/72-candidate replay validation with non-authoritative status.
5. Bounded, explicitly approved write window on the exact Staging branch, archival of original SRU source, transactional incremental snapshot publication, readback assertions, automatic write-window closure, and a verified rollback path to the old active snapshot.

**No production write permission or IJMES authority promotion is part of this phase.**
