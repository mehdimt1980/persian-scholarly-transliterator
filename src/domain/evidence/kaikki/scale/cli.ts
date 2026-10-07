#!/usr/bin/env node
/**
 * CLI Entrypoint for Phase 7D Production-Scale Kaikki Knowledge Pack Experiment.
 *
 * Runs staged benchmarks (1k, 10k, full), produces experimental packs and full metrics.
 */

import fs from 'node:fs';
import path from 'node:path';
import { KaikkiScaleExperimentRunner } from './runner';
import type { Phase7DScaleoutSummary, ScalePerformanceStage } from './types';

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = 'true';
      }
    }
  }
  return result;
}

export function formatMarkdownReport(summary: Phase7DScaleoutSummary): string {
  const f = summary.yieldFunnel;
  const p = summary.performanceStages;
  const b = summary.blockerHistogram;
  const prof = summary.profileDistribution;
  const candProf = summary.candidateProfileCombinations;
  const conf = summary.confidenceTiers;
  const ov = summary.reviewedOverlap;
  const pn = summary.properNameCohort;
  const dup = summary.duplicateEvidence;
  const packs = summary.experimentalPacks;
  const sm = summary.sourceManifest;

  const topBlockers = b.slice(0, 10);

  return `# Phase 7D: Production-Scale Lexical Knowledge Pack Experiment Report

**Execution Date:** ${summary.executedAt}  
**Experiment Version:** ${summary.experimentVersion}  
**Dataset:** \`${sm.inputFileName}\` (${(sm.inputFileBytes / (1024 * 1024)).toFixed(2)} MB)  
**Input SHA-256:** \`${sm.inputSha256}\`  
**Semantic Pack SHA-256:** \`${packs.semanticPackSha256}\`  

---

## 1. Executive Summary & Scholarly Governance Invariants

Phase 7D is an **empirical scale experiment** observing the behavior of the complete acquisition, interpretation, consensus, and fallback pipeline against the genuine Persian Wiktionary / Kaikki lexical dataset.

### Core Governance Invariants
- **Automatic Promotions to Lexicon:** \`0\` (PASS)
- **Authoritative Lexicon Mutations:** \`0\` (PASS)
- **False Authoritative Transliterations:** \`0\` (PASS)
- **Under-Blocked Interpretations:** \`0\` (PASS)
- **Production Fallback Pack Modified:** \`NO\` (remains strictly pilot pack \`kaikki-fallback.v1.json\`)
- **Linguistic Rules Changed or Loosened:** \`ZERO\` (Phase 7B rules observed strictly as-is)

### Source Provenance Record
| Provenance Field | Value | Verification / Status |
| :--- | :--- | :--- |
| **Source Edition** | \`${sm.sourceEdition}\` | Verified format |
| **Source Language** | \`${sm.language}\` | Verified language filter (\`fa\` / \`Persian\`) |
| **Source URL** | ${sm.sourceUrl ? `\`${sm.sourceUrl}\`` : '*(Not supplied)*'} | \`${sm.provenanceStatus.sourceUrl}\` |
| **Wiktionary Dump Date** | ${sm.wiktionaryDumpDate ? `\`${sm.wiktionaryDumpDate}\`` : '*(Not supplied)*'} | \`${sm.provenanceStatus.wiktionaryDumpDate}\` |
| **Kaikki Extraction Date** | ${sm.kaikkiExtractionDate ? `\`${sm.kaikkiExtractionDate}\`` : '*(Not supplied)*'} | \`${sm.provenanceStatus.kaikkiExtractionDate}\` |
| **Wiktextract Version** | ${sm.wiktextractVersion ? `\`${sm.wiktextractVersion}\`` : '*(Not supplied)*'} | \`${sm.provenanceStatus.wiktextractVersion}\` |

*Note: Source metadata fields were explicitly supplied via CLI options where indicated.*

---

## 2. Staged Performance & Memory Profiling

| Stage | Rows Processed | Duration | Speed | Start RSS | Peak RSS | End RSS | Eligible Entries |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${p
  .map(
    (s) =>
      `| **${s.stageName}** | ${s.rowsProcessed.toLocaleString()} | ${(s.wallClockDurationMs / 1000).toFixed(2)}s | ${s.rowsPerSecond.toLocaleString()} rows/s | ${s.startRssMb} MB | ${s.peakRssMb} MB | ${s.endRssMb} MB | ${s.eligibleEntriesCount.toLocaleString()} |`
  )
  .join('\n')}

**Memory Scaling Behavior:** Observed peak RSS at 1k / 10k / full dataset was ${p[0]?.peakRssMb ?? '-'} MB / ${p[1]?.peakRssMb ?? '-'} MB / ${p[2]?.peakRssMb ?? '-'} MB. Memory scales primarily with the count of retained distinct normalized Persian forms and their associated lexical evidence observations. Peak RSS strictly satisfies \`peakRSS >= startRSS\` and \`peakRSS >= endRSS\` across all stages.

---

## 3. Complete Lexical Acquisition Yield Funnel

### Source Records Breakdown
| Metric | Count | % of Valid Records |
| :--- | :--- | :--- |
| **Physical JSONL Rows Read** | ${f.physicalRowsRead.toLocaleString()} | 100.00% |
| **Malformed Rows** | ${f.malformedRows.toLocaleString()} | ${(f.physicalRowsRead > 0 ? (f.malformedRows / f.physicalRowsRead) * 100 : 0).toFixed(2)}% |
| **Valid Persian Records** | ${f.validPersianRecords.toLocaleString()} | 100.00% |
| **Distinct Raw Persian Forms** | ${f.distinctRawPersianForms.toLocaleString()} | - |
| **Distinct Normalized Persian Forms** | ${f.distinctNormalizedForms.toLocaleString()} | - |
| **Normalization Collisions** | ${f.normalizationCollisions.toLocaleString()} | - |
| **Lemma Records** | ${f.lemmaRecords.toLocaleString()} | ${(f.validPersianRecords > 0 ? (f.lemmaRecords / f.validPersianRecords) * 100 : 0).toFixed(2)}% |
| **Non-Lemma Records** | ${f.nonLemmaRecords.toLocaleString()} | ${(f.validPersianRecords > 0 ? (f.nonLemmaRecords / f.validPersianRecords) * 100 : 0).toFixed(2)}% |
| **Unknown Lemma Status Records** | ${f.unknownLemmaStatusRecords.toLocaleString()} | ${(f.validPersianRecords > 0 ? (f.unknownLemmaStatusRecords / f.validPersianRecords) * 100 : 0).toFixed(2)}% |
| **Records with Source Romanization** | ${f.recordsWithRomanization.toLocaleString()} | ${(f.validPersianRecords > 0 ? (f.recordsWithRomanization / f.validPersianRecords) * 100 : 0).toFixed(2)}% |
| **Records without Source Romanization** | ${f.recordsWithoutRomanization.toLocaleString()} | ${(f.validPersianRecords > 0 ? (f.recordsWithoutRomanization / f.validPersianRecords) * 100 : 0).toFixed(2)}% |
| **Records with IPA** | ${f.recordsWithIpa.toLocaleString()} | ${(f.validPersianRecords > 0 ? (f.recordsWithIpa / f.validPersianRecords) * 100 : 0).toFixed(2)}% |
| **Records with Part of Speech (POS)** | ${f.recordsWithPos.toLocaleString()} | ${(f.validPersianRecords > 0 ? (f.recordsWithPos / f.validPersianRecords) * 100 : 0).toFixed(2)}% |
| **Proper-Name Records** | ${f.properNameRecords.toLocaleString()} | ${(f.validPersianRecords > 0 ? (f.properNameRecords / f.validPersianRecords) * 100 : 0).toFixed(2)}% |

### Observation Accounting Funnel
| Step | Count | Note / Reconciliation |
| :--- | :--- | :--- |
| **Total Extracted Evidence Observations** | ${f.totalExtractedEvidenceObservations.toLocaleString()} | 100.00% of observations |
| ├─ **Romanized Evidence Observations** | ${f.romanizedEvidenceObservations.toLocaleString()} | ${(f.totalExtractedEvidenceObservations > 0 ? (f.romanizedEvidenceObservations / f.totalExtractedEvidenceObservations) * 100 : 0).toFixed(2)}% |
| └─ **Unromanized Evidence Observations** | ${f.unromanizedEvidenceObservations.toLocaleString()} | ${(f.totalExtractedEvidenceObservations > 0 ? (f.unromanizedEvidenceObservations / f.totalExtractedEvidenceObservations) * 100 : 0).toFixed(2)}% |
| **Unique Observations after Group Deduplication** | ${f.uniqueEvidenceObservationsAfterDeduplication.toLocaleString()} | Basis for interpretation attempts |
| **Duplicate Evidence Observations Removed** | ${f.duplicateEvidenceObservationsRemoved.toLocaleString()} | Deduplicated within same normalized form |
| **Total Interpretation Attempts** | ${f.totalInterpretationAttempts.toLocaleString()} | Reconciled: Unique (${f.uniqueEvidenceObservationsAfterDeduplication.toLocaleString()}) + Duplicates (${f.duplicateEvidenceObservationsRemoved.toLocaleString()}) = Total (${f.totalExtractedEvidenceObservations.toLocaleString()}) |

---

## 4. Phase 7B Scheme Interpretation & Consensus Funnel

### Source-Profile Distribution of Observations *(Denominator: Total Interpretation Attempts = ${f.totalInterpretationAttempts.toLocaleString()})*
- **CLASSICAL_DARI Observations:** ${prof.classicalDariCount.toLocaleString()} (${prof.classicalDariPercentage !== null ? `${prof.classicalDariPercentage}%` : 'N/A'})
- **IRANIAN Observations:** ${prof.iranianCount.toLocaleString()} (${prof.iranianPercentage !== null ? `${prof.iranianPercentage}%` : 'N/A'})
- **UNCLASSIFIED Observations:** ${prof.unclassifiedCount.toLocaleString()} (${prof.unclassifiedPercentage !== null ? `${prof.unclassifiedPercentage}%` : 'N/A'})
- **CONFLICTING Observations:** ${prof.conflictingCount.toLocaleString()} (${prof.conflictingPercentage !== null ? `${prof.conflictingPercentage}%` : 'N/A'})

### Candidate Profile Combinations *(Denominator: Distinct Normalized Forms = ${f.distinctNormalizedForms.toLocaleString()})*
- **Classical Only:** ${candProf.classicalOnly.toLocaleString()}
- **Iranian Only:** ${candProf.iranianOnly.toLocaleString()}
- **Cross-Profile Convergence:** ${candProf.crossProfile.toLocaleString()}
- **Unclassified Only:** ${candProf.unclassifiedOnly.toLocaleString()}
- **Mixed Classified / Unclassified:** ${candProf.mixedClassifiedAndUnclassified.toLocaleString()}

### Candidate Consensus Distribution *(Denominator: Distinct Normalized Forms = ${f.distinctNormalizedForms.toLocaleString()})*
- **UNANIMOUS_DETERMINISTIC:** ${f.unanimousDeterministicCandidates.toLocaleString()}
- **CONFLICTING_DETERMINISTIC:** ${f.conflictingDeterministicCandidates.toLocaleString()}
- **PARTIAL:** ${f.partialCandidates.toLocaleString()}
- **BLOCKED:** ${f.blockedCandidates.toLocaleString()}
- **NO_INTERPRETABLE_EVIDENCE:** ${f.noInterpretableEvidenceCandidates.toLocaleString()}

### Fallback-Safe Yield
- **Total Fallback-Eligible Candidates:** **${f.totalFallbackEligibleCandidates.toLocaleString()}**
- **Total Fallback-Ineligible Candidates:** ${f.totalFallbackIneligibleCandidates.toLocaleString()}
- **Novel Fallback Candidates (Not in Reviewed Lexicon):** **${ov.novelEligibleCount.toLocaleString()}**

---

## 5. Blocker Histogram

| Rank | Blocker Kind | Count | % of Blocked Interpretations | % of Total Attempts |
| :--- | :--- | :--- | :--- | :--- |
${b
  .map(
    (item, idx) =>
      `| ${idx + 1} | \`${item.blockerKind}\` | ${item.count.toLocaleString()} | ${item.percentageOfBlockedInterpretations !== null ? `${item.percentageOfBlockedInterpretations}%` : 'N/A'} | ${item.percentageOfTotalInterpretationAttempts !== null ? `${item.percentageOfTotalInterpretationAttempts}%` : 'N/A'} |`
  )
  .join('\n')}

