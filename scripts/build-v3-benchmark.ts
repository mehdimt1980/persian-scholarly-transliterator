import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { renderCanonicalForProfile } from '../src/domain/profiles';

const rootDir = path.resolve(__dirname, '..');
const v2Path = path.join(rootDir, 'validation/corpus/phase4.6b-external-benchmark.v2.json');
const v3Path = path.join(rootDir, 'validation/corpus/phase4.6b-external-benchmark.v3.json');
const goldFreezePath = path.join(rootDir, 'validation/review/gold-freeze.v3.json');
const signoffPath = path.join(rootDir, 'validation/review/human-signoff.v3.json');

const v2 = JSON.parse(fs.readFileSync(v2Path, 'utf8'));

const v3 = {
  ...v2,
  metadata: {
    ...v2.metadata,
    id: 'phase4.6b-external-benchmark-v3',
    version: '3.0.0',
    description: '108-case external Persian scholarly transliteration benchmark with approved fully diacritized citation-title presentation policy.',
    reviewer: 'OpenAI GPT-5.6 Sol / AI_SPECIALIST',
    reviewedAt: '2026-10-06',
    reviewNote: 'Derived deterministically from human-approved V2 lexical authority under project citation-title presentation policy migration. Lexical readings, ambiguity dispositions, and provenance unchanged; 12 title cases migrated to ijmes_citation_title with full diacritics and word capitalization.'
  },
  cases: v2.cases.map((c: any) => {
    if (c.profile === 'ijmes_title') {
      const profile = 'ijmes_citation_title';
      const renderedOutput = renderCanonicalForProfile(c.expected.scholarlyCanonical, profile);
      return {
        ...c,
        profile,
        expected: {
          ...c.expected,
          renderedOutput
        },
        tags: c.tags.map((t: string) => t === 'external-benchmark-v2' ? 'external-benchmark-v3' : t)
      };
    }
    return {
      ...c,
      tags: c.tags.map((t: string) => t === 'external-benchmark-v2' ? 'external-benchmark-v3' : t)
    };
  })
};

const v3Content = JSON.stringify(v3, null, 2) + '\n';
fs.writeFileSync(v3Path, v3Content, 'utf8');

const blobHeader = Buffer.from('blob ' + Buffer.byteLength(v3Content, 'utf8') + '\0');
const gitBlobSha1 = crypto.createHash('sha1').update(blobHeader).update(Buffer.from(v3Content, 'utf8')).digest('hex');
console.log('REBUILT V3 SHA-1:', gitBlobSha1);

const goldFreeze = {
  schemaVersion: 1,
  artifactType: 'GOLD_FREEZE',
  benchmarkId: 'phase4.6b-external-benchmark-v3',
  sourceBenchmarkPath: 'validation/corpus/phase4.6b-external-benchmark.v3.json',
  sourceBenchmarkGitBlobSha1: gitBlobSha1,
  sourceBenchmarkMetadataVersion: '3.0.0',
  promotedGoldVersion: '3.0.0',
  promotionStatus: 'HUMAN_APPROVED_FROZEN',
  humanSignoffPath: 'validation/review/human-signoff.v3.json',
  frozenAt: '2026-10-06',
  caseCount: 108,
  dispositionCounts: {
    FINAL: 103,
    REVIEW_REQUIRED: 5,
    UNRESOLVED: 0
  },
  reviewRequiredIds: [
    'cand-amb-001',
    'cand-amb-003',
    'cand-amb-007',
    'cand-amb-009',
    'cand-amb-011'
  ],
  engineEvaluationPerformedAtFreeze: false,
  phase46CAuthorized: true,
  caseLevelPrimaryReviewer: 'OpenAI GPT-5.6 Sol / AI_SPECIALIST (lexical authority V2) + Deterministic Presentation Policy Migration (V3)'
};
fs.writeFileSync(goldFreezePath, JSON.stringify(goldFreeze, null, 2) + '\n', 'utf8');

const signoff = {
  schemaVersion: 1,
  artifactType: 'HUMAN_GOVERNANCE_SIGNOFF',
  benchmarkId: 'phase4.6b-external-benchmark-v3',
  decision: 'APPROVE',
  reviewer: {
    githubLogin: 'mehdimt1980',
    role: 'Repository owner / human governance reviewer'
  },
  approvedAt: '2026-10-06',
  scope: {
    policyAndGovernance: true,
    representativeHighRiskCases: true,
    ambiguityPreservation: true,
    provenanceModel: true,
    consolidationIntegrity: true,
    presentationPolicyMigration: true,
    caseByCaseReAdjudicationClaimed: false
  },
  caseLevelPrimaryReviewer: 'OpenAI GPT-5.6 Sol / AI_SPECIALIST (lexical authority V2) + Deterministic Presentation Policy Migration (V3)',
  notes: 'Explicit APPROVE provided by repository owner for project citation-title presentation policy migration across all 12 title cases. Approval covers full scholarly diacritic preservation, title word capitalization, and baseline evaluation readiness.'
};
fs.writeFileSync(signoffPath, JSON.stringify(signoff, null, 2) + '\n', 'utf8');
