/**
 * Reusable Coverage Evaluator for Persian Scholarly Titles and Bibliographies.
 *
 * Evaluates corpora across 3 configurations:
 *   1. REVIEWED_ONLY
 *   2. CURRENT_PRODUCTION
 *   3. PHASE7E_EXPERIMENTAL
 *
 * Core Scholarly Invariants:
 *   - Denominator is strictly Persian lexical tokens (tokenType === 'persian-word').
 *   - Authoritative token: status in {'DETERMINISTIC', 'LEXICON_RESOLVED'}.
 *   - Displayable token: authoritative OR has evidenceDerivedProposal.
 *   - Unresolved placeholders are never counted as displayable.
 *   - No transliteration correctness claims: measures coverage and recovery only.
 */

import { DEFAULT_LEXICON_REPOSITORY } from '../../data/lexicon';
import {
  DEFAULT_EVIDENCE_FALLBACK_REPOSITORY,
  EMPTY_EVIDENCE_FALLBACK_REPOSITORY
} from '../../data/fallback';
import { transliterate, type TransliterationOptions } from '../engine';
import { EvidenceFallbackRepository } from '../evidence/kaikki/fallback/repository';
import type {
  ConfigurationMetrics,
  CoverageConfigurationName,
  CoverageCorpusCase,
  CoverageTitleOutcome,
  CoverageTokenOutcome,
  MissRecoveryMetrics,
  TitleLengthMetrics,
  WorkTypeMetrics
} from './types';

export const EVALUATOR_VERSION = '1.0.0';

export interface EvaluatorOptions {
  phase7ERepository?: EvidenceFallbackRepository;
}

export interface ConfigurationEvaluationOutput {
  configName: CoverageConfigurationName;
  titleOutcomes: CoverageTitleOutcome[];
  metricsAll: ConfigurationMetrics;
  metricsDiagnostic: ConfigurationMetrics;
  metricsHoldout: ConfigurationMetrics;
}

export interface FullCorpusEvaluationResult {
  totalCases: number;
  totalPersianTokens: number;
  uniquePersianForms: number;
  workTypeDistribution: Record<string, number>;
  publicationYearDistribution: Record<string, number>;

  configurations: Record<CoverageConfigurationName, ConfigurationMetrics>;
  diagnosticConfigurations: Record<CoverageConfigurationName, ConfigurationMetrics>;
  holdoutConfigurations: Record<CoverageConfigurationName, ConfigurationMetrics>;

  missRecoveryOverall: MissRecoveryMetrics;
  missRecoveryDiagnostic: MissRecoveryMetrics;
  missRecoveryHoldout: MissRecoveryMetrics;

  workTypeBreakdown: WorkTypeMetrics[];
  titleLengthBreakdown: TitleLengthMetrics[];

  // Per-case detailed outcomes across configurations
  detailedByConfig: Record<CoverageConfigurationName, CoverageTitleOutcome[]>;
}

