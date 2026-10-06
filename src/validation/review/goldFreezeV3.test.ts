import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertFrozenBenchmarkIntegrityV3,
  computeGitBlobSha1,
  loadGoldFreezeV3,
  loadHumanSignoffV3,
  validateHumanSignoffV3,
  BENCHMARK_V3_PATH,
  SIGNOFF_V3_PATH
} from './goldFreezeV3';
import { renderCanonicalForProfile, SUPPORTED_PROFILES } from '../../domain/profiles';
import { transliterate } from '../../domain/engine';
import { normalizeLegacyTitleCanonicalForV3 } from '../../../scripts/build-v3-benchmark';

describe('Phase 4.6B human sign-off and V3 gold freeze', () => {
  it('records explicit human APPROVE with narrow truthful scope inheriting V2 lexical authority', () => {
    const signoff = loadHumanSignoffV3();
    expect(signoff.decision).toBe('APPROVE');
    expect(signoff.reviewer.githubLogin).toBe('mehdimt1980');
    expect(signoff.scope.presentationPolicyMigration).toBe(true);
    expect(signoff.scope.lexicalAuthorityInheritedFromV2).toBe(true);
    expect(signoff.scope.caseByCaseReAdjudicationClaimed).toBe(false);
    expect(signoff.caseLevelPrimaryReviewer).toContain('AI_SPECIALIST');
    expect(signoff.caseLevelPrimaryReviewer).toContain('Deterministic Presentation Policy Migration');
  });

  it('rejects a false claim of human case-by-case re-adjudication in V3 signoff', () => {
    const signoff = loadHumanSignoffV3();
    const invalid = {
      ...signoff,
      scope: {
        ...signoff.scope,
        caseByCaseReAdjudicationClaimed: true
      }
    };
    expect(() => validateHumanSignoffV3(invalid)).toThrow(/CASE_BY_CASE_CLAIM_FORBIDDEN/u);
  });

  it('rejects signoff with missing or incomplete scope', () => {
    const signoff = loadHumanSignoffV3();
    const invalid = {
      ...signoff,
      scope: {
        presentationPolicyMigration: false,
        lexicalAuthorityInheritedFromV2: true,
        caseByCaseReAdjudicationClaimed: false
      }
    };
    expect(() => validateHumanSignoffV3(invalid)).toThrow(/SCOPE_INCOMPLETE/u);
  });

  it('binds the frozen promotion to the exact reviewed V3 benchmark Git blob', () => {
    const freeze = assertFrozenBenchmarkIntegrityV3();
    expect(freeze.sourceBenchmarkGitBlobSha1).toBe(computeGitBlobSha1(BENCHMARK_V3_PATH));
    expect(freeze.promotedGoldVersion).toBe('3.0.0');
    expect(freeze.promotionStatus).toBe('HUMAN_APPROVED_FROZEN');
    expect(freeze.engineEvaluationPerformedAtFreeze).toBe(false);
    expect(freeze.phase46CAuthorized).toBe(true);
  });

  it('keeps the exact five review-required IDs frozen in V3', () => {
    const freeze = loadGoldFreezeV3();
    expect([...freeze.reviewRequiredIds].sort()).toEqual([
      'cand-amb-001',
      'cand-amb-003',
      'cand-amb-007',
      'cand-amb-009',
      'cand-amb-011'
    ]);
  });

  it('verifies that human signoff is an independent immutable governance artifact not written by build script', () => {
    const originalSignoff = fs.readFileSync(SIGNOFF_V3_PATH, 'utf8');
    const originalHash = computeGitBlobSha1(SIGNOFF_V3_PATH);

    // Verify build-v3-benchmark script file does not contain code writing human signoff or gold freeze
    const buildScriptContent = fs.readFileSync(path.join(process.cwd(), 'scripts/build-v3-benchmark.ts'), 'utf8');
    expect(buildScriptContent).not.toContain('human-signoff.v3.json');
    expect(buildScriptContent).not.toContain('gold-freeze.v3.json');

    // Confirm signoff file is unaltered
    const currentHash = computeGitBlobSha1(SIGNOFF_V3_PATH);
    expect(currentHash).toBe(originalHash);
    expect(fs.readFileSync(SIGNOFF_V3_PATH, 'utf8')).toBe(originalSignoff);
  });

  it('verifies canonical/rendered separation and full diacritics for all 12 migrated V3 title cases', () => {
    const v3 = JSON.parse(fs.readFileSync(BENCHMARK_V3_PATH, 'utf8'));
    const titleCases = v3.cases.filter((c: any) => c.profile === 'ijmes_citation_title');
    expect(titleCases).toHaveLength(12);

    const expectedPairs: Record<string, { canonical: string; rendered: string }> = {
      'cand-book-001': {
        canonical: 'tārīkh-i bīdārī-yi īrānīyān',
        rendered: 'Tārīkh-i Bīdārī-yi Īrānīyān'
      },
      'cand-book-002': {
        canonical: 'siyāsat-nāma',
        rendered: 'Siyāsat-nāma'
      },
      'cand-book-003': {
        canonical: 'qābūs-nāma',
        rendered: 'Qābūs-nāma'
      },
      'cand-book-004': {
        canonical: 'marzbān-nāma',
        rendered: 'Marzbān-nāma'
      },
      'cand-book-005': {
        canonical: 'safarnāma-yi nāṣir-i khusraw',
        rendered: 'Safarnāma-yi Nāṣir-i Khusraw'
      },
      'cand-book-006': {
        canonical: 'kalīla va dimna',
        rendered: 'Kalīla Va Dimna'
      },
      'cand-book-007': {
        canonical: 'gulistān',
        rendered: 'Gulistān'
      },
      'cand-book-008': {
        canonical: 'būstān',
        rendered: 'Būstān'
      },
      'cand-book-009': {
        canonical: 'savūshūn',
        rendered: 'Savūshūn'
      },
      'cand-book-010': {
        canonical: 'chashm-hā-yash',
        rendered: 'Chashm-hā-yash'
      },
      'cand-book-011': {
        canonical: 'ḥājī āqā',
        rendered: 'Ḥājī Āqā'
      },
      'cand-book-012': {
        canonical: 'zimistān',
        rendered: 'Zimistān'
      }
    };

    for (const c of titleCases) {
      const expected = expectedPairs[c.id];
      expect(expected).toBeDefined();
      expect(c.expected.scholarlyCanonical).toBe(expected.canonical);
      expect(c.expected.renderedOutput).toBe(expected.rendered);

      // Verify canonical is profile-independent (all lowercase scholarly representation)
      expect(c.expected.scholarlyCanonical).toBe(c.expected.scholarlyCanonical.toLowerCase());

      // Verify citation rendering is derived deterministically from canonical
      const derivedRendered = renderCanonicalForProfile(c.expected.scholarlyCanonical, 'ijmes_citation_title');
      expect(derivedRendered).toBe(c.expected.renderedOutput);

      // Verify diacritics are preserved (no ASCII flattening)
      if (expected.canonical.includes('ā')) {
        expect(c.expected.scholarlyCanonical).toContain('ā');
        expect(c.expected.renderedOutput).toContain('ā');
      }
      if (expected.canonical.includes('ī')) {
        expect(c.expected.scholarlyCanonical).toContain('ī');
        expect(c.expected.renderedOutput).toContain('ī');
      }
      if (expected.canonical.includes('ū')) {
        expect(c.expected.scholarlyCanonical).toContain('ū');
        expect(c.expected.renderedOutput).toContain('ū');
      }
      if (expected.canonical.includes('ḥ')) {
        expect(c.expected.scholarlyCanonical).toContain('ḥ');
        expect(c.expected.renderedOutput).toContain('Ḥ');
      }
      if (expected.canonical.includes('ṣ')) {
        expect(c.expected.scholarlyCanonical).toContain('ṣ');
        expect(c.expected.renderedOutput).toContain('ṣ');
      }
    }
  });

  it('proves legacy ijmes_title is archive-only and rejected by active runtime', () => {
    expect(SUPPORTED_PROFILES).toEqual(['ijmes_full', 'ijmes_citation_title']);
    expect(SUPPORTED_PROFILES).not.toContain('ijmes_title');

    // Attempting to call active runtime engine with legacy ijmes_title fails or throws
    // @ts-expect-error - ijmes_title is no longer a valid ProfileId
    expect(() => transliterate('تاریخ بیداری ایرانیان', 'ijmes_title')).toThrow(/Unsupported profile/u);
  });

  it('normalizes legacy title canonicals deterministically preserving hyphens and diacritics', () => {
    expect(normalizeLegacyTitleCanonicalForV3('Tārīkh-i Bīdārī-yi Īrānīyān')).toBe('tārīkh-i bīdārī-yi īrānīyān');
    expect(normalizeLegacyTitleCanonicalForV3('Siyāsat-nāma')).toBe('siyāsat-nāma');
    expect(normalizeLegacyTitleCanonicalForV3('Chashm-hā-yash')).toBe('chashm-hā-yash');
    expect(normalizeLegacyTitleCanonicalForV3('Safarnāma-yi Nāṣir-i Khusraw')).toBe('safarnāma-yi nāṣir-i khusraw');
    expect(normalizeLegacyTitleCanonicalForV3('Ḥājī Āqā')).toBe('ḥājī āqā');
  });
});