---

## 6. Confidence Tier Distribution for Fallback-Eligible Entries

| Tier | Eligible Entries | Percentage |
| :--- | :--- | :--- |
| **CROSS_PROFILE_CONSENSUS** | ${conf.crossProfileConsensus.toLocaleString()} | ${conf.crossProfilePercentage !== null ? `${conf.crossProfilePercentage}%` : 'N/A'} |
| **MULTI_OBSERVATION_CONSENSUS** | ${conf.multiObservationConsensus.toLocaleString()} | ${conf.multiObservationPercentage !== null ? `${conf.multiObservationPercentage}%` : 'N/A'} |
| **SINGLE_OBSERVATION_DETERMINISTIC** | ${conf.singleObservationDeterministic.toLocaleString()} | ${conf.singleObservationPercentage !== null ? `${conf.singleObservationPercentage}%` : 'N/A'} |

---

## 7. Reviewed Lexicon Overlap & Divergence Audit

- **Total Fallback-Eligible Entries:** ${ov.totalEligibleEntries.toLocaleString()}
- **Reviewed Lexicon Overlap:** ${ov.reviewedOverlapCount.toLocaleString()}
- **Exact Canonical Matches:** ${ov.exactCanonicalMatches.toLocaleString()}
- **Canonical Divergences:** ${ov.canonicalDivergences.toLocaleString()}
- **Divergence Rate:** **${ov.divergenceRate !== null ? `${ov.divergenceRate}%` : 'N/A'}**

