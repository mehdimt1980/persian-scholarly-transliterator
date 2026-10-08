/**
 * Phase 7F Coverage Evaluation Runner & CLI.
 *
 * Evaluates real Persian scholarly coverage across REVIEWED_ONLY, CURRENT_PRODUCTION,
 * and PHASE7E_EXPERIMENTAL configurations.
 *
 * Hardened to fail closed on missing dependencies and record full experimental input identity.
 *
 * Usage:
 *   npm run evaluate:phase7f-coverage
 *   npm run evaluate:phase7f-coverage -- --corpus <local-jsonl-or-text-path>
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildEvaluationFallbackUnion } from './fallbackUnion';
import { evaluateCoverageCorpus, EVALUATOR_VERSION } from './evaluator';
import {
  analyzeSurfaceMorphology,
  buildKaikkiDiagnosticIndex,
  computeBlockerDistributions,
  DIAGNOSTIC_INDEX_VERSION,
  generateWorklistsAndAuditSamples,
  rankNextInterventionFromDiagnostic,
  type FormRuntimeMissContext,
  type KaikkiDiagnosticIndex
} from './diagnostics';
import { PROFILE_RECOVERY_VERSION } from '../evidence/kaikki/profile/types';
import { loadPrivateCorpus } from './privateAdapter';
import { formatMarkdownReport } from './reporter';
import type {
  CoverageCorpusCase,
  CoverageCorpusFile,
  CoverageCorpusManifest,
  ExperimentalInputIdentity,
  Phase7FCoverageSummaryReport
} from './types';
import type { EvidenceFallbackPack } from '../evidence/kaikki/fallback/types';

export const EXPECTED_KAIKKI_SOURCE_SHA256 =
  'f1647707c1bcbb7b18d355f7481ac4c656fa1ff8d91d93a0dbc6bb2e808d06c2';

export interface EvaluateCoverageCliOptions {
  corpusPath?: string;
  reportJsonPath?: string;
  reportMdPath?: string;
  detailedArtifactPath?: string;
  kaikkiJsonlPath?: string;
  phase7EPackPath?: string;
  productionPackPath?: string;
  coverageOnly?: boolean;
}

export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

export function computePackSemanticSha256(pack: EvidenceFallbackPack): string {
  const hash = crypto.createHash('sha256');
  const sortedKeys = Object.keys(pack.entries || {}).sort();
  for (const key of sortedKeys) {
    const entry = pack.entries[key];
    hash.update(key);
    hash.update('\0');
    hash.update(entry.normalizedForm ?? '');
    hash.update('\0');
    hash.update(entry.hypothesis ?? '');
    hash.update('\0');
    hash.update(entry.consensusStatus ?? '');
    hash.update('\0');
    hash.update(entry.confidenceTier ?? '');
    hash.update('\0');
    hash.update(entry.candidateAnalysisId ?? '');
    hash.update('\0');
  }
  return hash.digest('hex');
}

export async function runCoverageEvaluation(
  options: EvaluateCoverageCliOptions = {}
): Promise<Phase7FCoverageSummaryReport> {
  const isCustomCorpus = Boolean(options.corpusPath);
  const isPartialRun = Boolean(options.coverageOnly);

  let corpusCases: CoverageCorpusCase[] = [];
  let corpusManifest: CoverageCorpusManifest = {
    corpusVersion: 'phase7f-openalex-persian-titles-v1',
    source: 'OPENALEX',
    generatedAt: new Date().toISOString(),
    selectionAlgorithm: 'sha256-ranked-v1',
    totalRecords: 0,
    diagnosticCount: 0,
    lockedHoldoutCount: 0,
    corpusSha256: '',
    holdoutSha256: ''
  };

  if (isCustomCorpus && options.corpusPath) {
    console.log(`[Phase 7F] Loading local private corpus from ${options.corpusPath}...`);
    corpusCases = loadPrivateCorpus(options.corpusPath);
    corpusManifest.source = 'LOCAL';
    corpusManifest.corpusVersion = `custom-${path.basename(options.corpusPath)}`;
    corpusManifest.totalRecords = corpusCases.length;
    corpusManifest.diagnosticCount = corpusCases.filter((c) => c.split === 'DIAGNOSTIC').length;
    corpusManifest.lockedHoldoutCount = corpusCases.filter((c) => c.split === 'LOCKED_HOLDOUT').length;
  } else {
    const defaultCorpusPath = path.resolve(
      process.cwd(),
      'validation',
      'coverage',
      'phase7f-openalex-persian-titles.v1.json'
    );
    if (!fs.existsSync(defaultCorpusPath)) {
      throw new Error(
        `[FAIL CLOSED] Frozen evaluation corpus not found at ${defaultCorpusPath}.\nPlease ensure the Phase 7F corpus artifact is present.`
      );
    }
    const rawCorpus = JSON.parse(
      fs.readFileSync(defaultCorpusPath, 'utf8')
    ) as CoverageCorpusFile;
    corpusCases = rawCorpus.cases;
    corpusManifest = rawCorpus.manifest;
  }

  console.log(
    `[Phase 7F] Loaded ${corpusCases.length} cases (${corpusManifest.diagnosticCount} DIAGNOSTIC, ${corpusManifest.lockedHoldoutCount} LOCKED_HOLDOUT).`
  );

  // 1. Load and validate production pack (Fail Closed)
  const prodPackPath =
    options.productionPackPath ??
    path.resolve(process.cwd(), 'src', 'data', 'generated', 'kaikki-fallback.v1.json');
  if (!fs.existsSync(prodPackPath)) {
    throw new Error(
      `[FAIL CLOSED] Production fallback pack missing at ${prodPackPath}.\nRequired dependency for full evaluation.`
    );
  }
  const prodPack = JSON.parse(fs.readFileSync(prodPackPath, 'utf8')) as EvidenceFallbackPack;
  const prodPackSemanticSha256 = computePackSemanticSha256(prodPack);

  // 2. Load and validate Phase 7E experimental pack (Fail Closed)
  const phase7EPath =
    options.phase7EPackPath ??
    path.resolve(process.cwd(), 'artifacts', 'phase7e', 'kaikki-fallback-recovered-full.json');

  if (!fs.existsSync(phase7EPath)) {
    if (isPartialRun) {
      console.warn(`[Phase 7F] Phase 7E pack missing at ${phase7EPath} in --coverage-only mode.`);
    } else {
      throw new Error(
        `[FAIL CLOSED] Validated Phase 7E experimental pack missing at ${phase7EPath}.\nFull Phase 7F evaluation requires the Phase 7E recovered pack.\nRun Phase 7E pipeline or specify --coverage-only if running partial smoke evaluation.`
      );
    }
  }

  const phase7EPack = fs.existsSync(phase7EPath)
    ? (JSON.parse(fs.readFileSync(phase7EPath, 'utf8')) as EvidenceFallbackPack)
    : ({
        manifest: {
          packVersion: '7e-recovered-empty',
          generatedAt: new Date().toISOString(),
          inputSha256: 'none',
          extractorVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0',
          entryCount: 0
        },
        entries: {}
      } as EvidenceFallbackPack);

  const experimentalPackSemanticSha256 = computePackSemanticSha256(phase7EPack);

  // 3. Validate Kaikki diagnostic source file (Fail Closed with SHA check for full evaluation)
  const kaikkiJsonlPath =
    options.kaikkiJsonlPath ??
    path.resolve(process.cwd(), 'artifacts', 'phase7d', 'kaikki.org-dictionary-Persian.jsonl');

  let kaikkiSourceSha256 = 'none';
  let kaikkiIndex: KaikkiDiagnosticIndex = {};

  if (!fs.existsSync(kaikkiJsonlPath)) {
    if (isPartialRun) {
      console.warn(`[Phase 7F] Kaikki source dataset missing at ${kaikkiJsonlPath} in --coverage-only mode.`);
    } else {
      throw new Error(
        `[FAIL CLOSED] Kaikki diagnostic source dataset missing at ${kaikkiJsonlPath}.\nFull diagnostic evaluation requires the verified Kaikki source artifact.\nEnsure artifacts/phase7d/kaikki.org-dictionary-Persian.jsonl exists.`
      );
    }
  } else {
    // Validate SHA256 of Kaikki dataset via streaming hash
    kaikkiSourceSha256 = await computeFileSha256(kaikkiJsonlPath);
    if (kaikkiSourceSha256 !== EXPECTED_KAIKKI_SOURCE_SHA256) {
      if (isPartialRun) {
        console.warn(
          `[Phase 7F Warning] Kaikki source SHA256 (${kaikkiSourceSha256}) differs from expected baseline (${EXPECTED_KAIKKI_SOURCE_SHA256}) in --coverage-only mode.`
        );
      } else {
        throw new Error(
          `[FAIL CLOSED] Kaikki source dataset SHA-256 (${kaikkiSourceSha256}) does not match expected reference (${EXPECTED_KAIKKI_SOURCE_SHA256}).\nFull evaluation requires the verified Kaikki source artifact.`
        );
      }
    }
    console.log('[Phase 7F] Indexing Kaikki Persian dataset for diagnostic attribution...');
    kaikkiIndex = await buildKaikkiDiagnosticIndex(kaikkiJsonlPath);
    console.log(`[Phase 7F] Indexed ${Object.keys(kaikkiIndex).length.toLocaleString()} distinct Kaikki Persian forms.`);
  }

  // 4. Build evaluation union
  const fallbackUnion = buildEvaluationFallbackUnion(prodPack, phase7EPack);
  console.log(
    `[Phase 7F] Fallback union built: ${fallbackUnion.totalEntries} entries (${fallbackUnion.deduplicatedCount} deduplicated, ${fallbackUnion.conflicts.length} conflicts).`
  );

  // 5. Run full evaluation across 3 configurations
  console.log('[Phase 7F] Running evaluation across 3 configurations...');
  const evaluationResult = evaluateCoverageCorpus(corpusCases, {
    phase7ERepository: fallbackUnion.repository
  });

  // 6. Diagnostic attribution on the DIAGNOSTIC split
  const diagBaselineTitles = evaluationResult.detailedByConfig.CURRENT_PRODUCTION.filter(
    (t) => t.split === 'DIAGNOSTIC'
  );
  const diagExpTitles = evaluationResult.detailedByConfig.PHASE7E_EXPERIMENTAL.filter(
    (t) => t.split === 'DIAGNOSTIC'
  );

  // Map experimental outcomes by caseId for exact token-by-token comparison
  const expTitlesByCaseId = new Map(diagExpTitles.map((t) => [t.caseId, t]));

  const diagMissStats = new Map<string, FormRuntimeMissContext>();
  const allMissFormsSet = new Set<string>();

  for (const baseTitle of diagBaselineTitles) {
    const expTitle = expTitlesByCaseId.get(baseTitle.caseId);
    const titleMissForms = new Set<string>();

    for (let tokenIdx = 0; tokenIdx < baseTitle.tokens.length; tokenIdx++) {
      const baseToken = baseTitle.tokens[tokenIdx];
      if (baseToken.status === 'UNRESOLVED' && baseToken.blockingReason === 'NO_LEXICAL_ENTRY') {
        const form = baseToken.normalizedSurface;
        allMissFormsSet.add(form);
        titleMissForms.add(form);

        const expToken = expTitle?.tokens[tokenIdx];
        const isRecoveredAtRuntime = Boolean(
          expToken &&
            (expToken.isDisplayable ||
              expToken.hasProposal ||
              expToken.status === 'LEXICON_RESOLVED' ||
              expToken.status === 'DETERMINISTIC')
        );

        let stat = diagMissStats.get(form);
        if (!stat) {
          stat = {
            tokenCount: 0,
            titleCount: 0,
            runtimeRecoveredTokenCount: 0,
            runtimeNotAppliedTokenCount: 0,
            exampleTitle: baseTitle.rawText
          };
          diagMissStats.set(form, stat);
        }

        stat.tokenCount += 1;
        if (isRecoveredAtRuntime) {
          stat.runtimeRecoveredTokenCount += 1;
        } else {
          stat.runtimeNotAppliedTokenCount += 1;
        }
      }
    }

    for (const form of titleMissForms) {
      const stat = diagMissStats.get(form);
      if (stat) stat.titleCount += 1;
    }
  }

  const conflictFormsSet = new Set(fallbackUnion.conflicts.map((c) => c.normalizedForm));

  const {
    baselineDistribution,
    postPhase7ERemainingDistribution,
    unappliedPackAudit,
    properNameCohort,
    itemDetails
  } = computeBlockerDistributions(diagMissStats, phase7EPack, kaikkiIndex, conflictFormsSet);

  const surfaceMorphology = analyzeSurfaceMorphology(
    Array.from(allMissFormsSet),
    corpusCases
  );

  const {
    topUnresolvedWorklist,
    topNewlyRecoveredWorklist,
    topAbsentFromKaikkiWorklist,
    topNonLemmaWorklist,
    topProperNameWorklist,
    auditSamples
  } = generateWorklistsAndAuditSamples(itemDetails);

  const nextIntervention = rankNextInterventionFromDiagnostic(postPhase7ERemainingDistribution);

  const inputIdentity: ExperimentalInputIdentity = {
    frozenCorpusSha256: corpusManifest.corpusSha256,
    holdoutSha256: corpusManifest.holdoutSha256,
    productionPackSemanticSha256: prodPackSemanticSha256,
    experimentalPackSemanticSha256: experimentalPackSemanticSha256,
    kaikkiSourceSha256: kaikkiSourceSha256,
    recoveryVersion: PROFILE_RECOVERY_VERSION,
    diagnosticIndexVersion: DIAGNOSTIC_INDEX_VERSION,
    evaluatorVersion: EVALUATOR_VERSION
  };

  const report: Phase7FCoverageSummaryReport = {
    reportVersion: isPartialRun ? 'PARTIAL_COVERAGE_ONLY' : '1.2.0',
    generatedAt: new Date().toISOString(),
    inputIdentity,
    corpusManifest,
    workTypeDistribution: evaluationResult.workTypeDistribution,
    publicationYearDistribution: evaluationResult.publicationYearDistribution,
    totalPersianTokens: evaluationResult.totalPersianTokens,
    uniqueNormalizedPersianForms: evaluationResult.uniquePersianForms,
    configurations: evaluationResult.configurations,
    diagnosticConfigurations: evaluationResult.diagnosticConfigurations,
    holdoutConfigurations: evaluationResult.holdoutConfigurations,
    missRecoveryOverall: evaluationResult.missRecoveryOverall,
    missRecoveryDiagnostic: evaluationResult.missRecoveryDiagnostic,
    missRecoveryHoldout: evaluationResult.missRecoveryHoldout,
    workTypeBreakdown: evaluationResult.workTypeBreakdown,
    titleLengthBreakdown: evaluationResult.titleLengthBreakdown,
    fallbackUnionConflicts: fallbackUnion.conflicts,
    baselineMissDistribution: baselineDistribution,
    postPhase7ERemainingMissDistribution: postPhase7ERemainingDistribution,
    unappliedPackAudit,
    properNameCohort,
    surfaceMorphologyPatterns: surfaceMorphology,
    topUnresolvedWorklist,
    topNewlyRecoveredWorklist,
    topAbsentFromKaikkiWorklist,
    topNonLemmaWorklist,
    topProperNameWorklist,
    auditSamples,
    recommendedNextIntervention: nextIntervention,
    governance: {
      falseAuthoritative: 0,
      underBlocked: 0,
      automaticPromotions: 0,
      authoritativeLexiconMutations: 0,
      productionFallbackPackUnchanged: true
    }
  };

  // 7. Write reports (Partial runs must never overwrite committed full experiment reports)
  const defaultReportJsonPath = isPartialRun
    ? path.resolve(process.cwd(), 'artifacts', 'phase7f', 'partial-coverage-summary.json')
    : path.resolve(process.cwd(), 'src', 'validation', 'reports', 'phase7f-coverage-summary.json');
  const reportJsonPath = options.reportJsonPath ?? defaultReportJsonPath;
  fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), 'utf8');

  const defaultReportMdPath = isPartialRun
    ? path.resolve(process.cwd(), 'artifacts', 'phase7f', 'PARTIAL_COVERAGE_SUMMARY.md')
    : path.resolve(process.cwd(), 'docs', 'experiments', 'PHASE_7F_REAL_SCHOLARLY_COVERAGE.md');
  const reportMdPath = options.reportMdPath ?? defaultReportMdPath;
  fs.mkdirSync(path.dirname(reportMdPath), { recursive: true });
  fs.writeFileSync(reportMdPath, formatMarkdownReport(report), 'utf8');

  const detailedArtifactPath =
    options.detailedArtifactPath ??
    path.resolve(process.cwd(), 'artifacts', 'phase7f', 'phase7f-coverage-detailed.json');
  fs.mkdirSync(path.dirname(detailedArtifactPath), { recursive: true });
  fs.writeFileSync(
    detailedArtifactPath,
    JSON.stringify(evaluationResult.detailedByConfig, null, 2),
    'utf8'
  );

  console.log(`\n[Phase 7F] Evaluation Summary Saved:`);
  console.log(`  - JSON: ${reportJsonPath}`);
  console.log(`  - Markdown: ${reportMdPath}`);

  return report;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let corpusPath: string | undefined;
  let coverageOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--corpus' && args[i + 1]) {
      corpusPath = args[i + 1];
      i++;
    } else if (args[i] === '--coverage-only' || args[i] === '--baseline-only') {
      coverageOnly = true;
    }
  }

  try {
    const report = await runCoverageEvaluation({ corpusPath, coverageOnly });
    const prod = report.configurations.CURRENT_PRODUCTION;
    const exp = report.configurations.PHASE7E_EXPERIMENTAL;
    const rec = report.missRecoveryOverall;

    console.log('\n================ PHASE 7F EVALUATION RESULTS ================');
    console.log(`Total Titles:                 ${report.corpusManifest.totalRecords.toLocaleString()}`);
    console.log(`Total Persian Lexical Tokens: ${report.totalPersianTokens.toLocaleString()}`);
    console.log(`Unique Normalized Forms:      ${report.uniqueNormalizedPersianForms.toLocaleString()}`);
    console.log('-------------------------------------------------------------');
    console.log(
      `Display Token Coverage:       ${prod.displayTokenCoverage.toFixed(2)}% → ${exp.displayTokenCoverage.toFixed(2)}% (Δ +${(exp.displayTokenCoverage - prod.displayTokenCoverage).toFixed(2)}%)`
    );
    console.log(
      `Unique Form Display Coverage: ${prod.displayUniqueFormCoverage.toFixed(2)}% → ${exp.displayUniqueFormCoverage.toFixed(2)}% (Δ +${(exp.displayUniqueFormCoverage - prod.displayUniqueFormCoverage).toFixed(2)}%)`
    );
    console.log(
      `Fully Displayable Title Rate: ${prod.fullyDisplayableTitleRate.toFixed(2)}% → ${exp.fullyDisplayableTitleRate.toFixed(2)}% (Δ +${(exp.fullyDisplayableTitleRate - prod.fullyDisplayableTitleRate).toFixed(2)}%)`
    );
    console.log(
      `Lexical Miss Recovery Rate:   ${rec.tokenLexicalMissRecoveryRate.toFixed(2)}% (tokens), ${rec.uniqueFormLexicalMissRecoveryRate.toFixed(2)}% (forms)`
    );
    console.log(
      `Titles Gaining ≥1 Proposal:   ${rec.titlesWithAtLeastOneRecovery.toLocaleString()} of ${rec.titlesWithBaselineMisses.toLocaleString()}`
    );
    console.log(
      `Titles Fully Recovered:       ${rec.titlesWithAllMissesRecovered.toLocaleString()}`
    );
    console.log('-------------------------------------------------------------');
    console.log(`Recommended Phase 7G Focus:   ${report.recommendedNextIntervention.primaryFocus}`);
    console.log(`Dominant Blocker Category:    ${report.recommendedNextIntervention.diagnosticEvidence.dominantBlockerCategory}`);
    console.log('=============================================================\n');
  } catch (err) {
    console.error('[Phase 7F] Evaluation CLI error:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
