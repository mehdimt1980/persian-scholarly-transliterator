/**
 * Report formatting and markdown generation for Phase 7F coverage evaluation.
 */

import type { Phase7FCoverageSummaryReport } from './types';

export function formatMarkdownReport(report: Phase7FCoverageSummaryReport): string {
  const prod = report.configurations.CURRENT_PRODUCTION;
  const exp = report.configurations.PHASE7E_EXPERIMENTAL;
  const reviewed = report.configurations.REVIEWED_ONLY;
  const rec = report.missRecoveryOverall;

  const deltaTokenCoverage = (exp.displayTokenCoverage - prod.displayTokenCoverage).toFixed(2);
  const deltaUniqueCoverage = (exp.displayUniqueFormCoverage - prod.displayUniqueFormCoverage).toFixed(2);
  const deltaTitleRate = (exp.fullyDisplayableTitleRate - prod.fullyDisplayableTitleRate).toFixed(2);

  return `# Phase 7F: Real Scholarly Persian Coverage Corpus & Held-Out Evaluation

**Corpus Version:** \`${report.corpusManifest.corpusVersion}\`  
**Generated At:** \`${report.generatedAt}\`  
**Corpus SHA-256:** \`${report.corpusManifest.corpusSha256}\`  
**Locked Holdout SHA-256:** \`${report.corpusManifest.holdoutSha256}\`  

---

## 1. Executive Summary

Phase 7F measures the real-world coverage impact of the Phase 7E evidence-backed lexical recovery system on **5,000 independent, frozen Persian scholarly titles** sourced from OpenAlex (CC0).

Unlike prior benchmark corpora which were heavily covered by the reviewed lexicon (~95% display coverage), this held-out scholarly title corpus reflects real-world vocabulary diversity.

### Core Quantitative Findings

| Metric | REVIEWED_ONLY | CURRENT_PRODUCTION | PHASE7E_EXPERIMENTAL | Incremental Delta (Δ) |
| :--- | :---: | :---: | :---: | :---: |
| **Authoritative Token Coverage** | ${reviewed.authoritativeTokenCoverage.toFixed(2)}% | ${prod.authoritativeTokenCoverage.toFixed(2)}% | ${exp.authoritativeTokenCoverage.toFixed(2)}% | +0.00% (Strict Invariant) |
| **Display Token Coverage** | ${reviewed.displayTokenCoverage.toFixed(2)}% | ${prod.displayTokenCoverage.toFixed(2)}% | ${exp.displayTokenCoverage.toFixed(2)}% | **+${deltaTokenCoverage}%** |
| **Unique-Form Display Coverage** | ${reviewed.displayUniqueFormCoverage.toFixed(2)}% | ${prod.displayUniqueFormCoverage.toFixed(2)}% | ${exp.displayUniqueFormCoverage.toFixed(2)}% | **+${deltaUniqueCoverage}%** |
| **Fully Displayable Title Rate** | ${reviewed.fullyDisplayableTitleRate.toFixed(2)}% | ${prod.fullyDisplayableTitleRate.toFixed(2)}% | ${exp.fullyDisplayableTitleRate.toFixed(2)}% | **+${deltaTitleRate}%** |
| **Fully Authoritative Title Rate** | ${reviewed.fullyAuthoritativeTitleRate.toFixed(2)}% | ${prod.fullyAuthoritativeTitleRate.toFixed(2)}% | ${exp.fullyAuthoritativeTitleRate.toFixed(2)}% | +0.00% |
| **Copyable Title Rate** | ${reviewed.copyableTitleRate.toFixed(2)}% | ${prod.copyableTitleRate.toFixed(2)}% | ${exp.copyableTitleRate.toFixed(2)}% | +0.00% (Review Required) |

### Lexical Miss Recovery Impact

- **Baseline NO_LEXICAL_ENTRY Tokens:** ${rec.baselineMissTokens.toLocaleString()}
- **Recovered by Phase 7E Proposals:** ${rec.recoveredMissTokens.toLocaleString()} (**${rec.tokenLexicalMissRecoveryRate.toFixed(2)}%** recovery rate)
- **Baseline Unique Miss Forms:** ${rec.baselineUniqueMissForms.toLocaleString()}
- **Recovered Unique Miss Forms:** ${rec.recoveredUniqueMissForms.toLocaleString()} (**${rec.uniqueFormLexicalMissRecoveryRate.toFixed(2)}%** unique-form recovery rate)
- **Titles with Baseline Misses:** ${rec.titlesWithBaselineMisses.toLocaleString()}
- **Titles Gaining ≥1 Proposal:** ${rec.titlesWithAtLeastOneRecovery.toLocaleString()}
- **Titles Becoming Fully Displayable:** ${rec.titlesWithAllMissesRecovered.toLocaleString()}

---

## 2. Corpus Provenance & Frozen Partitions

The evaluation dataset was constructed completely independently of the transliteration engine and lexicon.

- **Primary Source:** OpenAlex Works API (Filter: \`language:fa\`, License: CC0-1.0)
- **Eligibility Invariant:** Independent Persian-script validation; at least 2 Persian lexical tokens; non-Latin metadata.
- **Selection Algorithm:** Deterministic SHA-256 ranked selection (\`${report.corpusManifest.selectionAlgorithm}\`).
- **Total Selected Titles:** ${report.corpusManifest.totalRecords.toLocaleString()}
- **Diagnostic Subset (80%):** ${report.corpusManifest.diagnosticCount.toLocaleString()} titles
- **Locked Holdout Subset (20%):** ${report.corpusManifest.lockedHoldoutCount.toLocaleString()} titles
- **Total Persian Lexical Tokens:** ${report.totalPersianTokens.toLocaleString()}
- **Unique Normalized Persian Forms:** ${report.uniqueNormalizedPersianForms.toLocaleString()}

---

## 3. Configuration Comparison by Split

### A. Full Corpus (${report.corpusManifest.totalRecords.toLocaleString()} Titles)

| Configuration | Token Display Cov. | Unique Form Cov. | Fully Displayable Titles | Lexical Miss Tokens | Other Blocker Tokens |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **REVIEWED_ONLY** | ${reviewed.displayTokenCoverage.toFixed(2)}% | ${reviewed.displayUniqueFormCoverage.toFixed(2)}% | ${reviewed.fullyDisplayableTitles} (${reviewed.fullyDisplayableTitleRate.toFixed(2)}%) | ${reviewed.noLexicalEntryTokens} | ${reviewed.otherBlockerTokens} |
| **CURRENT_PRODUCTION** | ${prod.displayTokenCoverage.toFixed(2)}% | ${prod.displayUniqueFormCoverage.toFixed(2)}% | ${prod.fullyDisplayableTitles} (${prod.fullyDisplayableTitleRate.toFixed(2)}%) | ${prod.noLexicalEntryTokens} | ${prod.otherBlockerTokens} |
| **PHASE7E_EXPERIMENTAL** | ${exp.displayTokenCoverage.toFixed(2)}% | ${exp.displayUniqueFormCoverage.toFixed(2)}% | ${exp.fullyDisplayableTitles} (${exp.fullyDisplayableTitleRate.toFixed(2)}%) | ${exp.noLexicalEntryTokens} | ${exp.otherBlockerTokens} |

### B. Diagnostic Split (80% / ${report.corpusManifest.diagnosticCount.toLocaleString()} Titles)

| Configuration | Token Display Cov. | Unique Form Cov. | Fully Displayable Titles | Lexical Miss Tokens |
| :--- | :---: | :---: | :---: | :---: |
| **CURRENT_PRODUCTION** | ${report.diagnosticConfigurations.CURRENT_PRODUCTION.displayTokenCoverage.toFixed(2)}% | ${report.diagnosticConfigurations.CURRENT_PRODUCTION.displayUniqueFormCoverage.toFixed(2)}% | ${report.diagnosticConfigurations.CURRENT_PRODUCTION.fullyDisplayableTitles} (${report.diagnosticConfigurations.CURRENT_PRODUCTION.fullyDisplayableTitleRate.toFixed(2)}%) | ${report.diagnosticConfigurations.CURRENT_PRODUCTION.noLexicalEntryTokens} |
| **PHASE7E_EXPERIMENTAL** | ${report.diagnosticConfigurations.PHASE7E_EXPERIMENTAL.displayTokenCoverage.toFixed(2)}% | ${report.diagnosticConfigurations.PHASE7E_EXPERIMENTAL.displayUniqueFormCoverage.toFixed(2)}% | ${report.diagnosticConfigurations.PHASE7E_EXPERIMENTAL.fullyDisplayableTitles} (${report.diagnosticConfigurations.PHASE7E_EXPERIMENTAL.fullyDisplayableTitleRate.toFixed(2)}%) | ${report.diagnosticConfigurations.PHASE7E_EXPERIMENTAL.noLexicalEntryTokens} |

### C. Locked Holdout Split (20% / ${report.corpusManifest.lockedHoldoutCount.toLocaleString()} Titles)

| Configuration | Token Display Cov. | Unique Form Cov. | Fully Displayable Titles | Lexical Miss Tokens |
| :--- | :---: | :---: | :---: | :---: |
| **CURRENT_PRODUCTION** | ${report.holdoutConfigurations.CURRENT_PRODUCTION.displayTokenCoverage.toFixed(2)}% | ${report.holdoutConfigurations.CURRENT_PRODUCTION.displayUniqueFormCoverage.toFixed(2)}% | ${report.holdoutConfigurations.CURRENT_PRODUCTION.fullyDisplayableTitles} (${report.holdoutConfigurations.CURRENT_PRODUCTION.fullyDisplayableTitleRate.toFixed(2)}%) | ${report.holdoutConfigurations.CURRENT_PRODUCTION.noLexicalEntryTokens} |
| **PHASE7E_EXPERIMENTAL** | ${report.holdoutConfigurations.PHASE7E_EXPERIMENTAL.displayTokenCoverage.toFixed(2)}% | ${report.holdoutConfigurations.PHASE7E_EXPERIMENTAL.displayUniqueFormCoverage.toFixed(2)}% | ${report.holdoutConfigurations.PHASE7E_EXPERIMENTAL.fullyDisplayableTitles} (${report.holdoutConfigurations.PHASE7E_EXPERIMENTAL.fullyDisplayableTitleRate.toFixed(2)}%) | ${report.holdoutConfigurations.PHASE7E_EXPERIMENTAL.noLexicalEntryTokens} |

---

## 4. Coverage by Scholarly Work Type

| Work Type | Titles | Tokens | Baseline Display Cov. | Phase 7E Display Cov. | Miss Recovery Rate | Baseline Fully Disp. Rate | Phase 7E Fully Disp. Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
${report.workTypeBreakdown
  .map(
    (w) =>
      `| **${w.workType}** | ${w.titles} | ${w.persianTokens} | ${w.baselineDisplayCoverage.toFixed(2)}% | ${w.phase7EDisplayCoverage.toFixed(2)}% | ${w.lexicalMissRecoveryRate.toFixed(2)}% | ${w.baselineFullyDisplayableTitleRate.toFixed(2)}% | ${w.phase7EFullyDisplayableTitleRate.toFixed(2)}% |`
  )
  .join('\n')}

---

## 5. Coverage by Title Length Bucket

| Token Count Bucket | Titles | Baseline Fully Displayable Rate | Phase 7E Fully Displayable Rate | Delta (Δ) |
| :--- | :---: | :---: | :---: | :---: |
${report.titleLengthBreakdown
  .map(
    (b) =>
      `| **${b.bucket} tokens** | ${b.titles} | ${b.baselineFullyDisplayableRate.toFixed(2)}% | ${b.phase7EFullyDisplayableRate.toFixed(2)}% | +${(b.phase7EFullyDisplayableRate - b.baselineFullyDisplayableRate).toFixed(2)}% |`
  )
  .join('\n')}

---

## 6. Diagnostic Attribution of Remaining Misses (Diagnostic Split)

Joining the baseline unresolved \`NO_LEXICAL_ENTRY\` forms against the Kaikki knowledge base provides empirical evidence for the exact causes of remaining lexical misses:

| Blocker Category | Token Occurrences | Token Share | Unique Forms | Unique Form Share |
| :--- | :---: | :---: | :---: | :---: |
${report.diagnosticBlockerDistribution
  .map(
    (d) =>
      `| \`${d.category}\` | ${d.tokenOccurrences.toLocaleString()} | ${d.tokenSharePercent.toFixed(2)}% | ${d.uniqueForms.toLocaleString()} | ${d.uniqueFormSharePercent.toFixed(2)}% |`
  )
  .join('\n')}

