import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validateSingleValidationCorpusV2 } from '../v2/schema';

const BENCHMARK_REPO_PATH = 'validation/corpus/phase4.6b-external-benchmark.v3.json';
const SIGNOFF_REPO_PATH = 'validation/review/human-signoff.v3.json';

export const BENCHMARK_V3_PATH = path.join(process.cwd(), BENCHMARK_REPO_PATH);
export const SIGNOFF_V3_PATH = path.join(process.cwd(), SIGNOFF_REPO_PATH);
export const FREEZE_V3_PATH = path.join(process.cwd(), 'validation/review/gold-freeze.v3.json');

const EXPECTED_REVIEW_IDS = [
  'cand-amb-001',
  'cand-amb-003',
  'cand-amb-007',
  'cand-amb-009',
  'cand-amb-011'
];

export interface HumanSignoffV3 {
  schemaVersion: 1;
  artifactType: 'HUMAN_GOVERNANCE_SIGNOFF';
  benchmarkId: 'phase4.6b-external-benchmark-v3';
  decision: 'APPROVE';
  reviewer: { githubLogin: string; role: string };
  approvedAt: string;
  scope: {
    presentationPolicyMigration: true;
    lexicalAuthorityInheritedFromV2: true;
    caseByCaseReAdjudicationClaimed: false;
  };
  caseLevelPrimaryReviewer: string;
  notes: string;
}

export interface GoldFreezeV3 {
  schemaVersion: 1;
  artifactType: 'GOLD_FREEZE';
  benchmarkId: 'phase4.6b-external-benchmark-v3';
  sourceBenchmarkPath: string;
  sourceBenchmarkGitBlobSha1: string;
  sourceBenchmarkMetadataVersion: '3.0.0';
  promotedGoldVersion: '3.0.0';
  promotionStatus: 'HUMAN_APPROVED_FROZEN';
  humanSignoffPath: string;
  frozenAt: string;
  caseCount: 108;
  dispositionCounts: { FINAL: 103; REVIEW_REQUIRED: 5; UNRESOLVED: 0 };
  reviewRequiredIds: string[];
  engineEvaluationPerformedAtFreeze: false;
  phase46CAuthorized: true;
  caseLevelPrimaryReviewer: string;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim() === value;
}

export function validateHumanSignoffV3(data: unknown): HumanSignoffV3 {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('HUMAN_SIGNOFF_V3_INVALID');
  const d = data as Record<string, any>;
  if (d.schemaVersion !== 1 || d.artifactType !== 'HUMAN_GOVERNANCE_SIGNOFF') throw new Error('HUMAN_SIGNOFF_V3_HEADER_INVALID');
  if (d.benchmarkId !== 'phase4.6b-external-benchmark-v3' || d.decision !== 'APPROVE') throw new Error('HUMAN_SIGNOFF_V3_DECISION_INVALID');
  if (!d.reviewer || !nonEmpty(d.reviewer.githubLogin) || !nonEmpty(d.reviewer.role)) throw new Error('HUMAN_SIGNOFF_V3_REVIEWER_INVALID');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(d.approvedAt ?? '')) throw new Error('HUMAN_SIGNOFF_V3_DATE_INVALID');
  if (!d.scope || d.scope.presentationPolicyMigration !== true || d.scope.lexicalAuthorityInheritedFromV2 !== true) throw new Error('HUMAN_SIGNOFF_V3_SCOPE_INCOMPLETE');
  if (d.scope.caseByCaseReAdjudicationClaimed !== false) throw new Error('HUMAN_SIGNOFF_V3_CASE_BY_CASE_CLAIM_FORBIDDEN');
  if (!nonEmpty(d.caseLevelPrimaryReviewer)) throw new Error('HUMAN_SIGNOFF_V3_AI_PROVENANCE_INVALID');
  if (!nonEmpty(d.notes)) throw new Error('HUMAN_SIGNOFF_V3_NOTES_INVALID');
  return d as unknown as HumanSignoffV3;
}

