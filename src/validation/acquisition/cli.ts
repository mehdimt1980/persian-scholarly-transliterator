import * as fs from 'fs';
import * as path from 'path';
import { generateReviewSheetCsv } from './reviewSheet';
import { AcquisitionValidationResult } from './types';
import { validateAcquisitionCandidates } from './validateCandidates';

export interface CliOptions {
  manifestPath?: string;
  exportSheet?: boolean;
  outputPath?: string;
}

export function parseCliArgs(args: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest' && i + 1 < args.length) {
      options.manifestPath = args[i + 1];
      i++;
    } else if (args[i] === '--export-sheet') {
      options.exportSheet = true;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      options.outputPath = args[i + 1];
      i++;
    }
  }
  return options;
}

export function runAcquisitionCli(options: CliOptions = {}): AcquisitionValidationResult {
  const manifestPath = options.manifestPath
    ? path.resolve(process.cwd(), options.manifestPath)
    : path.join(process.cwd(), 'validation', 'acquisition', 'external-candidates.manifest.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Acquisition manifest not found at "${manifestPath}".`);
  }

  const manifestDir = path.dirname(manifestPath);
  const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  const candidateFilePath = path.isAbsolute(manifestData.candidateFile)
    ? manifestData.candidateFile
    : path.join(manifestDir, manifestData.candidateFile);

  if (!fs.existsSync(candidateFilePath)) {
    throw new Error(`Acquisition candidate file not found at "${candidateFilePath}".`);
  }

  const candidateJson = JSON.parse(fs.readFileSync(candidateFilePath, 'utf-8'));
  const rawCandidates = Array.isArray(candidateJson) ? candidateJson : candidateJson.candidates;

  let ledgerData: any = undefined;
  if (manifestData.verificationLedgerFile) {
    const ledgerPath = path.isAbsolute(manifestData.verificationLedgerFile)
      ? manifestData.verificationLedgerFile
      : path.join(manifestDir, manifestData.verificationLedgerFile);
    if (fs.existsSync(ledgerPath)) {
      ledgerData = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    }
  }

  const result = validateAcquisitionCandidates(manifestData, rawCandidates, ledgerData);

  if (options.exportSheet) {
    const csv = generateReviewSheetCsv(result.candidates, result.overlapAudit);
    const outPath = options.outputPath
      ? path.resolve(process.cwd(), options.outputPath)
      : path.join(manifestDir, 'review-sheet.csv');
    fs.writeFileSync(outPath, csv, 'utf-8');
    console.log(`Review sheet successfully exported to: ${outPath}`);
  }

  return result;
}

if (require.main === module || (typeof process !== 'undefined' && process.argv[1] && process.argv[1].includes('acquisition/cli'))) {
  const args = process.argv.slice(2);
  const options = parseCliArgs(args);
  try {
    const result = runAcquisitionCli(options);
    console.log(result.report);
    if (!result.success) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error during acquisition validation: ${err.message}`);
    process.exit(1);
  }
}
