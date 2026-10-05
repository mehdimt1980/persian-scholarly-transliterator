import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validateSingleValidationCorpusV2 } from '../v2/schema';

const BENCHMARK_REPO_PATH = 'validation/corpus/phase4.6b-external-benchmark.v2.json';
const SIGNOFF_REPO_PATH = 'validation/review/human-signoff.v2.json';

export const BENCHMARK_PATH = path.join(process.cwd(), BENCHMARK_REPO_PATH);
export const SIGNOFF_PATH = path.join(process.cwd(), SIGNOFF_REPO_PATH);
export const FREEZE_PATH = path.join(process.cwd(), 'validation/review/gold-freeze.v2.json');

const EXPECTED_REVIEW_IDS = [
  'cand-amb-001',
  'cand-amb-003',
  'cand-amb-007',
  'cand-amb-009',
  'cand-amb-011'
];

export interface HumanSignoffV2 {
  schemaVersion: 1;
  artifactType: 'HUMAN_GOVERNANCE_SIGNOFF';
  benchmarkId: 'phase4.6b-external-benchmark-v2';
  decision: 'APPROVE';
  reviewer: { githubLogin: string; role: string };
  approvedAt: string;
  scope: {
    policyAndGovernance: true;
    representativeHighRiskCases: true;
    ambiguityPreservation: true;
    provenanceModel: true;
    consolidationIntegrity: true;
    caseByCaseReAdjudicationClaimed: false;
  };
  caseLevelPrimaryReviewer: string;
  notes: string;
}

export interface GoldFreezeV2 {
  schemaVersion: 1;
  artifactType: 'GOLD_FREEZE';
  benchmarkId: 'phase4.6b-external-benchmark-v2';
  sourceBenchmarkPath: string;
  sourceBenchmarkGitBlobSha1: string;
  sourceBenchmarkMetadataVersion: '2.0.0-draft';
  promotedGoldVersion: '2.0.0';
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

export function validateHumanSignoff(data: unknown): HumanSignoffV2 {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('HUMAN_SIGNOFF_INVALID');
  const d = data as Record<string, any>;
  if (d.schemaVersion !== 1 || d.artifactType !== 'HUMAN_GOVERNANCE_SIGNOFF') throw new Error('HUMAN_SIGNOFF_HEADER_INVALID');
  if (d.benchmarkId !== 'phase4.6b-external-benchmark-v2' || d.decision !== 'APPROVE') throw new Error('HUMAN_SIGNOFF_DECISION_INVALID');
  if (!d.reviewer || !nonEmpty(d.reviewer.githubLogin) || !nonEmpty(d.reviewer.role)) throw new Error('HUMAN_SIGNOFF_REVIEWER_INVALID');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(d.approvedAt ?? '')) throw new Error('HUMAN_SIGNOFF_DATE_INVALID');
  if (!d.scope || d.scope.policyAndGovernance !== true || d.scope.representativeHighRiskCases !== true || d.scope.ambiguityPreservation !== true || d.scope.provenanceModel !== true || d.scope.consolidationIntegrity !== true) throw new Error('HUMAN_SIGNOFF_SCOPE_INCOMPLETE');
  if (d.scope.caseByCaseReAdjudicationClaimed !== false) throw new Error('HUMAN_SIGNOFF_CASE_BY_CASE_CLAIM_FORBIDDEN');
  if (!nonEmpty(d.caseLevelPrimaryReviewer) || !d.caseLevelPrimaryReviewer.includes('AI_SPECIALIST')) throw new Error('HUMAN_SIGNOFF_AI_PROVENANCE_INVALID');
  if (!nonEmpty(d.notes)) throw new Error('HUMAN_SIGNOFF_NOTES_INVALID');
  return d as unknown as HumanSignoffV2;
}

export function loadHumanSignoff(): HumanSignoffV2 {
  return validateHumanSignoff(JSON.parse(fs.readFileSync(SIGNOFF_PATH, 'utf8')));
}

export function computeGitBlobSha1(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}

export function loadGoldFreeze(): GoldFreezeV2 {
  return JSON.parse(fs.readFileSync(FREEZE_PATH, 'utf8')) as GoldFreezeV2;
}

export function assertFrozenBenchmarkIntegrity(): GoldFreezeV2 {
  const signoff = loadHumanSignoff();
  const freeze = loadGoldFreeze();
  const benchmark = validateSingleValidationCorpusV2(JSON.parse(fs.readFileSync(BENCHMARK_PATH, 'utf8')));

  if (freeze.schemaVersion !== 1 || freeze.artifactType !== 'GOLD_FREEZE') throw new Error('GOLD_FREEZE_HEADER_INVALID');
  if (freeze.benchmarkId !== signoff.benchmarkId || freeze.promotionStatus !== 'HUMAN_APPROVED_FROZEN') throw new Error('GOLD_FREEZE_PROMOTION_INVALID');
  if (freeze.sourceBenchmarkPath !== BENCHMARK_REPO_PATH || freeze.humanSignoffPath !== SIGNOFF_REPO_PATH) throw new Error('GOLD_FREEZE_PATH_INVALID');
  if (freeze.sourceBenchmarkMetadataVersion !== '2.0.0-draft' || freeze.promotedGoldVersion !== '2.0.0') throw new Error('GOLD_FREEZE_VERSION_INVALID');
  if (freeze.frozenAt !== signoff.approvedAt || freeze.caseCount !== 108) throw new Error('GOLD_FREEZE_METADATA_INVALID');
  if (freeze.engineEvaluationPerformedAtFreeze !== false || freeze.phase46CAuthorized !== true) throw new Error('GOLD_FREEZE_AUTHORIZATION_INVALID');
  if (freeze.caseLevelPrimaryReviewer !== signoff.caseLevelPrimaryReviewer) throw new Error('GOLD_FREEZE_PROVENANCE_INVALID');
  if (computeGitBlobSha1(BENCHMARK_PATH) !== freeze.sourceBenchmarkGitBlobSha1) throw new Error('GOLD_FREEZE_BENCHMARK_CHANGED');
  if (benchmark.metadata.id !== freeze.benchmarkId || benchmark.metadata.version !== freeze.sourceBenchmarkMetadataVersion) throw new Error('GOLD_FREEZE_BENCHMARK_METADATA_MISMATCH');

  const counts = benchmark.cases.reduce((a, c) => {
    a[c.expected.disposition] += 1;
    return a;
  }, { FINAL: 0, REVIEW_REQUIRED: 0, UNRESOLVED: 0 });
  if (counts.FINAL !== 103 || counts.REVIEW_REQUIRED !== 5 || counts.UNRESOLVED !== 0) throw new Error('GOLD_FREEZE_COUNTS_INVALID');
  if (JSON.stringify(counts) !== JSON.stringify(freeze.dispositionCounts)) throw new Error('GOLD_FREEZE_COUNTS_MISMATCH');

  const ids = benchmark.cases.filter(c => c.expected.disposition === 'REVIEW_REQUIRED').map(c => c.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify([...EXPECTED_REVIEW_IDS].sort())) throw new Error('GOLD_FREEZE_REVIEW_IDS_INVALID');
  if (JSON.stringify(ids) !== JSON.stringify([...freeze.reviewRequiredIds].sort())) throw new Error('GOLD_FREEZE_REVIEW_IDS_MISMATCH');

  return freeze;
}