function evaluateSingleTitle(
  corpusCase: CoverageCorpusCase,
  configName: CoverageConfigurationName,
  fallbackRepo: EvidenceFallbackRepository,
  transliterationOptions?: TransliterationOptions
): CoverageTitleOutcome {
  const result = transliterate(
    corpusCase.rawText,
    'ijmes_citation_title',
    [],
    DEFAULT_LEXICON_REPOSITORY,
    fallbackRepo,
    transliterationOptions
  );

  // Filter strictly for Persian lexical tokens
  const persianTokens = result.tokens.filter(
    (token) => token.tokenType === 'persian-word'
  );

  const tokenOutcomes: CoverageTokenOutcome[] = persianTokens.map((token) => {
    const hasProposal = Boolean(
      (token as unknown as { evidenceDerivedProposal?: unknown }).evidenceDerivedProposal
    );
    const isAuthoritative =
      token.status === 'DETERMINISTIC' || token.status === 'LEXICON_RESOLVED';
    const isDisplayable = isAuthoritative || hasProposal;
    const proposal = (
      token as unknown as {
        evidenceDerivedProposal?: { renderedProposal?: string; hypothesis?: string };
      }
    ).evidenceDerivedProposal?.hypothesis;

    return {
      surface: token.normalizedSurface,
      normalizedSurface: token.normalizedSurface,
      tokenType: token.tokenType,
      status: token.status,
      blockingReason: token.blockingReason,
      hasProposal,
      isAuthoritative,
      isDisplayable,
      proposal,
      rendered: token.rendered,
      canonicalTransliteration: token.canonicalTransliteration
    };
  });

  const totalPersianTokens = tokenOutcomes.length;
  const fullyAuthoritative =
    totalPersianTokens > 0 && tokenOutcomes.every((t) => t.isAuthoritative);
  const fullyDisplayable =
    totalPersianTokens > 0 && tokenOutcomes.every((t) => t.isDisplayable);
  const hasProposal = tokenOutcomes.some((t) => t.hasProposal);
  const hasLexicalMiss = tokenOutcomes.some(
    (t) => t.status === 'UNRESOLVED' && t.blockingReason === 'NO_LEXICAL_ENTRY'
  );
  const hasOtherBlockers = tokenOutcomes.some(
    (t) => !t.isAuthoritative && !t.hasProposal && t.blockingReason !== 'NO_LEXICAL_ENTRY'
  );

  return {
    caseId: corpusCase.id,
    split: corpusCase.split,
    sourceId: corpusCase.sourceId,
    rawText: corpusCase.rawText,
    normalizedText: corpusCase.normalizedText,
    workType: String(corpusCase.metadata?.workType ?? 'unknown'),
    publicationYear: corpusCase.metadata?.publicationYear,
    totalPersianTokens,
    fullyAuthoritative,
    fullyDisplayable,
    fullyCopyable: result.copyable,
    hasProposal,
    hasLexicalMiss,
    hasOtherBlockers,
    tokens: tokenOutcomes
  };
}

function computeMetricsForCohort(
  outcomes: CoverageTitleOutcome[],
  configName: CoverageConfigurationName,
  split: 'ALL' | 'DIAGNOSTIC' | 'LOCKED_HOLDOUT'
): ConfigurationMetrics {
  const totalTitles = outcomes.length;
  let totalPersianTokens = 0;
  let authoritativeTokens = 0;
  let displayableTokens = 0;
  let evidenceDerivedTokens = 0;
  let noLexicalEntryTokens = 0;
  let otherBlockerTokens = 0;
  let ambiguousTokens = 0;

  const distinctForms = new Set<string>();
  const authoritativeForms = new Set<string>();
  const displayableForms = new Set<string>();
  const noLexicalForms = new Set<string>();
  const otherBlockerForms = new Set<string>();

  let fullyAuthoritativeTitles = 0;
  let fullyDisplayableTitles = 0;
  let copyableTitles = 0;
  let titlesWithProposals = 0;
  let titlesWithLexicalMisses = 0;
  let titlesWithOtherBlockers = 0;

  for (const title of outcomes) {
    if (title.fullyAuthoritative) fullyAuthoritativeTitles += 1;
    if (title.fullyDisplayable) fullyDisplayableTitles += 1;
    if (title.fullyCopyable) copyableTitles += 1;
    if (title.hasProposal) titlesWithProposals += 1;
    if (title.hasLexicalMiss) titlesWithLexicalMisses += 1;
    if (title.hasOtherBlockers) titlesWithOtherBlockers += 1;

    for (const token of title.tokens) {
      totalPersianTokens += 1;
      const form = token.normalizedSurface;
      distinctForms.add(form);

      if (token.isAuthoritative) {
        authoritativeTokens += 1;
        authoritativeForms.add(form);
      }
      if (token.isDisplayable) {
        displayableTokens += 1;
        displayableForms.add(form);
      }
      if (token.hasProposal) {
        evidenceDerivedTokens += 1;
      }
      if (token.status === 'UNRESOLVED' && token.blockingReason === 'NO_LEXICAL_ENTRY') {
        noLexicalEntryTokens += 1;
        noLexicalForms.add(form);
      } else if (!token.isAuthoritative && !token.hasProposal) {
        otherBlockerTokens += 1;
        otherBlockerForms.add(form);
      }
      if (token.status === 'AMBIGUOUS') {
        ambiguousTokens += 1;
      }
    }
  }

  const uniquePersianForms = distinctForms.size;

  return {
    configName,
    split,
    totalTitles,
    totalPersianTokens,
    uniquePersianForms,

    authoritativeTokens,
    authoritativeTokenCoverage:
      totalPersianTokens > 0 ? (authoritativeTokens / totalPersianTokens) * 100 : 0,
    displayableTokens,
    displayTokenCoverage:
      totalPersianTokens > 0 ? (displayableTokens / totalPersianTokens) * 100 : 0,
    evidenceDerivedTokens,
    noLexicalEntryTokens,
    otherBlockerTokens,
    ambiguousTokens,

    authoritativeUniqueForms: authoritativeForms.size,
    authoritativeUniqueFormCoverage:
      uniquePersianForms > 0
        ? (authoritativeForms.size / uniquePersianForms) * 100
        : 0,
    displayableUniqueForms: displayableForms.size,
    displayUniqueFormCoverage:
      uniquePersianForms > 0
        ? (displayableForms.size / uniquePersianForms) * 100
        : 0,
    noLexicalEntryUniqueForms: noLexicalForms.size,
    otherBlockerUniqueForms: otherBlockerForms.size,

    fullyAuthoritativeTitles,
    fullyAuthoritativeTitleRate:
      totalTitles > 0 ? (fullyAuthoritativeTitles / totalTitles) * 100 : 0,
    fullyDisplayableTitles,
    fullyDisplayableTitleRate:
      totalTitles > 0 ? (fullyDisplayableTitles / totalTitles) * 100 : 0,
    copyableTitles,
    copyableTitleRate:
      totalTitles > 0 ? (copyableTitles / totalTitles) * 100 : 0,
    titlesWithProposals,
    titlesWithLexicalMisses,
    titlesWithOtherBlockers
  };
}