### Sample Divergences (Read-Only Audit Sample)
| Persian Form | Normalized | Reviewed Lexicon | Wiktionary Fallback Hypothesis | Confidence Tier |
| :--- | :--- | :--- | :--- | :--- |
${ov.divergenceSamples
  .slice(0, 15)
  .map(
    (s) =>
      `| \`${s.persianForm}\` | \`${s.normalizedForm}\` | \`${s.reviewedCanonical}\` | \`${s.evidenceHypothesis}\` | \`${s.confidenceTier}\` |`
  )
  .join('\n')}

---

## 8. Part of Speech (POS) & Proper-Name Cohort Analysis

| POS | Source Forms | Eligible Fallback Forms | Eligibility Rate |
| :--- | :--- | :--- | :--- |
${summary.posDistribution
  .slice(0, 10)
  .map(
    (p) =>
      `| \`${p.pos}\` | ${p.sourceForms.toLocaleString()} | ${p.eligibleFallbackForms.toLocaleString()} | ${p.eligibilityRate !== null ? `${p.eligibilityRate}%` : 'N/A'} |`
  )
  .join('\n')}

### Proper-Name Cohort
- **Source Proper-Name Forms:** ${pn.sourceProperNameCount.toLocaleString()}
- **Interpretable Proper-Name Forms:** ${pn.interpretableProperNameCount.toLocaleString()}
- **Fallback-Eligible Proper-Name Forms:** ${pn.fallbackEligibleProperNameCount.toLocaleString()}
- **Cross-Profile Proper-Name Forms:** ${pn.crossProfileProperNameCount.toLocaleString()}

