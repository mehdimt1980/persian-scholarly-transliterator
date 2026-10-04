import * as fs from 'fs';
import * as path from 'path';
import { validateBibliographyCorpus, validateSingleCorpus } from './schema';
import { runSingleCase } from './runSingleCase';
import { runBibliographyCase } from './runBibliographyCase';
import { computeValidationMetrics } from './metrics';
import { evaluateReleaseGates } from './releaseGate';
import { generateTextReport } from './report';
import { CaseEvaluationResult } from './types';

export function runCorpusValidation(corpusDir?: string): { success: boolean; report: string } {
  const baseDir = corpusDir || path.resolve(process.cwd(), 'validation', 'corpus');
  const singleFile = path.join(baseDir, 'pilot.single.json');
  const bibFile = path.join(baseDir, 'pilot.bibliography.json');

  if (!fs.existsSync(singleFile)) {
    throw new Error(`Single validation corpus file not found at: ${singleFile}`);
  }

  const singleRaw = JSON.parse(fs.readFileSync(singleFile, 'utf-8'));
  const singleCorpus = validateSingleCorpus(singleRaw);

  const results: CaseEvaluationResult[] = [];

  // Run single cases
  for (const testCase of singleCorpus.cases) {
    const res = runSingleCase(testCase);
    results.push(res);
  }

  // Run bibliography cases if file exists
  if (fs.existsSync(bibFile)) {
    const bibRaw = JSON.parse(fs.readFileSync(bibFile, 'utf-8'));
    const bibCorpus = validateBibliographyCorpus(bibRaw);

    for (const bCase of bibCorpus.cases) {
      const bRes = runBibliographyCase(bCase);
      // Map to single-evaluation style for global metrics
      results.push({
        caseId: bCase.id,
        input: bCase.record.title,
        profile: 'ijmes_full',
        category: 'BOOK_TITLE',
        expectedDisposition: bCase.expected.readiness === 'READY' ? 'FINAL' : 'REVIEW_REQUIRED',
        expectedCanonicals: [],
        actualStatus: bRes.actualReadiness,
        actualOutput: bCase.record.title,
        actualCopyable: bRes.actualReadiness === 'READY',
        actualReviewIssueTypes: [],
        classification: bRes.classification,
        reasons: bRes.reasons,
        provenance: bCase.provenance
      });
    }
  }

  const metrics = computeValidationMetrics(results);
  const gateResult = evaluateReleaseGates(metrics, { isPilot: true });
  const textReport = generateTextReport(singleCorpus.metadata, results, metrics, gateResult);

  return {
    success: gateResult.passed,
    report: textReport
  };
}

if (require.main === module || (typeof process !== 'undefined' && process.argv[1] && process.argv[1].includes('cli.ts'))) {
  try {
    const { success, report } = runCorpusValidation();
    console.log(report);
    if (!success) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Validation runner error:', err?.message || err);
    process.exit(1);
  }
}