function computeMissRecovery(
  baselineOutcomes: CoverageTitleOutcome[],
  phase7EOutcomes: CoverageTitleOutcome[],
  split: 'ALL' | 'DIAGNOSTIC' | 'LOCKED_HOLDOUT'
): MissRecoveryMetrics {
  let baselineMissTokens = 0;
  let recoveredMissTokens = 0;

  const baselineMissForms = new Set<string>();
  const recoveredMissForms = new Set<string>();

  let titlesWithBaselineMisses = 0;
  let titlesWithAtLeastOneRecovery = 0;
  let titlesWithAllMissesRecovered = 0;
  let titlesStillPartiallyUnresolved = 0;

  for (let i = 0; i < baselineOutcomes.length; i++) {
    const baseTitle = baselineOutcomes[i];
    const expTitle = phase7EOutcomes[i];

    let titleBaselineMisses = 0;
    let titleRecoveredMisses = 0;

    for (let t = 0; t < baseTitle.tokens.length; t++) {
      const baseTok = baseTitle.tokens[t];
      const expTok = expTitle.tokens[t];

      if (baseTok.status === 'UNRESOLVED' && baseTok.blockingReason === 'NO_LEXICAL_ENTRY') {
        baselineMissTokens += 1;
        baselineMissForms.add(baseTok.normalizedSurface);
        titleBaselineMisses += 1;

        if (expTok && expTok.hasProposal) {
          recoveredMissTokens += 1;
          recoveredMissForms.add(baseTok.normalizedSurface);
          titleRecoveredMisses += 1;
        }
      }
    }

    if (titleBaselineMisses > 0) {
      titlesWithBaselineMisses += 1;
      if (titleRecoveredMisses > 0) {
        titlesWithAtLeastOneRecovery += 1;
      }
      if (titleRecoveredMisses === titleBaselineMisses) {
        titlesWithAllMissesRecovered += 1;
      } else {
        titlesStillPartiallyUnresolved += 1;
      }
    }
  }

  return {
    split,
    baselineMissTokens,
    recoveredMissTokens,
    tokenLexicalMissRecoveryRate:
      baselineMissTokens > 0
        ? (recoveredMissTokens / baselineMissTokens) * 100
        : 0,

    baselineUniqueMissForms: baselineMissForms.size,
    recoveredUniqueMissForms: recoveredMissForms.size,
    uniqueFormLexicalMissRecoveryRate:
      baselineMissForms.size > 0
        ? (recoveredMissForms.size / baselineMissForms.size) * 100
        : 0,

    titlesWithBaselineMisses,
    titlesWithAtLeastOneRecovery,
    titlesWithAllMissesRecovered,
    titlesStillPartiallyUnresolved
  };
}