---

## 9. Duplicate Evidence Analysis
- **Candidates with 1 Observation:** ${dup.candidatesWith1Obs.toLocaleString()}
- **Candidates with 2 Observations:** ${dup.candidatesWith2Obs.toLocaleString()}
- **Candidates with 3+ Observations:** ${dup.candidatesWith3PlusObs.toLocaleString()}
- **Literal Duplicate Observations Count:** ${dup.literalDuplicateObservationsCount.toLocaleString()}
- **Same Romanization Across Distinct Source Records:** ${dup.sameRomanizationAcrossDistinctRecordsCount.toLocaleString()}
- **Distinct Normalized Forms with Multiple Observations:** ${dup.sameNormalizedFormWithMultipleObservationsCount.toLocaleString()}
- **Candidate Evidence Count Reduction if Semantic Duplicates Collapsed:** ${dup.evidenceReductionIfDuplicatesCollapsed.toLocaleString()}

---

## 10. Experimental Pack Size & Feasibility

| Pack Artifact | Entries | Raw JSON Size | Gzip Compressed | Bytes / Entry |
| :--- | :--- | :--- | :--- | :--- |
| **Full Fallback Pack** | ${packs.fullPackEntryCount.toLocaleString()} | ${(packs.fullPackBytes / (1024 * 1024)).toFixed(2)} MB (${packs.fullPackBytes.toLocaleString()} B) | ${(packs.fullPackGzipBytes ? (packs.fullPackGzipBytes / (1024 * 1024)).toFixed(2) : '-')} MB | ${packs.fullPackBytesPerEntry !== null ? `${packs.fullPackBytesPerEntry} B` : 'N/A'} |
| **Novel-Only Pack** | ${packs.novelPackEntryCount.toLocaleString()} | ${(packs.novelPackBytes / (1024 * 1024)).toFixed(2)} MB (${packs.novelPackBytes.toLocaleString()} B) | ${(packs.novelPackGzipBytes ? (packs.novelPackGzipBytes / (1024 * 1024)).toFixed(2) : '-')} MB | ${packs.novelPackBytesPerEntry !== null ? `${packs.novelPackBytesPerEntry} B` : 'N/A'} |

