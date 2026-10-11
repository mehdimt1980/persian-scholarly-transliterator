import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 8S: Schema-Contract Regression & Column Verification', () => {
  const root = process.cwd();
  const migration003Path = path.resolve(root, 'migrations/evidence/003_phase8s_derived_authority.sql');
  const migration003Sql = fs.readFileSync(migration003Path, 'utf8');

  // Exact column definitions from migration 003
  const EXPECTED_DERIVED_CANDIDATE_COLUMNS = new Set([
    'derived_candidate_id',
    'parent_candidate_id',
    'parent_source_version_id',
    'parent_review_event_id',
    'source_snapshot_id',
    'review_basis_sha256',
    'original_persian_surface',
    'running_text_persian_surface',
    'derivation_type',
    'derivation_explanation',
    'created_at',
    'created_by'
  ]);

  const EXPECTED_DERIVED_REVIEW_EVENT_COLUMNS = new Set([
    'event_id',
    'derived_candidate_id',
    'decision_kind',
    'canonical',
    'profile',
    'authority_context',
    'reviewer_ref',
    'rationale',
    'human_attestation',
    'decision_json',
    'decided_at'
  ]);

  const FORBIDDEN_HALLUCINATED_CANDIDATE_COLUMNS = [
    'derived_persian_surface',
    'proposed_canonical',
    'normalized_persian',
    'context',
    'explanation' // must be derivation_explanation
  ];

  it('verifies Migration 003 defines the exact expected table columns', () => {
    // phase8s_derived_candidate
    const candidateTableMatch = migration003Sql.match(
      /CREATE TABLE IF NOT EXISTS phase8s_derived_candidate\s*\(([\s\S]*?)\);/u
    );
    expect(candidateTableMatch).toBeDefined();
    const candidateBody = candidateTableMatch![1];

    for (const col of EXPECTED_DERIVED_CANDIDATE_COLUMNS) {
      expect(candidateBody).toMatch(new RegExp(`\\b${col}\\b`, 'u'));
    }
    for (const forbidden of FORBIDDEN_HALLUCINATED_CANDIDATE_COLUMNS) {
      // Ensure the exact column name definition does not appear as a column
      const colDefRegex = new RegExp(`^\\s*${forbidden}\\s+`, 'mu');
      expect(colDefRegex.test(candidateBody)).toBe(false);
    }

    // phase8s_derived_review_event
    const reviewTableMatch = migration003Sql.match(
      /CREATE TABLE IF NOT EXISTS phase8s_derived_review_event\s*\(([\s\S]*?)\);/u
    );
    expect(reviewTableMatch).toBeDefined();
    const reviewBody = reviewTableMatch![1];

    for (const col of EXPECTED_DERIVED_REVIEW_EVENT_COLUMNS) {
      expect(reviewBody).toMatch(new RegExp(`\\b${col}\\b`, 'u'));
    }
  });

  it('ensures no SQL query in source code references forbidden hallucinated column names', () => {
    const filesToAudit = [
      'src/server/review/derivedReviewStore.ts',
      'src/server/authority/neonAuthorityRepository.ts',
      'src/server/authority/sourceVerification.ts',
      'src/server/authority/neonAuthority.integration.test.ts',
      'src/domain/authority/derivedAuthority.test.ts'
    ];

    for (const relPath of filesToAudit) {
      const fullPath = path.resolve(root, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');

      for (const forbidden of FORBIDDEN_HALLUCINATED_CANDIDATE_COLUMNS) {
        // Match SQL column contexts: "INSERT INTO ... (..., forbidden, ...)" or "dc.forbidden" or "c.forbidden"
        const dotForbiddenRegex = new RegExp(`\\b(dc|c|candidate)\\.${forbidden}\\b`, 'u');
        expect(
          dotForbiddenRegex.test(content),
          `File ${relPath} references forbidden column dc.${forbidden}`
        ).toBe(false);

        const insertRegex = new RegExp(`INSERT\\s+INTO\\s+phase8s_derived_candidate\\s*\\([^)]*?\\b${forbidden}\\b[^)]*?\\)`, 'isu');
        expect(
          insertRegex.test(content),
          `File ${relPath} attempts to INSERT nonexistent column ${forbidden} into phase8s_derived_candidate`
        ).toBe(false);
      }
    }
  });

  it('validates every INSERT into phase8s_derived_candidate uses only genuine migration 003 columns', () => {
    const filesToAudit = [
      'src/server/review/derivedReviewStore.ts',
      'src/server/authority/neonAuthority.integration.test.ts'
    ];

    for (const relPath of filesToAudit) {
      const fullPath = path.resolve(root, relPath);
      const content = fs.readFileSync(fullPath, 'utf8');

      const insertMatches = content.matchAll(/INSERT\s+INTO\s+phase8s_derived_candidate\s*\(([\s\S]*?)\)/giu);
      for (const match of insertMatches) {
        const columnsText = match[1];
        const columns = columnsText
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter((c) => c.length > 0);

        for (const col of columns) {
          expect(
            EXPECTED_DERIVED_CANDIDATE_COLUMNS.has(col),
            `Column "${col}" in INSERT of ${relPath} is not defined in phase8s_derived_candidate`
          ).toBe(true);
        }
      }
    }
  });

  it('validates every INSERT into phase8s_derived_review_event uses only genuine migration 003 columns', () => {
    const filesToAudit = [
      'src/server/review/derivedReviewStore.ts',
      'src/server/authority/neonAuthority.integration.test.ts'
    ];

    for (const relPath of filesToAudit) {
      const fullPath = path.resolve(root, relPath);
      const content = fs.readFileSync(fullPath, 'utf8');

      const insertMatches = content.matchAll(/INSERT\s+INTO\s+phase8s_derived_review_event\s*\(([\s\S]*?)\)/giu);
      for (const match of insertMatches) {
        const columnsText = match[1];
        const columns = columnsText
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter((c) => c.length > 0);

        for (const col of columns) {
          expect(
            EXPECTED_DERIVED_REVIEW_EVENT_COLUMNS.has(col),
            `Column "${col}" in INSERT of ${relPath} is not defined in phase8s_derived_review_event`
          ).toBe(true);
        }
      }
    }
  });

  it('validates all dc.* and dreview.* column selections match schema contracts', () => {
    const repoFile = fs.readFileSync(path.resolve(root, 'src/server/authority/neonAuthorityRepository.ts'), 'utf8');
    const verifyFile = fs.readFileSync(path.resolve(root, 'src/server/authority/sourceVerification.ts'), 'utf8');

    for (const content of [repoFile, verifyFile]) {
      // Find all dc.<column> references
      const dcMatches = content.matchAll(/\bdc\.([a-z_0-9]+)\b/giu);
      for (const match of dcMatches) {
        const col = match[1].toLowerCase();
        expect(
          EXPECTED_DERIVED_CANDIDATE_COLUMNS.has(col),
          `dc.${col} is not a valid column on phase8s_derived_candidate`
        ).toBe(true);
      }

      // Find all dreview.<column> references
      const dreviewMatches = content.matchAll(/\bdreview\.([a-z_0-9]+)\b/giu);
      for (const match of dreviewMatches) {
        const col = match[1].toLowerCase();
        expect(
          EXPECTED_DERIVED_REVIEW_EVENT_COLUMNS.has(col),
          `dreview.${col} is not a valid column on phase8s_derived_review_event`
        ).toBe(true);
      }
    }
  });
});
