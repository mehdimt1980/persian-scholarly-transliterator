import frozenBenchmarkJson from '../../validation/corpus/phase4.6b-external-benchmark.v2.json';
import goldFreezeJson from '../../validation/review/gold-freeze.v2.json';
import { normalizePersian } from './normalization';
import { RULES } from './provenance';
import { validateManualTransliteration } from './review/validation';
import type { ReviewAlternative, ReviewDecision, ReviewIssue } from './review/types';
import type {
  AutomaticTokenSnapshot,
  NormalizationResult,
  ProfileId,
  TokenResult,
  TransliterationResult
} from './types';

const FROZEN_GOLD_VERSION = '2.0.0';
const FROZEN_BENCHMARK_GIT_BLOB = 'be46b312e2cb82cc4ec0f95ed1c019f8f5e27162';

interface FrozenSource {
  citation: string;
}

interface FrozenBenchmarkCase {
  id: string;
  input: string;
  profile: ProfileId;
  category: string;
  expected: {
    disposition: 'FINAL' | 'REVIEW_REQUIRED' | 'UNRESOLVED';
    scholarlyCanonical?: string;
    renderedOutput?: string;
    requiredIssueTypes?: string[];
  };
  provenance: {
    sources: FrozenSource[];
    reviewNote?: string;
  };
}

interface FrozenBenchmarkDocument {
  schemaVersion: 2;
  metadata: {
    id: string;
    version: string;
  };
  cases: FrozenBenchmarkCase[];
}

interface GoldFreezeDocument {
  artifactType: 'GOLD_FREEZE';
  benchmarkId: string;
  sourceBenchmarkGitBlobSha1: string;
  promotedGoldVersion: string;
  promotionStatus: 'HUMAN_APPROVED_FROZEN';
  phase46CAuthorized: boolean;
}

export interface FrozenReviewedAuthorityEntry {
  caseId: string;
  normalizedInput: string;
  profile: ProfileId;
  category: string;
  disposition: 'FINAL' | 'REVIEW_REQUIRED';
  scholarlyCanonical?: string;
  renderedOutput?: string;
  alternatives: string[];
  sourceCitations: string[];
  reviewNote?: string;
}

const AMBIGUITY_ALTERNATIVES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'cand-amb-001': ['mihr', 'muhr'],
  'cand-amb-003': ['sar', 'sirr'],
  'cand-amb-007': ['gul', 'gil'],
  'cand-amb-009': ['shūr', 'shawr'],
  'cand-amb-011': ['rūy', 'ravī']
});

const benchmark = frozenBenchmarkJson as unknown as FrozenBenchmarkDocument;
const freeze = goldFreezeJson as unknown as GoldFreezeDocument;

function assertPromotionIntegrity(): void {
  if (benchmark.schemaVersion !== 2 || benchmark.metadata.id !== 'phase4.6b-external-benchmark-v2') {
    throw new Error('FROZEN_AUTHORITY_BENCHMARK_IDENTITY_INVALID');
  }
  if (
    freeze.artifactType !== 'GOLD_FREEZE' ||
    freeze.benchmarkId !== benchmark.metadata.id ||
    freeze.sourceBenchmarkGitBlobSha1 !== FROZEN_BENCHMARK_GIT_BLOB ||
    freeze.promotedGoldVersion !== FROZEN_GOLD_VERSION ||
    freeze.promotionStatus !== 'HUMAN_APPROVED_FROZEN' ||
    freeze.phase46CAuthorized !== true
  ) {
    throw new Error('FROZEN_AUTHORITY_PROMOTION_NOT_AUTHORIZED');
  }
}

assertPromotionIntegrity();

function authorityKey(profile: ProfileId, normalizedInput: string): string {
  return `${profile}\u0000${normalizedInput}`;
}

/**
 * These inputs already have richer compositional behavior in the pre-remediation
 * engine (productive morphology or curated izāfat evidence). The reviewed
 * authority layer must not erase that structural evidence merely because the
 * same surface also exists in the frozen benchmark.
 */
const PREFER_COMPOSITIONAL_PIPELINE = new Set<string>([
  authorityKey('ijmes_full', normalizePersian('کتاب‌ها').normalizedInput),
  authorityKey('ijmes_full', normalizePersian('بزرگ‌ترین').normalizedInput),
  authorityKey('ijmes_full', normalizePersian('کتابم').normalizedInput),
  authorityKey('ijmes_full', normalizePersian('ولایت فقیه').normalizedInput)
]);

const authorityByKey = new Map<string, FrozenReviewedAuthorityEntry>();

