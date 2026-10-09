# Phase 8G — snapshot publication and rollback

Snapshots progress `DRAFT` → `VERIFIED` → `ACTIVE`; an older active snapshot becomes `RETIRED`. The manifest checksum covers sorted source-version IDs and candidate identity/content hashes. A transaction failure before pointer replacement leaves the previous snapshot active. Blob archival is outside the SQL transaction, so failed database work may leave only a harmless immutable orphan.

Rollback is an administrator-only command and guarded transaction using the same target binding and advisory lock as publication. It accepts only verified, active, or retired snapshots, retires the current Phase 8G pointer, and activates the selected historical snapshot. It never rewrites source versions, candidate evidence, or Blob objects. Review attestations are not copied to changed content hashes.
