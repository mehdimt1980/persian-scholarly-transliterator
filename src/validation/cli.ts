import * as fs from 'fs';
import * as path from 'path';
import {
  validateBibliographyCorpus,
  validateCorpusManifest,
  validateSingleCorpus
} from './schema';
import { runSingleCase } from './runSingleCase';
import { runBibliographyCase } from './runBibliographyCase';
import {
  computeBibliographyValidationMetrics,
  computeCombinedValidationMetrics,
  computeValidationMetrics
} from './metrics';
import { evaluateReleaseGates } from './releaseGate';
import { generateTextReport } from './report';
import {
  BibliographyCaseEvaluationResult,
  CaseEvaluationResult,
  CombinedValidationMetrics,
  CorpusManifest,
  ReleaseGateContext,
  ReleaseGateResult,
  ReleaseTarget
} from './types';

export interface RunCorpusValidationOptions {
  manifestPath?: string;
  corpusDir?: string;
  releaseTarget?: ReleaseTarget;
}

export function runCorpusValidation(
  optionsOrDir?: string | RunCorpusValidationOptions
): {
  success: boolean;
  report: string;
  metrics: CombinedValidationMetrics;
  gateResult: ReleaseGateResult;
} {
  const options: RunCorpusValidationOptions =
    typeof optionsOrDir === 'string'
      ? { corpusDir: optionsOrDir }
      : optionsOrDir || {};

  const baseDir =
    options.corpusDir || path.resolve(process.cwd(), 'validation', 'corpus');

  let manifest: CorpusManifest;
  let singleFilePath: string | undefined;
  let bibFilePath: string | undefined;

  if (options.manifestPath) {
    const resolvedManifestPath = path.isAbsolute(options.manifestPath)
      ? options.manifestPath
      : path.resolve(process.cwd(), options.manifestPath);

    if (!fs.existsSync(resolvedManifestPath)) {
      throw new Error(`Corpus manifest not found at: ${resolvedManifestPath}`);
    }

    const rawManifest = JSON.parse(fs.readFileSync(resolvedManifestPath, 'utf-8'));
    manifest = validateCorpusManifest(rawManifest);

    const manifestDir = path.dirname(resolvedManifestPath);
    if (manifest.single) {
      singleFilePath = path.isAbsolute(manifest.single)
        ? manifest.single
        : path.resolve(manifestDir, manifest.single);
    }
    if (manifest.bibliography) {
      bibFilePath = path.isAbsolute(manifest.bibliography)
        ? manifest.bibliography
        : path.resolve(manifestDir, manifest.bibliography);
    }
  } else {
    // Check if default manifest exists
    const defaultManifestPath = path.join(baseDir, 'pilot.manifest.json');
    if (fs.existsSync(defaultManifestPath)) {
      const rawManifest = JSON.parse(fs.readFileSync(defaultManifestPath, 'utf-8'));
      manifest = validateCorpusManifest(rawManifest);
      const manifestDir = path.dirname(defaultManifestPath);
      if (manifest.single) {
        singleFilePath = path.isAbsolute(manifest.single)
          ? manifest.single
          : path.resolve(manifestDir, manifest.single);
      }
      if (manifest.bibliography) {
        bibFilePath = path.isAbsolute(manifest.bibliography)
          ? manifest.bibliography
          : path.resolve(manifestDir, manifest.bibliography);
      }
    } else {
      // Fallback
      singleFilePath = path.join(baseDir, 'pilot.single.json');
      bibFilePath = path.join(baseDir, 'pilot.bibliography.json');
      manifest = {
        id: 'pilot-v1',
        version: '1.0.0',
        description: 'Scholarly transliteration pilot validation corpus',
        tier: 'PILOT',
        reviewStatus: 'SOURCE_BACKED_FIXTURE',
        single: 'pilot.single.json',
        bibliography: 'pilot.bibliography.json'
      };
    }
  }

  const singleResults: CaseEvaluationResult[] = [];
  let singleMetadata: any = undefined;

  if (singleFilePath && fs.existsSync(singleFilePath)) {
    const singleRaw = JSON.parse(fs.readFileSync(singleFilePath, 'utf-8'));
    const singleCorpus = validateSingleCorpus(singleRaw);
    singleMetadata = singleCorpus.metadata;
    for (const testCase of singleCorpus.cases) {
      const res = runSingleCase(testCase);
      singleResults.push(res);
    }
  }

  const bibResults: BibliographyCaseEvaluationResult[] = [];
  let bibMetadata: any = undefined;

  if (bibFilePath && fs.existsSync(bibFilePath)) {
    const bibRaw = JSON.parse(fs.readFileSync(bibFilePath, 'utf-8'));
    const bibCorpus = validateBibliographyCorpus(bibRaw);
    bibMetadata = bibCorpus.metadata;
    for (const bCase of bibCorpus.cases) {
      const bRes = runBibliographyCase(bCase);
      bibResults.push(bRes);
    }
  }

  const singleMetrics = computeValidationMetrics(singleResults);
  const bibMetrics = computeBibliographyValidationMetrics(bibResults);
  const combinedMetrics = computeCombinedValidationMetrics(singleMetrics, bibMetrics);

  const releaseTarget: ReleaseTarget = options.releaseTarget ?? (manifest.tier === 'PILOT' ? 'PILOT' : 'RC');

  const gateContext: ReleaseGateContext = {
    corpusTier: manifest.tier,
    releaseTarget,
    reviewStatus: manifest.reviewStatus
  };

  const gateResult = evaluateReleaseGates(combinedMetrics, { context: gateContext });

  const textReport = generateTextReport(
    {
      manifest,
      singleMetadata,
      bibliographyMetadata: bibMetadata
    },
    singleResults,
    combinedMetrics,
    gateResult,
    bibResults
  );

  return {
    success: gateResult.passed,
    report: textReport,
    metrics: combinedMetrics,
    gateResult
  };
}

// Parse CLI flags if executed directly
if (
  require.main === module ||
  (typeof process !== 'undefined' &&
    process.argv[1] &&
    process.argv[1].includes('cli.ts'))
) {
  try {
    const args = process.argv.slice(2);
    let manifestPath: string | undefined;
    let releaseTarget: ReleaseTarget | undefined;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--manifest' && args[i + 1]) {
        manifestPath = args[i + 1];
        i++;
      } else if (args[i] === '--target' && args[i + 1]) {
        releaseTarget = args[i + 1] as ReleaseTarget;
        i++;
      }
    }

    const { success, report } = runCorpusValidation({
      manifestPath,
      releaseTarget
    });

    console.log(report);
    if (!success) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Validation runner error:', err?.message || err);
    process.exit(1);
  }
}