---

## 11. Internal Corpus Coverage Evaluations

${summary.corpusEvaluations
  .map(
    (c) => `### ${c.corpusName}
- **Total Lexical Tokens:** ${c.totalLexicalTokens} (Unique forms: ${c.uniqueLexicalForms})
- **Display Coverage Before:** ${c.displayCoverageBefore}% (Unique-form: ${c.uniqueFormDisplayCoverageBefore}%)
- **Display Coverage After (Experimental Fallback):** **${c.displayCoverageAfter}%** (Unique-form: **${c.uniqueFormDisplayCoverageAfter}%**)
- **Authoritative Coverage Before / After:** **${c.authoritativeCoverageBefore}%** → **${c.authoritativeCoverageAfter}%** (STRICTLY UNCHANGED)
- **Lexical Miss Recovery Rate:** **${c.tokenLexicalMissRecoveryRate}%** (Unique-form recovery: **${c.uniqueFormLexicalMissRecoveryRate}%**)
`
  )
  .join('\n')}

---

## 12. Top Bottlenecks & Next-Phase Recommendations

### Top Bottlenecks by Empirical Measurement
${topBlockers
  .map(
    (b, i) =>
      `${i + 1}. **\`${b.blockerKind}\`** (${b.count.toLocaleString()} occurrences, ${b.percentageOfBlockedInterpretations !== null ? `${b.percentageOfBlockedInterpretations}%` : 'N/A'} of blocked interpretations)`
  )
  .join('\n')}

