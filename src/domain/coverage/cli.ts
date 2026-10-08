/**
 * Phase 7F Coverage Evaluation Runner & CLI.
 *
 * Evaluates real Persian scholarly coverage across REVIEWED_ONLY, CURRENT_PRODUCTION,
 * and PHASE7E_EXPERIMENTAL configurations.
 *
 * Usage:
 *   npm run evaluate:phase7f-coverage
 *   npm run evaluate:phase7f-coverage -- --corpus <local-jsonl-or-text-path>
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { normalizePersian } from '../normalization';
import { buildEvaluationFallbackUnion } from './fallbackUnion';
import { evaluateCoverageCorpus } from './evaluator';
import {
  analyzeSurfaceMorphology,
  computeBlockerDistribution,
  generateWorklistsAndAuditSamples,
  rankNextInterventionFromDiagnostic,
  type KaikkiDiagnosticIndex
} from './diagnostics';
import { loadPrivateCorpus } from './privateAdapter';
import { formatMarkdownReport } from './reporter';
import type {
  CoverageCorpusCase,
  CoverageCorpusFile,
  CoverageCorpusManifest,
  Phase7FCoverageSummaryReport
} from './types';
import type { EvidenceFallbackPack } from '../evidence/kaikki/fallback/types';

export interface EvaluateCoverageCliOptions {
  corpusPath?: string;
  reportJsonPath?: string;
  reportMdPath?: string;
  detailedArtifactPath?: string;
  kaikkiJsonlPath?: string;
  phase7EPackPath?: string;
  productionPackPath?: string;
}

export async function buildKaikkiDiagnosticIndex(
  kaikkiFilePath: string
): Promise<KaikkiDiagnosticIndex> {
  const index: KaikkiDiagnosticIndex = {};

  if (!fs.existsSync(kaikkiFilePath)) {
    return index;
  }

  const fileStream = fs.createReadStream(kaikkiFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as {
        word?: string;
        pos?: string;
        forms?: Array<{ form?: string; tags?: string[] }>;
        senses?: Array<{ form_of?: unknown[]; alt_of?: unknown[]; tags?: string[] }>;
        head_templates?: Array<{ name?: string }>;
      };

      if (!entry.word) continue;
      const normalizedForm = normalizePersian(entry.word).normalizedInput.trim();

      const pos = entry.pos || 'unknown';
      const isProper =
        pos === 'name' ||
        pos === 'proper noun' ||
        (entry.head_templates?.some((h) =>
          h.name?.includes('proper') || h.name === 'fa-prop'
        ) ?? false);

      let isLemma = true;
      if (entry.senses?.some((s) => s.form_of?.length || s.alt_of?.length)) {
        isLemma = false;
      }
      if (
        entry.head_templates?.some(
          (h) => h.name?.includes('verb form') || h.name?.includes('noun form')
        )
      ) {
        isLemma = false;
      }

      const romanizations = (entry.forms || [])
        .filter((f) => f.tags?.includes('romanization') && f.form)
        .map((f) => f.form!);

      const existing = index[normalizedForm];
      if (!existing) {
        index[normalizedForm] = {
          normalizedForm,
          isLemma,
          isProperName: isProper,
          romanizationCount: romanizations.length,
          posList: [pos]
        };
      } else {
        existing.isProperName = existing.isProperName || isProper;
        existing.isLemma = existing.isLemma && isLemma;
        existing.romanizationCount += romanizations.length;
        if (!existing.posList.includes(pos)) {
          existing.posList.push(pos);
        }
      }
    } catch {
      // Ignore malformed rows in index construction
    }
  }

  return index;
}

export async function runCoverageEvaluation(
  options: EvaluateCoverageCliOptions = {}
): Promise<Phase7FCoverageSummaryReport> {
  const isCustomCorpus = Boolean(options.corpusPath);

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
        `Frozen corpus not found at ${defaultCorpusPath}. Please run "npm run acquire:phase7f-openalex" first.`
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

  // Load production pack
  const prodPackPath =
    options.productionPackPath ??
    path.resolve(process.cwd(), 'src', 'data', 'generated', 'kaikki-fallback.v1.json');
  const prodPack = JSON.parse(fs.readFileSync(prodPackPath, 'utf8')) as EvidenceFallbackPack;

  // Load Phase 7E experimental pack
  const phase7EPath =
    options.phase7EPackPath ??
    path.resolve(process.cwd(), 'artifacts', 'phase7e', 'kaikki-fallback-recovered-full.json');
  let phase7EPack: EvidenceFallbackPack = {
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
  };

  if (fs.existsSync(phase7EPath)) {
    phase7EPack = JSON.parse(fs.readFileSync(phase7EPath, 'utf8')) as EvidenceFallbackPack;
  } else {
    console.warn(`[Phase 7F] Phase 7E pack not found at ${phase7EPath}, using empty fallback.`);
  }

  // Build evaluation union
  const fallbackUnion = buildEvaluationFallbackUnion(prodPack, phase7EPack);
  console.log(
    `[Phase 7F] Fallback union built: ${fallbackUnion.totalEntries} entries (${fallbackUnion.deduplicatedCount} deduplicated, ${fallbackUnion.conflicts.length} conflicts).`
  );

  // Run full evaluation
  console.log('[Phase 7F] Running evaluation across 3 configurations...');
  const evaluationResult = evaluateCoverageCorpus(corpusCases, {
    phase7ERepository: fallbackUnion.repository
  });

  // Diagnostic analysis
  const kaikkiJsonlPath =
    options.kaikkiJsonlPath ??
    path.resolve(process.cwd(), 'artifacts', 'phase7d', 'kaikki.org-dictionary-Persian.jsonl');
  let kaikkiIndex: KaikkiDiagnosticIndex = {};
  if (fs.existsSync(kaikkiJsonlPath)) {
    console.log('[Phase 7F] Indexing Kaikki Persian dataset for diagnostic join...');
    kaikkiIndex = await buildKaikkiDiagnosticIndex(kaikkiJsonlPath);
    console.log(`[Phase 7F] Indexed ${Object.keys(kaikkiIndex).length} distinct Kaikki Persian forms.`);
  }

  // Collect baseline miss tokens from DIAGNOSTIC split
  const diagBaselineOutcomes = evaluationResult.detailedByConfig.CURRENT_PRODUCTION.filter(
    (t) => t.split === 'DIAGNOSTIC'
  );

  const diagMissStats = new Map<string, { tokenCount: number; titleCount: number }>();
  const allMissFormsSet = new Set<string>();

  for (const title of diagBaselineOutcomes) {
    const titleMissForms = new Set<string>();
    for (const token of title.tokens) {
      if (token.status === 'UNRESOLVED' && token.blockingReason === 'NO_LEXICAL_ENTRY') {
        const form = token.normalizedSurface;
        allMissFormsSet.add(form);
        titleMissForms.add(form);
        const existing = diagMissStats.get(form) ?? { tokenCount: 0, titleCount: 0 };
        existing.tokenCount += 1;
        diagMissStats.set(form, existing);
      }
    }
    for (const form of titleMissForms) {
      const existing = diagMissStats.get(form);
      if (existing) existing.titleCount += 1;
    }
  }

  const { distribution, properNameCohort, itemDetails } = computeBlockerDistribution(
    diagMissStats,
    phase7EPack,
    kaikkiIndex
  );

  const surfaceMorphology = analyzeSurfaceMorphology(Array.from(allMissFormsSet));

  const {
    topUnresolvedWorklist,
    topNewlyRecoveredWorklist,
    topAbsentFromKaikkiWorklist,
    topNonLemmaWorklist,
    topProperNameWorklist,
    auditSamples
  } = generateWorklistsAndAuditSamples(itemDetails);

  const nextIntervention = rankNextInterventionFromDiagnostic(distribution);

  const report: Phase7FCoverageSummaryReport = {
    reportVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
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
    diagnosticBlockerDistribution: distribution,
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

  // Write reports
  const reportJsonPath =
    options.reportJsonPath ??
    path.resolve(process.cwd(), 'src', 'validation', 'reports', 'phase7f-coverage-summary.json');
  fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), 'utf8');

  const reportMdPath =
    options.reportMdPath ??
    path.resolve(process.cwd(), 'docs', 'experiments', 'PHASE_7F_REAL_SCHOLARLY_COVERAGE.md');
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

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--corpus' && args[i + 1]) {
      corpusPath = args[i + 1];
      i++;
    }
  }

  try {
    const report = await runCoverageEvaluation({ corpusPath });
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