export function evaluateCoverageCorpus(
  cases: CoverageCorpusCase[],
  options: EvaluatorOptions = {}
): FullCorpusEvaluationResult {
  const configDefs: Array<{
    name: CoverageConfigurationName;
    repo: EvidenceFallbackRepository;
    transOptions?: TransliterationOptions;
  }> = [
    {
      name: 'REVIEWED_ONLY',
      repo: EMPTY_EVIDENCE_FALLBACK_REPOSITORY
    },
    {
      name: 'CURRENT_PRODUCTION',
      repo: DEFAULT_EVIDENCE_FALLBACK_REPOSITORY
    },
    {
      name: 'PHASE7E_EXPERIMENTAL',
      repo: options.phase7ERepository ?? DEFAULT_EVIDENCE_FALLBACK_REPOSITORY
    },
    {
      name: 'PHASE7G_SAFE_ROUTING',
      repo: options.phase7ERepository ?? DEFAULT_EVIDENCE_FALLBACK_REPOSITORY,
      transOptions: { resolutionPolicy: 'SAFE_WHOLE_WORD_EVIDENCE' }
    }
  ];

  const detailedByConfig: Record<CoverageConfigurationName, CoverageTitleOutcome[]> = {
    REVIEWED_ONLY: [],
    CURRENT_PRODUCTION: [],
    PHASE7E_EXPERIMENTAL: [],
    PHASE7G_SAFE_ROUTING: []
  };

  const configurations = {} as Record<CoverageConfigurationName, ConfigurationMetrics>;
  const diagnosticConfigurations = {} as Record<CoverageConfigurationName, ConfigurationMetrics>;
  const holdoutConfigurations = {} as Record<CoverageConfigurationName, ConfigurationMetrics>;

  const workTypeDist: Record<string, number> = {};
  const pubYearDist: Record<string, number> = {};

  for (const c of cases) {
    const wt = c.metadata?.workType || 'unknown';
    workTypeDist[wt] = (workTypeDist[wt] ?? 0) + 1;

    const py = c.metadata?.publicationYear ? String(c.metadata.publicationYear) : 'unknown';
    pubYearDist[py] = (pubYearDist[py] ?? 0) + 1;
  }

  for (const { name, repo, transOptions } of configDefs) {
    const titleOutcomes: CoverageTitleOutcome[] = cases.map((c) =>
      evaluateSingleTitle(c, name, repo, transOptions)
    );

    detailedByConfig[name] = titleOutcomes;

    const diagnosticOutcomes = titleOutcomes.filter((t) => t.split === 'DIAGNOSTIC');
    const holdoutOutcomes = titleOutcomes.filter((t) => t.split === 'LOCKED_HOLDOUT');

    configurations[name] = computeMetricsForCohort(titleOutcomes, name, 'ALL');
    diagnosticConfigurations[name] = computeMetricsForCohort(
      diagnosticOutcomes,
      name,
      'DIAGNOSTIC'
    );
    holdoutConfigurations[name] = computeMetricsForCohort(
      holdoutOutcomes,
      name,
      'LOCKED_HOLDOUT'
    );
  }

  const baseDetailed = detailedByConfig.CURRENT_PRODUCTION;
  const expDetailed = detailedByConfig.PHASE7E_EXPERIMENTAL;

  const missRecoveryOverall = computeMissRecovery(baseDetailed, expDetailed, 'ALL');
  const missRecoveryDiagnostic = computeMissRecovery(
    baseDetailed.filter((t) => t.split === 'DIAGNOSTIC'),
    expDetailed.filter((t) => t.split === 'DIAGNOSTIC'),
    'DIAGNOSTIC'
  );
  const missRecoveryHoldout = computeMissRecovery(
    baseDetailed.filter((t) => t.split === 'LOCKED_HOLDOUT'),
    expDetailed.filter((t) => t.split === 'LOCKED_HOLDOUT'),
    'LOCKED_HOLDOUT'
  );

  // Work type breakdown
  const workTypeBreakdown: WorkTypeMetrics[] = Object.keys(workTypeDist).map((wt) => {
    const indices: number[] = [];
    cases.forEach((c, idx) => {
      if ((c.metadata?.workType || 'unknown') === wt) indices.push(idx);
    });

    const subsetBase = indices.map((idx) => baseDetailed[idx]);
    const subsetExp = indices.map((idx) => expDetailed[idx]);

    const baseMet = computeMetricsForCohort(subsetBase, 'CURRENT_PRODUCTION', 'ALL');
    const expMet = computeMetricsForCohort(subsetExp, 'PHASE7E_EXPERIMENTAL', 'ALL');
    const recMet = computeMissRecovery(subsetBase, subsetExp, 'ALL');

    return {
      workType: wt,
      titles: subsetBase.length,
      persianTokens: baseMet.totalPersianTokens,
      baselineDisplayCoverage: baseMet.displayTokenCoverage,
      phase7EDisplayCoverage: expMet.displayTokenCoverage,
      lexicalMissRecoveryRate: recMet.tokenLexicalMissRecoveryRate,
      baselineFullyDisplayableTitleRate: baseMet.fullyDisplayableTitleRate,
      phase7EFullyDisplayableTitleRate: expMet.fullyDisplayableTitleRate
    };
  });

  // Title length breakdown (buckets: 2-4, 5-8, 9-15, 16+)
  const buckets: Array<{ bucket: '2-4' | '5-8' | '9-15' | '16+'; min: number; max: number }> = [
    { bucket: '2-4', min: 2, max: 4 },
    { bucket: '5-8', min: 5, max: 8 },
    { bucket: '9-15', min: 9, max: 15 },
    { bucket: '16+', min: 16, max: Infinity }
  ];

  const titleLengthBreakdown: TitleLengthMetrics[] = buckets.map(({ bucket, min, max }) => {
    const indices: number[] = [];
    baseDetailed.forEach((t, idx) => {
      if (t.totalPersianTokens >= min && t.totalPersianTokens <= max) {
        indices.push(idx);
      }
    });

    const subsetBase = indices.map((idx) => baseDetailed[idx]);
    const subsetExp = indices.map((idx) => expDetailed[idx]);

    const baseMet = computeMetricsForCohort(subsetBase, 'CURRENT_PRODUCTION', 'ALL');
    const expMet = computeMetricsForCohort(subsetExp, 'PHASE7E_EXPERIMENTAL', 'ALL');

    return {
      bucket,
      titles: subsetBase.length,
      baselineFullyDisplayableRate: baseMet.fullyDisplayableTitleRate,
      phase7EFullyDisplayableRate: expMet.fullyDisplayableTitleRate
    };
  });

  return {
    totalCases: cases.length,
    totalPersianTokens: configurations.CURRENT_PRODUCTION.totalPersianTokens,
    uniquePersianForms: configurations.CURRENT_PRODUCTION.uniquePersianForms,
    workTypeDistribution: workTypeDist,
    publicationYearDistribution: pubYearDist,
    configurations,
    diagnosticConfigurations,
    holdoutConfigurations,
    missRecoveryOverall,
    missRecoveryDiagnostic,
    missRecoveryHoldout,
    workTypeBreakdown,
    titleLengthBreakdown,
    detailedByConfig
  };
}