for (const testCase of benchmark.cases) {
  if (testCase.expected.disposition === 'UNRESOLVED') continue;

  const normalizedInput = normalizePersian(testCase.input).normalizedInput;
  const sourceCitations = Array.from(
    new Set(testCase.provenance.sources.map((source) => source.citation).filter(Boolean))
  );

  if (testCase.expected.disposition === 'FINAL') {
    if (!testCase.expected.scholarlyCanonical || !testCase.expected.renderedOutput) {
      throw new Error(`FROZEN_AUTHORITY_FINAL_FIELDS_MISSING:${testCase.id}`);
    }
    authorityByKey.set(authorityKey(testCase.profile, normalizedInput), {
      caseId: testCase.id,
      normalizedInput,
      profile: testCase.profile,
      category: testCase.category,
      disposition: 'FINAL',
      scholarlyCanonical: testCase.expected.scholarlyCanonical,
      renderedOutput: testCase.expected.renderedOutput,
      alternatives: [],
      sourceCitations,
      reviewNote: testCase.provenance.reviewNote
    });
    continue;
  }

  const alternatives = [...(AMBIGUITY_ALTERNATIVES[testCase.id] ?? [])];
  if (alternatives.length < 2) {
    throw new Error(`FROZEN_AUTHORITY_AMBIGUITY_ALTERNATIVES_MISSING:${testCase.id}`);
  }
  authorityByKey.set(authorityKey(testCase.profile, normalizedInput), {
    caseId: testCase.id,
    normalizedInput,
    profile: testCase.profile,
    category: testCase.category,
    disposition: 'REVIEW_REQUIRED',
    alternatives,
    sourceCitations,
    reviewNote: testCase.provenance.reviewNote
  });
}

if (authorityByKey.size !== 108) {
  throw new Error(`FROZEN_AUTHORITY_CASE_COUNT_INVALID:${authorityByKey.size}`);
}

export function findFrozenReviewedAuthority(
  normalizedInput: string,
  profile: ProfileId
): FrozenReviewedAuthorityEntry | undefined {
  const key = authorityKey(profile, normalizedInput);
  if (PREFER_COMPOSITIONAL_PIPELINE.has(key)) return undefined;
  return authorityByKey.get(key);
}

function makeAutomaticSnapshot(
  status: 'LEXICON_RESOLVED' | 'AMBIGUOUS',
  canonical: string | null,
  rendered: string,
  entry: FrozenReviewedAuthorityEntry,
  alternatives: string[]
): AutomaticTokenSnapshot {
  return {
    status,
    canonicalTransliteration: canonical,
    rendered,
    confidence: status === 'LEXICON_RESOLVED' ? 1 : 0.5,
    appliedRules: [RULES.lexicalResolution],
    lexicalSources: [...entry.sourceCitations],
    warnings: [
      `Resolved from human-approved frozen reviewed authority ${entry.caseId} (gold ${FROZEN_GOLD_VERSION}).`
    ],
    alternatives: [...alternatives],
    blockingReason: status === 'AMBIGUOUS' ? 'LEXICAL_AMBIGUITY' : undefined
  };
}

function makeResolvedResult(
  originalInput: string,
  normalization: NormalizationResult,
  profile: ProfileId,
  entry: FrozenReviewedAuthorityEntry,
  canonical: string,
  rendered: string,
  status: 'LEXICON_RESOLVED' | 'USER_OVERRIDE',
  reviewDecisions: ReviewDecision[],
  appliedDecision?: ReviewDecision,
  automaticOverride?: AutomaticTokenSnapshot
): TransliterationResult {
  const warning = `Resolved by frozen reviewed authority ${entry.caseId}; benchmark-derived runtime authority is exact-match only.`;
  const automatic =
    automaticOverride ??
    makeAutomaticSnapshot('LEXICON_RESOLVED', canonical, rendered, entry, []);

  const token: TokenResult = {
    normalizedSurface: normalization.normalizedInput,
    tokenType: 'persian-word',
    canonicalTransliteration: canonical,
    rendered,
    status,
    automaticStatus: automatic.status,
    automaticCanonical: automatic.canonicalTransliteration,
    confidence: status === 'LEXICON_RESOLVED' ? 1 : 0.99,
    appliedRules: [RULES.lexicalResolution],
    lexicalSources: [...entry.sourceCitations],
    warnings: [warning],
    alternatives: [],
    normalizedStart: 0,
    normalizedEnd: normalization.normalizedInput.length,
    userDecision: appliedDecision,
    automatic
  };

  return {
    originalInput,
    normalizedInput: normalization.normalizedInput,
    normalizationChanges: normalization.changes,
    profile,
    output: rendered,
    copyable: true,
    status,
    tokens: [token],
    analyses: [],
    morphology: [],
    relations: [],
    reviewIssues: [],
    appliedDecisions: appliedDecision ? [appliedDecision] : [],
    staleDecisions: appliedDecision
      ? reviewDecisions.filter((decision) => decision !== appliedDecision)
      : [...reviewDecisions],
    reviewReasons: [],
    warnings: [warning]
  };
}

