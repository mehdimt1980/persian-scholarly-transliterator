import {
  AcquisitionCoverageMetrics,
  AcquisitionManifest,
  DeduplicationResult,
  OverlapAuditResult,
  ProvenanceAuditResult
} from './types';

export function generateAcquisitionReport(
  manifest: AcquisitionManifest,
  coverage: AcquisitionCoverageMetrics,
  deduplication: DeduplicationResult,
  overlap: OverlapAuditResult,
  provenance?: ProvenanceAuditResult,
  errors: string[] = []
): string {
  const lines: string[] = [];

  const isPassing = errors.length === 0 && !deduplication.hasBlockingDuplicates && (provenance ? provenance.valid : true);

  lines.push('===============================================================');
  lines.push(` External Benchmark Acquisition Report — ${manifest.id} (${manifest.version})`);
  lines.push('===============================================================');
  lines.push(`Description:        ${manifest.description}`);
  lines.push(`Source Policy:      ${manifest.sourcePolicy}`);
  lines.push(`Review Status:      ${manifest.status}`);
  lines.push(`Acquisition Date:   ${manifest.acquiredAt}`);
  lines.push('---------------------------------------------------------------');
  lines.push('Corpus Integrity & Pipeline Status:');
  lines.push(`  Acquisition Integrity:       ${isPassing ? 'PASS' : 'FAIL'}`);
  lines.push('  Human Review Required:       YES (Pending Phase 4.6B)');
  lines.push('  Engine Evaluation Performed: NO (Frozen before Phase 4.6C)');
  lines.push('---------------------------------------------------------------');
  lines.push(`Total Acquired Candidates:     ${coverage.totalCandidates}`);
  lines.push(`Verified Candidates:           ${coverage.verifiedCandidateCount} / ${coverage.totalCandidates}`);
  lines.push(`Direct Source-Text Attested:   ${coverage.sourceTextAttestedCount} / ${coverage.totalCandidates}`);
  lines.push(`Multi-Source Evidence Items:   ${coverage.multiSourceCount} (${Math.round((coverage.multiSourceCount / (coverage.totalCandidates || 1)) * 100)}%)`);
  lines.push(`Committed Verification Receipts: ${coverage.committedVerificationReceiptsCount}`);
  lines.push(`Encyclopaedia Iranica Records: ${coverage.verifiedIranicaCount}`);
  lines.push(`  - Exact Romanizations Attested:   ${coverage.verifiedExactIranicaRomanizationCount}`);
  lines.push(`  - Concept / Identity Only (No Rom): ${coverage.removedUnsupportedRomanizationCount}`);
  lines.push(`Other Exact Romanizations:     ${coverage.verifiedExactOtherRomanizationCount}`);
  lines.push(`Total Retained Observed Rom:   ${coverage.observedRomanizationCount}`);
  lines.push(`Bibliographic / DOI Records:   ${coverage.bibliographicSourceCount}`);
  lines.push(`Work / Entity Authority Items: ${coverage.workMetadataCount + coverage.entityMetadataCount}`);
  lines.push('---------------------------------------------------------------');
  lines.push('Independence & Origin Classification:');
  lines.push(`  FULLY_EXTERNAL:                        ${coverage.independenceClasses['FULLY_EXTERNAL'] || 0}`);
  lines.push(`  EXTERNAL_SOURCE_PROJECT_TOPIC_OVERLAP: ${coverage.independenceClasses['EXTERNAL_SOURCE_PROJECT_TOPIC_OVERLAP'] || 0}`);
  lines.push(`  REJECT_CIRCULAR:                       ${coverage.independenceClasses['REJECT_CIRCULAR'] || 0}`);
  lines.push('---------------------------------------------------------------');
  lines.push('Proposed Transliteration Profiles:');
  lines.push(`  ijmes_full (lexical/scholarly):        ${coverage.profiles['ijmes_full'] || 0}`);
  lines.push(`  ijmes_citation_title (citation titles): ${(coverage.profiles['ijmes_citation_title'] || 0) + (coverage.profiles['ijmes_title'] || 0)}`);
  lines.push('---------------------------------------------------------------');
  lines.push('Category Breakdown:');
  for (const [cat, count] of Object.entries(coverage.categories)) {
    const pct = coverage.totalCandidates > 0 ? Math.round((count / coverage.totalCandidates) * 100) : 0;
    lines.push(`  - ${cat.padEnd(17)} ${String(count).padStart(3)} (${pct}%)`);
  }
  lines.push('---------------------------------------------------------------');
  lines.push('Source Kind Distribution:');
  for (const [kind, count] of Object.entries(coverage.sourceKinds)) {
    if (count > 0) {
      lines.push(`  - ${kind.padEnd(28)} ${count}`);
    }
  }
  lines.push('---------------------------------------------------------------');
  lines.push('Post-Acquisition Overlap Audit (Non-mutating):');
  lines.push(`  Exact Lexicon Overlap:       ${overlap.exactLexiconOverlapCount} / ${overlap.candidateCount} (${overlap.exactLexiconOverlapPercent}%)`);
  lines.push(`  Pilot Single Overlap:        ${overlap.pilotSingleOverlapCount} / ${overlap.candidateCount} (${overlap.pilotSingleOverlapPercent}%)`);
  lines.push(`  Pilot Bibliography Overlap:  ${overlap.pilotBibliographyOverlapCount} / ${overlap.candidateCount}`);
  lines.push(`  Genuinely Out-Of-Sample:     ${overlap.outOfSampleCount} / ${overlap.candidateCount} (${overlap.outOfSamplePercent}%)`);
  lines.push(`  Out-Of-Sample Target (>=70%):${overlap.targetSatisfied ? 'MET  ✓' : 'UNMET'}`);
  lines.push('---------------------------------------------------------------');
  lines.push('Deduplication Audit:');
  lines.push(`  Total Checked:               ${deduplication.totalChecked}`);
  lines.push(`  Unique IDs:                  ${deduplication.uniqueIds}`);
  lines.push(`  Duplicate Findings:          ${deduplication.duplicateFindings.length}`);
  lines.push(`  Blocking Duplicates:         ${deduplication.hasBlockingDuplicates ? 'YES (FAIL)' : 'NONE  ✓'}`);
  if (deduplication.duplicateFindings.length > 0) {
    for (const f of deduplication.duplicateFindings) {
      lines.push(`    * [${f.type}] ${f.candidateId} vs ${f.duplicateOfId}: ${f.detail} (permitted: ${f.permittedWithDistinctEvidence})`);
    }
  }

  if (provenance) {
    lines.push('---------------------------------------------------------------');
    lines.push('Provenance Verification Audit:');
    lines.push(`  Verified Candidates:         ${provenance.verifiedCount}`);
    lines.push(`  Unverified / Mismatched:     ${provenance.unverifiedCount}`);
    lines.push(`  Rejected Circular:           ${provenance.rejectedCount}`);
    lines.push(`  Provenance Integrity:        ${provenance.valid ? 'PASS  ✓' : 'FAIL'}`);
  }

  if (errors.length > 0) {
    lines.push('---------------------------------------------------------------');
    lines.push('Validation Errors:');
    for (const err of errors) {
      lines.push(`  ! ${err}`);
    }
  }

  lines.push('===============================================================');
  return lines.join('\n');
}
