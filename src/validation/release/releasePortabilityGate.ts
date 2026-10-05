import { transliterate } from '../../domain/engine';
import { findFrozenReviewedAuthority } from '../../domain/frozenReviewedAuthority';
import { normalizePersian } from '../../domain/normalization';
import type { ProfileId, ResultStatus } from '../../domain/types';

interface PositivePortabilityCase {
  id: string;
  input: string;
  profile: ProfileId;
  expectedOutput: string;
  expectedStatus?: ResultStatus;
  requireMorphology?: boolean;
  requireRelations?: boolean;
}

interface NegativePortabilityCase {
  id: string;
  input: string;
  profile: ProfileId;
  expectedStatus: ResultStatus;
}

export const POSITIVE_PORTABILITY_CASES: readonly PositivePortabilityCase[] = [
  {
    id: 'port-plural-second-stem',
    input: 'خانه‌ها',
    profile: 'ijmes_full',
    expectedOutput: 'khāna-hā',
    expectedStatus: 'LEXICON_RESOLVED',
    requireMorphology: true
  },
  {
    id: 'port-comparative',
    input: 'بزرگ‌تر',
    profile: 'ijmes_full',
    expectedOutput: 'buzurg-tar',
    expectedStatus: 'LEXICON_RESOLVED',
    requireMorphology: true
  },
  {
    id: 'port-possessive-2sg',
    input: 'کتابت',
    profile: 'ijmes_full',
    expectedOutput: 'kitāb-at',
    expectedStatus: 'LEXICON_RESOLVED',
    requireMorphology: true
  },
  {
    id: 'port-possessive-3sg',
    input: 'کتابش',
    profile: 'ijmes_full',
    expectedOutput: 'kitāb-ash',
    expectedStatus: 'LEXICON_RESOLVED',
    requireMorphology: true
  },
  {
    id: 'port-possessive-1pl',
    input: 'کتابمان',
    profile: 'ijmes_full',
    expectedOutput: 'kitāb-imān',
    expectedStatus: 'LEXICON_RESOLVED',
    requireMorphology: true
  },
  {
    id: 'port-possessive-2pl',
    input: 'کتابتان',
    profile: 'ijmes_full',
    expectedOutput: 'kitāb-itān',
    expectedStatus: 'LEXICON_RESOLVED',
    requireMorphology: true
  },
  {
    id: 'port-possessive-3pl',
    input: 'کتابشان',
    profile: 'ijmes_full',
    expectedOutput: 'kitāb-ishān',
    expectedStatus: 'LEXICON_RESOLVED',
    requireMorphology: true
  },
  {
    id: 'port-explicit-plural-izafat',
    input: 'کتاب‌های ایران',
    profile: 'ijmes_full',
    expectedOutput: 'kitāb-hā-i īrān',
    expectedStatus: 'LEXICON_RESOLVED',
    requireMorphology: true,
    requireRelations: true
  }
] as const;

export const NEGATIVE_PORTABILITY_CASES: readonly NegativePortabilityCase[] = [
  {
    id: 'port-unknown-plural',
    input: 'ناشناخته‌ها',
    profile: 'ijmes_full',
    expectedStatus: 'UNRESOLVED'
  },
  {
    id: 'port-unknown-comparative',
    input: 'ناشناخته‌تر',
    profile: 'ijmes_full',
    expectedStatus: 'UNRESOLVED'
  },
  {
    id: 'port-heh-final-possessive-gap',
    input: 'خانه‌م',
    profile: 'ijmes_full',
    expectedStatus: 'UNRESOLVED'
  },
  {
    id: 'port-authority-near-miss',
    input: 'زکاتی',
    profile: 'ijmes_full',
    expectedStatus: 'UNRESOLVED'
  },
  {
    id: 'port-wrong-profile-title',
    input: 'تاریخ بیداری ایرانیان',
    profile: 'ijmes_full',
    expectedStatus: 'UNRESOLVED'
  }
] as const;

export interface PortabilityGateReport {
  positivePassed: number;
  negativePassed: number;
  total: number;
  authorityOverlapCount: number;
}

function assertOutsideFrozenAuthority(input: string, profile: ProfileId): void {
  const normalized = normalizePersian(input).normalizedInput;
  const authority = findFrozenReviewedAuthority(normalized, profile);
  if (authority) {
    throw new Error(`PORTABILITY_CASE_OVERLAPS_FROZEN_AUTHORITY:${profile}:${input}:${authority.caseId}`);
  }
}

function assertNoAuthorityWarning(warnings: string[], id: string): void {
  if (warnings.some((warning) => warning.includes('frozen reviewed authority'))) {
    throw new Error(`PORTABILITY_CASE_USED_FROZEN_AUTHORITY:${id}`);
  }
}

export function runReleasePortabilityGate(): PortabilityGateReport {
  let positivePassed = 0;
  let negativePassed = 0;

  for (const testCase of POSITIVE_PORTABILITY_CASES) {
    assertOutsideFrozenAuthority(testCase.input, testCase.profile);
    const result = transliterate(testCase.input, testCase.profile);
    assertNoAuthorityWarning(result.warnings, testCase.id);

    if (!result.copyable) {
      throw new Error(`PORTABILITY_POSITIVE_NOT_COPYABLE:${testCase.id}:${result.status}`);
    }
    if (result.output !== testCase.expectedOutput) {
      throw new Error(
        `PORTABILITY_POSITIVE_OUTPUT_MISMATCH:${testCase.id}:expected=${testCase.expectedOutput}:actual=${result.output}`
      );
    }
    if (testCase.expectedStatus && result.status !== testCase.expectedStatus) {
      throw new Error(
        `PORTABILITY_POSITIVE_STATUS_MISMATCH:${testCase.id}:expected=${testCase.expectedStatus}:actual=${result.status}`
      );
    }
    if (testCase.requireMorphology && result.morphology.length === 0) {
      throw new Error(`PORTABILITY_POSITIVE_MORPHOLOGY_MISSING:${testCase.id}`);
    }
    if (testCase.requireRelations && result.relations.length === 0) {
      throw new Error(`PORTABILITY_POSITIVE_RELATION_MISSING:${testCase.id}`);
    }
    positivePassed += 1;
  }

  for (const testCase of NEGATIVE_PORTABILITY_CASES) {
    assertOutsideFrozenAuthority(testCase.input, testCase.profile);
    const result = transliterate(testCase.input, testCase.profile);
    assertNoAuthorityWarning(result.warnings, testCase.id);

    if (result.copyable) {
      throw new Error(`PORTABILITY_NEGATIVE_BECAME_COPYABLE:${testCase.id}:${result.output}`);
    }
    if (result.status !== testCase.expectedStatus) {
      throw new Error(
        `PORTABILITY_NEGATIVE_STATUS_MISMATCH:${testCase.id}:expected=${testCase.expectedStatus}:actual=${result.status}`
      );
    }
    negativePassed += 1;
  }

  return {
    positivePassed,
    negativePassed,
    total: positivePassed + negativePassed,
    authorityOverlapCount: 0
  };
}
