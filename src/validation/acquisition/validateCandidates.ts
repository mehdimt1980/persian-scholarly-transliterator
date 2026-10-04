import { computeAcquisitionCoverage } from './coverage';
import { deduplicateCandidates } from './deduplicate';
import { auditProjectOverlap } from './overlapAudit';
import { generateAcquisitionReport } from './report';
import { validateAcquisitionManifest, validateCandidate } from './schema';
import {
  AcquisitionManifest,
  AcquisitionValidationResult,
  ExternalCorpusCandidate
} from './types';

export function validateAcquisitionCandidates(
  manifestData: unknown,
  candidatesData: unknown[]
): AcquisitionValidationResult {
  const errors: string[] = [];
  let manifest: AcquisitionManifest;
  const validCandidates: ExternalCorpusCandidate[] = [];

  try {
    manifest = validateAcquisitionManifest(manifestData);
  } catch (err: any) {
    errors.push(`Manifest validation failed: ${err.message}`);
    manifest = manifestData as AcquisitionManifest;
  }

  for (let i = 0; i < candidatesData.length; i++) {
    try {
      const parsed = validateCandidate(candidatesData[i]);
      validCandidates.push(parsed);
    } catch (err: any) {
      const cid = (candidatesData[i] as any)?.id || `index_${i}`;
      errors.push(`Candidate "${cid}" validation failed: ${err.message}`);
    }
  }

  const deduplication = deduplicateCandidates(validCandidates);
  const overlapAudit = auditProjectOverlap(validCandidates);
  const coverage = computeAcquisitionCoverage(validCandidates);

  if (deduplication.hasBlockingDuplicates) {
    errors.push(`Deduplication audit found ${deduplication.duplicateFindings.filter(f => !f.permittedWithDistinctEvidence).length} blocking duplicate(s).`);
  }

  const success = errors.length === 0 && !deduplication.hasBlockingDuplicates;
  const report = generateAcquisitionReport(manifest, coverage, deduplication, overlapAudit, errors);

  return {
    success,
    manifest,
    candidates: validCandidates,
    deduplication,
    overlapAudit,
    coverage,
    errors,
    report
  };
}