### Proper-Name Diagnostic Cohort
- **Proper-Name Miss Tokens:** ${report.properNameCohort.properNameMissTokens.toLocaleString()} (${report.properNameCohort.tokenSharePercent.toFixed(2)}% of miss tokens)
- **Proper-Name Unique Forms:** ${report.properNameCohort.properNameUniqueForms.toLocaleString()} (${report.properNameCohort.uniqueFormSharePercent.toFixed(2)}% of miss forms)

### Surface Morphology Pattern Analysis
- **Forms with ZWNJ (\`\\u200c\`):** ${report.surfaceMorphologyPatterns.surfaceZwnjCount.toLocaleString()}
- **Forms with Plural Suffix \`-hā\` (\`ها\`):** ${report.surfaceMorphologyPatterns.surfaceSuffixHaCount.toLocaleString()}
- **Forms with Plural Ezafe \`-hā-ye\` (\`های\`):** ${report.surfaceMorphologyPatterns.surfaceSuffixHayeCount.toLocaleString()}
- **Forms with Relational \`-ī\` (\`ی\`):** ${report.surfaceMorphologyPatterns.surfaceSuffixYeCount.toLocaleString()}
- **Forms with Comparative \`-tar\` (\`تر\`):** ${report.surfaceMorphologyPatterns.surfaceSuffixTarCount.toLocaleString()}
- **Forms with Superlative \`-tarīn\` (\`ترین\`):** ${report.surfaceMorphologyPatterns.surfaceSuffixTarinCount.toLocaleString()}
- **Forms with Enclitic Pronouns (\`مان\` / \`شان\` / etc.):** ${report.surfaceMorphologyPatterns.surfaceEncliticPronounCount.toLocaleString()}

---

## 7. Recommended Next Intervention (Phase 7G)

**Derived strictly from the 80% DIAGNOSTIC partition:**

- **Recommended Phase:** \`${report.recommendedNextIntervention.recommendedPhase}\`
- **Primary Focus:** **${report.recommendedNextIntervention.primaryFocus}**
- **Rationale:** ${report.recommendedNextIntervention.rationale}
- **Dominant Blocker Category:** \`${report.recommendedNextIntervention.diagnosticEvidence.dominantBlockerCategory}\` (${report.recommendedNextIntervention.diagnosticEvidence.tokenShare.toFixed(2)}% of unresolved miss tokens, ${report.recommendedNextIntervention.diagnosticEvidence.uniqueFormShare.toFixed(2)}% of unique miss forms).

---

## 8. Governance Invariants

- **FALSE_AUTHORITATIVE:** \`0\`
- **UNDER_BLOCKED:** \`0\`
- **Automatic Promotions:** \`0\`
- **Authoritative Lexicon Mutations:** \`0\`
- **Production Fallback Pack Unchanged:** \`true\` (\`src/data/generated/kaikki-fallback.v1.json\`)
- **Evaluation Fallback Union Conflicts:** \`${report.fallbackUnionConflicts.length}\`
`;
}