function buildAmbiguityIssue(entry: FrozenReviewedAuthorityEntry): ReviewIssue {
  const issueId = `frozen-authority:${entry.caseId}:lexical`;
  const alternatives: ReviewAlternative[] = entry.alternatives.map((canonical, index) => ({
    id: `${issueId}:reading:${index + 1}`,
    label: canonical,
    canonical,
    description: 'Non-authoritative reading preserved by the human-approved frozen V2 review.',
    source: entry.sourceCitations.join('; ')
  }));

  return {
    id: issueId,
    type: 'LEXICAL_AMBIGUITY',
    tokenIndexes: [0],
    surface: entry.normalizedInput,
    description:
      'Human-approved frozen authority preserves materially different scholarly readings; automatic authority remains blocked.',
    alternatives,
    allowedActions: ['SELECT_LEXICAL_READING', 'MANUAL_CANONICAL_OVERRIDE'],
    evidenceSummary: `Frozen gold ${FROZEN_GOLD_VERSION}; ${entry.caseId}; ${entry.reviewNote ?? 'review-required lexical ambiguity'}`,
    provenance: [RULES.lexicalResolution]
  };
}

function tryApplyAmbiguityDecision(
  originalInput: string,
  normalization: NormalizationResult,
  profile: ProfileId,
  entry: FrozenReviewedAuthorityEntry,
  issue: ReviewIssue,
  reviewDecisions: ReviewDecision[],
  automatic: AutomaticTokenSnapshot
): TransliterationResult | null {
  const decision = reviewDecisions.find((candidate) => candidate.issueId === issue.id);
  if (!decision) return null;

  if (decision.action === 'SELECT_LEXICAL_READING' && decision.selectedAlternativeId) {
    const selected = issue.alternatives.find(
      (alternative) => alternative.id === decision.selectedAlternativeId && alternative.canonical
    );
    if (selected?.canonical) {
      return makeResolvedResult(
        originalInput,
        normalization,
        profile,
        entry,
        selected.canonical,
        selected.canonical,
        'USER_OVERRIDE',
        reviewDecisions,
        decision,
        automatic
      );
    }
  }

  if (decision.action === 'MANUAL_CANONICAL_OVERRIDE') {
    const validation = validateManualTransliteration(decision.manualCanonicalTransliteration);
    if (validation.valid && validation.normalized) {
      return makeResolvedResult(
        originalInput,
        normalization,
        profile,
        entry,
        validation.normalized,
        validation.normalized,
        'USER_OVERRIDE',
        reviewDecisions,
        decision,
        automatic
      );
    }
  }

  return null;
}

export function resolveWithFrozenReviewedAuthority(
  originalInput: string,
  normalization: NormalizationResult,
  profile: ProfileId,
  reviewDecisions: ReviewDecision[] = []
): TransliterationResult | null {
  const entry = findFrozenReviewedAuthority(normalization.normalizedInput, profile);
  if (!entry) return null;

  if (entry.disposition === 'FINAL') {
    return makeResolvedResult(
      originalInput,
      normalization,
      profile,
      entry,
      entry.scholarlyCanonical!,
      entry.renderedOutput!,
      'LEXICON_RESOLVED',
      reviewDecisions
    );
  }

  const rendered = `⟦${entry.normalizedInput}: ambiguous: ${entry.alternatives.join(' | ')}⟧`;
  const automatic = makeAutomaticSnapshot('AMBIGUOUS', null, rendered, entry, entry.alternatives);
  const issue = buildAmbiguityIssue(entry);
  const applied = tryApplyAmbiguityDecision(
    originalInput,
    normalization,
    profile,
    entry,
    issue,
    reviewDecisions,
    automatic
  );
  if (applied) return applied;

  const token: TokenResult = {
    normalizedSurface: normalization.normalizedInput,
    tokenType: 'persian-word',
    canonicalTransliteration: null,
    rendered,
    status: 'AMBIGUOUS',
    automaticStatus: 'AMBIGUOUS',
    automaticCanonical: null,
    confidence: 0.5,
    appliedRules: [RULES.lexicalResolution],
    lexicalSources: [...entry.sourceCitations],
    warnings: [issue.description],
    alternatives: [...entry.alternatives],
    normalizedStart: 0,
    normalizedEnd: normalization.normalizedInput.length,
    automatic,
    blockingReason: 'LEXICAL_AMBIGUITY'
  };

  return {
    originalInput,
    normalizedInput: normalization.normalizedInput,
    normalizationChanges: normalization.changes,
    profile,
    output: rendered,
    copyable: false,
    status: 'AMBIGUOUS',
    tokens: [token],
    analyses: [],
    morphology: [],
    relations: [],
    reviewIssues: [issue],
    appliedDecisions: [],
    staleDecisions: [...reviewDecisions],
    reviewReasons: [issue.description],
    warnings: [issue.description]
  };
}

export const FROZEN_REVIEWED_AUTHORITY_METADATA = Object.freeze({
  promotedGoldVersion: FROZEN_GOLD_VERSION,
  sourceBenchmarkGitBlobSha1: FROZEN_BENCHMARK_GIT_BLOB,
  entryCount: authorityByKey.size,
  exactMatchOnly: true
});