export function loadHumanSignoffV3(): HumanSignoffV3 {
  return validateHumanSignoffV3(JSON.parse(fs.readFileSync(SIGNOFF_V3_PATH, 'utf8')));
}

export function computeGitBlobSha1(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}

export function loadGoldFreezeV3(): GoldFreezeV3 {
  return JSON.parse(fs.readFileSync(FREEZE_V3_PATH, 'utf8')) as GoldFreezeV3;
}

export function assertFrozenBenchmarkIntegrityV3(): GoldFreezeV3 {
  const signoff = loadHumanSignoffV3();
  const freeze = loadGoldFreezeV3();
  const benchmark = validateSingleValidationCorpusV2(JSON.parse(fs.readFileSync(BENCHMARK_V3_PATH, 'utf8')));

  if (freeze.schemaVersion !== 1 || freeze.artifactType !== 'GOLD_FREEZE') throw new Error('GOLD_FREEZE_V3_HEADER_INVALID');
  if (freeze.benchmarkId !== signoff.benchmarkId || freeze.promotionStatus !== 'HUMAN_APPROVED_FROZEN') throw new Error('GOLD_FREEZE_V3_PROMOTION_INVALID');
  if (freeze.sourceBenchmarkPath !== BENCHMARK_REPO_PATH || freeze.humanSignoffPath !== SIGNOFF_REPO_PATH) throw new Error('GOLD_FREEZE_V3_PATH_INVALID');
  if (freeze.sourceBenchmarkMetadataVersion !== '3.0.0' || freeze.promotedGoldVersion !== '3.0.0') throw new Error('GOLD_FREEZE_V3_VERSION_INVALID');
  if (freeze.frozenAt !== signoff.approvedAt || freeze.caseCount !== 108) throw new Error('GOLD_FREEZE_V3_METADATA_INVALID');
  if (freeze.engineEvaluationPerformedAtFreeze !== false || freeze.phase46CAuthorized !== true) throw new Error('GOLD_FREEZE_V3_AUTHORIZATION_INVALID');
  if (freeze.caseLevelPrimaryReviewer !== signoff.caseLevelPrimaryReviewer) throw new Error('GOLD_FREEZE_V3_PROVENANCE_INVALID');
  if (computeGitBlobSha1(BENCHMARK_V3_PATH) !== freeze.sourceBenchmarkGitBlobSha1) throw new Error('GOLD_FREEZE_V3_BENCHMARK_CHANGED');
  if (benchmark.metadata.id !== freeze.benchmarkId || benchmark.metadata.version !== freeze.sourceBenchmarkMetadataVersion) throw new Error('GOLD_FREEZE_V3_BENCHMARK_METADATA_MISMATCH');

  const counts = benchmark.cases.reduce((a, c) => {
    a[c.expected.disposition] += 1;
    return a;
  }, { FINAL: 0, REVIEW_REQUIRED: 0, UNRESOLVED: 0 });
  if (counts.FINAL !== 103 || counts.REVIEW_REQUIRED !== 5 || counts.UNRESOLVED !== 0) throw new Error('GOLD_FREEZE_V3_COUNTS_INVALID');
  if (JSON.stringify(counts) !== JSON.stringify(freeze.dispositionCounts)) throw new Error('GOLD_FREEZE_V3_COUNTS_MISMATCH');

  const ids = benchmark.cases.filter(c => c.expected.disposition === 'REVIEW_REQUIRED').map(c => c.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify([...EXPECTED_REVIEW_IDS].sort())) throw new Error('GOLD_FREEZE_V3_REVIEW_IDS_INVALID');
  if (JSON.stringify(ids) !== JSON.stringify([...freeze.reviewRequiredIds].sort())) throw new Error('GOLD_FREEZE_V3_REVIEW_IDS_MISMATCH');

  return freeze;
}