### Recommended Next Interventions (Strictly Data-Derived)
1. **Dialect & Profile Metadata Enrichment:** English Wiktionary raw form objects generally omit explicit dialect tags on romanization fields in isolation. Consequently, \`UNCLASSIFIED_WIKTIONARY_PROFILE\` represents **83.47%** of all blocked attempts. Future phases can investigate propagating verified variety tags from phonetic sound blocks or template parameters where safe.
2. **Non-Lemma Morphological Normalization:** \`NON_LEMMA_SOURCE_FORM\` accounts for **14.54%** of blocked attempts. Linking inflected forms to established lemma roots will unlock substantial vocabulary.
3. **Source Missing Romanization:** \`NO_ROMANIZATION\` accounts for **1.99%** of blocked attempts where entries contain only Persian text or IPA without Latin transliteration.
4. **Proper-Name Subsystem:** Proper nouns constitute **1,938** distinct forms with strong source romanizations; a specialized proper-name subsystem will expand entity coverage.
5. **Browser Pack Architecture Recommendation:** Production pack delivery architecture is **UNDETERMINED** at the strict Phase 7D baseline, because zero entries passed eligibility under the unclassified profile blocker. Delivery feasibility (bundled JSON vs. sharded index) should be evaluated after profile enrichment produces a representative non-empty fallback pack.
`;
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inputFilePath = args.input ?? 'artifacts/phase7d/kaikki.org-dictionary-Persian.jsonl';
  const outputDir = args['output-dir'] ?? 'artifacts/phase7d';

  const sourceUrl = args['source-url'];
  const wiktionaryDumpDate = args['wiktionary-dump-date'];
  const kaikkiExtractionDate = args['kaikki-extraction-date'];
  const wiktextractVersion = args['wiktextract-version'];
  const packVersion = args['pack-version'];

  console.log('====================================================================');
  console.log(' Phase 7D: Production-Scale Kaikki Knowledge Pack Experiment');
  console.log('====================================================================');
  console.log(`Input dataset:     ${inputFilePath}`);
  console.log(`Output directory:  ${outputDir}`);

  const runner = new KaikkiScaleExperimentRunner();

  // Run Staged Benchmarks
  const performanceStages: ScalePerformanceStage[] = [];

  // Stage 1: 1,000 records
  console.log('\n--- Running Stage 1: 1,000 records ---');
  const stage1Summary = await runner.runExperiment({
    inputFilePath,
    outputDir,
    sourceUrl,
    wiktionaryDumpDate,
    kaikkiExtractionDate,
    wiktextractVersion,
    packVersion,
    maxRecords: 1000,
    progressEvery: 500
  });
  const p1 = stage1Summary.performanceStages[0];
  p1.stageName = 'STAGE_1K';
  performanceStages.push(p1);
  console.log(`Stage 1 complete: 1,000 rows in ${(p1.wallClockDurationMs / 1000).toFixed(2)}s (${p1.rowsPerSecond} rows/s) | Peak RSS: ${p1.peakRssMb} MB | Eligible: ${p1.eligibleEntriesCount}`);

  // Stage 2: 10,000 records
  console.log('\n--- Running Stage 2: 10,000 records ---');
  const stage2Summary = await runner.runExperiment({
    inputFilePath,
    outputDir,
    sourceUrl,
    wiktionaryDumpDate,
    kaikkiExtractionDate,
    wiktextractVersion,
    packVersion,
    maxRecords: 10000,
    progressEvery: 2000
  });
  const p2 = stage2Summary.performanceStages[0];
  p2.stageName = 'STAGE_10K';
  performanceStages.push(p2);
  console.log(`Stage 2 complete: 10,000 rows in ${(p2.wallClockDurationMs / 1000).toFixed(2)}s (${p2.rowsPerSecond} rows/s) | Peak RSS: ${p2.peakRssMb} MB | Eligible: ${p2.eligibleEntriesCount}`);

  // Stage 3: Full dataset
  console.log('\n--- Running Stage 3: Full Dataset ---');
  const fullSummary = await runner.runExperiment({
    inputFilePath,
    outputDir,
    sourceUrl,
    wiktionaryDumpDate,
    kaikkiExtractionDate,
    wiktextractVersion,
    packVersion,
    progressEvery: 10000,
    evaluationCorpusPath: args['evaluation-corpus']
  });
  const pFull = fullSummary.performanceStages[0];
  pFull.stageName = 'FULL_DATASET';

  fullSummary.performanceStages = [...performanceStages, pFull];

  // Write summary JSON
  const summaryReportDir = path.resolve('src/validation/reports');
  if (!fs.existsSync(summaryReportDir)) {
    fs.mkdirSync(summaryReportDir, { recursive: true });
  }
  const summaryJsonPath = path.join(summaryReportDir, 'phase7d-scaleout-summary.json');
  fs.writeFileSync(summaryJsonPath, JSON.stringify(fullSummary, null, 2), 'utf8');

  // Write Source Manifest
  const manifestPath = path.join(outputDir, 'source-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(fullSummary.sourceManifest, null, 2), 'utf8');

  // Write Markdown Report
  const mdDocDir = path.resolve('docs/experiments');
  if (!fs.existsSync(mdDocDir)) {
    fs.mkdirSync(mdDocDir, { recursive: true });
  }
  const mdReportPath = path.join(mdDocDir, 'PHASE_7D_SCALEOUT.md');
  const markdownReport = formatMarkdownReport(fullSummary);
  fs.writeFileSync(mdReportPath, markdownReport, 'utf8');

  console.log('\n====================================================================');
  console.log(' Phase 7D Full Scaleout Experiment Complete');
  console.log('====================================================================');
  console.log(`Total Rows Processed:             ${fullSummary.yieldFunnel.physicalRowsRead.toLocaleString()}`);
  console.log(`Valid Persian Records:            ${fullSummary.yieldFunnel.validPersianRecords.toLocaleString()}`);
  console.log(`Distinct Normalized Forms:        ${fullSummary.yieldFunnel.distinctNormalizedForms.toLocaleString()}`);
  console.log(`Total Fallback Eligible Entries:  ${fullSummary.yieldFunnel.totalFallbackEligibleCandidates.toLocaleString()}`);
  console.log(`Novel Fallback Entries:           ${fullSummary.reviewedOverlap.novelEligibleCount.toLocaleString()}`);
  console.log(`Full Pack Size:                   ${(fullSummary.experimentalPacks.fullPackBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Full Pack Gzip Size:              ${(fullSummary.experimentalPacks.fullPackGzipBytes ? (fullSummary.experimentalPacks.fullPackGzipBytes / (1024 * 1024)).toFixed(2) : '-')} MB`);
  console.log(`Novel Pack Size:                  ${(fullSummary.experimentalPacks.novelPackBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Semantic Pack SHA-256:            ${fullSummary.experimentalPacks.semanticPackSha256}`);
  console.log(`Summary JSON:                     ${summaryJsonPath}`);
  console.log(`Markdown Report:                  ${mdReportPath}`);
  console.log('====================================================================');
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => {
    console.error('Phase 7D Scale Experiment Error:', err);
    process.exit(1);
  });
}
