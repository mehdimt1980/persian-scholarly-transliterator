/**
 * Evaluation and summary reporting for Kaikki / Wiktionary scheme interpretation (Phase 7B).
 *
 * Core scholarly invariant:
 *   Evaluations against DEFAULT_LEXICON_REPOSITORY are strictly read-only.
 *   Hypothesis generation is fully independent of the reviewed lexicon.
 *   Automatically promoted = 0.
 *   Authoritative lexicon changes = 0.
 *   Runtime output changes = 0.
 */

import { DEFAULT_LEXICON_REPOSITORY } from '../../../../data/lexicon';
import { LexiconRepository } from '../../../lexicon/repository';
import { KAIKKI_SOURCE_ID } from '../extractor';
import {
  WIKT_AGGREGATOR_VERSION,
  WIKT_INTERPRETATION_RULESET_VERSION,
  WIKT_INTERPRETER_VERSION
} from './rules';
import type {
  CandidateLexiconEvaluation,
  KaikkiCandidateSchemeAnalysis,
  KaikkiInterpretationReport,
  LexiconComparisonOutcome
} from './types';

/**
 * Compare generated candidate consensus hypotheses against DEFAULT_LEXICON_REPOSITORY (read-only).
 */
export function evaluateCandidateAgainstLexicon(
  analysis: KaikkiCandidateSchemeAnalysis,
  lexiconRepo: LexiconRepository = DEFAULT_LEXICON_REPOSITORY
): CandidateLexiconEvaluation {
  const entry = lexiconRepo.findByNormalized(analysis.persianForm);
  const primaryCanonical = entry && entry.readings.length > 0 ? entry.readings[0].canonical : null;

  let outcome: LexiconComparisonOutcome;

  if (analysis.consensusTargetHypothesis !== null) {
    if (primaryCanonical !== null) {
      if (analysis.consensusTargetHypothesis.toLowerCase() === primaryCanonical.toLowerCase()) {
        outcome = 'EXACT_MATCH';
      } else {
        outcome = 'DIVERGENT';
      }
    } else {
      outcome = 'NO_REVIEWED_ENTRY';
    }
  } else {
    outcome = 'BLOCKED';
  }

  return {
    candidateId: analysis.candidateId,
    persianForm: analysis.persianForm,
    consensusStatus: analysis.consensusStatus,
    consensusTargetHypothesis: analysis.consensusTargetHypothesis,
    lexiconCanonical: primaryCanonical,
    outcome,
    divergenceNotes:
      outcome === 'DIVERGENT'
        ? `Hypothesis "${analysis.consensusTargetHypothesis}" diverges from reviewed canonical "${primaryCanonical}".`
        : undefined
  };
}

export const evaluateCandidateAgainstReviewedLexicon = evaluateCandidateAgainstLexicon;

export function computeKaikkiInterpretationReport(params: {
  analyses?: KaikkiCandidateSchemeAnalysis[];
  candidateAnalyses?: KaikkiCandidateSchemeAnalysis[];
  candidates?: unknown[];
  evidence?: unknown[];
  candidateEvaluations?: unknown[];
  datasetName?: string;
  lexiconRepo?: LexiconRepository;
  timestamp?: string;
}): KaikkiInterpretationReport {
  const targetAnalyses = params.candidateAnalyses ?? params.analyses ?? [];
  return buildKaikkiInterpretationReport({
    analyses: targetAnalyses,
    lexiconRepo: params.lexiconRepo,
    timestamp: params.timestamp
  });
}

/**
 * Compile comprehensive interpretation and yield report from candidate analyses.
 */
export function buildKaikkiInterpretationReport(params: {
  analyses: KaikkiCandidateSchemeAnalysis[];
  lexiconRepo?: LexiconRepository;
  timestamp?: string;
}): KaikkiInterpretationReport {
  const { analyses, lexiconRepo = DEFAULT_LEXICON_REPOSITORY, timestamp = new Date().toISOString() } = params;

  let totalObservations = 0;

  let classicalDari = 0;
  let iranian = 0;
  let unclassified = 0;
  let conflicting = 0;

  let deterministicInterps = 0;
  let contextRequiredInterps = 0;
  let unsupportedInterps = 0;

  let unanimousDeterministic = 0;
  let conflictingDeterministic = 0;
  let partial = 0;
  let blocked = 0;
  let noInterpretableEvidence = 0;

  let exactMatches = 0;
  let divergences = 0;
  let newForms = 0;
  let blockedEvaluations = 0;

  const samples: KaikkiInterpretationReport['samples'] = [];

  for (const analysis of analyses) {
    totalObservations += analysis.interpretations.length;

    for (const interp of analysis.interpretations) {
      if (interp.sourceProfile === 'CLASSICAL_DARI') classicalDari += 1;
      else if (interp.sourceProfile === 'IRANIAN') iranian += 1;
      else if (interp.sourceProfile === 'CONFLICTING') conflicting += 1;
      else unclassified += 1;

      if (interp.status === 'DIRECT_EQUIVALENT' || interp.status === 'DETERMINISTIC_EQUIVALENT') {
        deterministicInterps += 1;
      } else if (interp.status === 'CONTEXT_REQUIRED') {
        contextRequiredInterps += 1;
      } else {
        unsupportedInterps += 1;
      }
    }

    if (analysis.consensusStatus === 'UNANIMOUS_DETERMINISTIC') unanimousDeterministic += 1;
    else if (analysis.consensusStatus === 'CONFLICTING_DETERMINISTIC') conflictingDeterministic += 1;
    else if (analysis.consensusStatus === 'PARTIAL') partial += 1;
    else if (analysis.consensusStatus === 'BLOCKED') blocked += 1;
    else noInterpretableEvidence += 1;

    const evaluation = evaluateCandidateAgainstLexicon(analysis, lexiconRepo);
    if (evaluation.outcome === 'EXACT_MATCH') exactMatches += 1;
    else if (evaluation.outcome === 'DIVERGENT') divergences += 1;
    else if (evaluation.outcome === 'NO_REVIEWED_ENTRY') newForms += 1;
    else blockedEvaluations += 1;

    if (samples.length < 50) {
      samples.push({
        persianForm: analysis.persianForm,
        sourceObservations: analysis.interpretations.map((i) => ({
          romanization: i.rawObservedRomanization,
          profile: i.sourceProfile
        })),
        targetHypotheses: analysis.deterministicTargetHypotheses,
        consensus: analysis.consensusStatus,
        authoritative: false
      });
    }
  }

  const profileClassifiedCount = classicalDari + iranian;
  const profileClassifiedPct =
    totalObservations > 0 ? (profileClassifiedCount / totalObservations) * 100 : 0;
  const deterministicInterpPct =
    totalObservations > 0 ? (deterministicInterps / totalObservations) * 100 : 0;
  const candidateUnanimousPct =
    analyses.length > 0 ? (unanimousDeterministic / analyses.length) * 100 : 0;

  return {
    source: KAIKKI_SOURCE_ID,
    interpreterVersion: WIKT_INTERPRETER_VERSION,
    ruleSetVersion: WIKT_INTERPRETATION_RULESET_VERSION,
    aggregatorVersion: WIKT_AGGREGATOR_VERSION,
    timestamp,

    totalCandidates: analyses.length,
    totalObservations,

    profileBreakdown: {
      classicalDari,
      iranian,
      unclassified,
      conflicting
    },

    interpretationBreakdown: {
      deterministic: deterministicInterps,
      contextRequired: contextRequiredInterps,
      unsupported: unsupportedInterps
    },

    consensusBreakdown: {
      unanimousDeterministic,
      conflictingDeterministic,
      partial,
      blocked,
      noInterpretableEvidence
    },

    lexiconEvaluation: {
      exactMatches,
      divergences,
      newForms,
      blocked: blockedEvaluations
    },

    yieldMetrics: {
      profileClassifiedPercentage: parseFloat(profileClassifiedPct.toFixed(2)),
      deterministicInterpretationPercentage: parseFloat(deterministicInterpPct.toFixed(2)),
      candidateUnanimousConsensusPercentage: parseFloat(candidateUnanimousPct.toFixed(2))
    },

    samples,

    promotionCount: 0,
    authoritativeLexiconChanges: 0,
    runtimeOutputChanges: 0
  };
}

/**
 * Format human-readable summary table for Phase 7B pilot report.
 */
export function formatKaikkiInterpretationSummary(report: KaikkiInterpretationReport): string {
  const pad = (label: string, value: string | number) =>
    `${label.padEnd(36)} ${String(value).padStart(12)}`;

  return [
    '====================================================================',
    'Kaikki → IJMES Interpretation Pilot (Phase 7B)',
    '====================================================================',
    pad('Valid lexical candidates:', report.totalCandidates.toLocaleString()),
    pad('Romanization observations:', report.totalObservations.toLocaleString()),
    '',
    'Source profile breakdown:',
    pad('  Classical / Dari:', report.profileBreakdown.classicalDari.toLocaleString()),
    pad('  Iranian:', report.profileBreakdown.iranian.toLocaleString()),
    pad('  Unclassified:', report.profileBreakdown.unclassified.toLocaleString()),
    pad('  Conflicting:', report.profileBreakdown.conflicting.toLocaleString()),
    '',
    'Interpretations:',
    pad('  Direct/deterministic hypothesis:', report.interpretationBreakdown.deterministic.toLocaleString()),
    pad('  Context required / blocked:', report.interpretationBreakdown.contextRequired.toLocaleString()),
    pad('  Unsupported:', report.interpretationBreakdown.unsupported.toLocaleString()),
    '',
    'Candidate consensus:',
    pad('  Unanimous deterministic:', report.consensusBreakdown.unanimousDeterministic.toLocaleString()),
    pad('  Conflicting deterministic:', report.consensusBreakdown.conflictingDeterministic.toLocaleString()),
    pad('  Partial:', report.consensusBreakdown.partial.toLocaleString()),
    pad('  Blocked:', report.consensusBreakdown.blocked.toLocaleString()),
    pad('  No interpretable evidence:', report.consensusBreakdown.noInterpretableEvidence.toLocaleString()),
    '',
    'Reviewed lexicon comparison:',
    pad('  Exact matches:', report.lexiconEvaluation.exactMatches.toLocaleString()),
    pad('  Divergences:', report.lexiconEvaluation.divergences.toLocaleString()),
    pad('  New forms (unreviewed in lexicon):', report.lexiconEvaluation.newForms.toLocaleString()),
    pad('  Blocked from comparison:', report.lexiconEvaluation.blocked.toLocaleString()),
    '',
    'Yield metrics:',
    pad('  Profile classified rate:', `${report.yieldMetrics.profileClassifiedPercentage}%`),
    pad('  Deterministic interpretation rate:', `${report.yieldMetrics.deterministicInterpretationPercentage}%`),
    pad('  Candidate unanimous consensus rate:', `${report.yieldMetrics.candidateUnanimousConsensusPercentage}%`),
    '',
    pad('Automatically promoted:', report.promotionCount),
    pad('Authoritative lexicon changes:', report.authoritativeLexiconChanges),
    pad('Runtime output changes:', report.runtimeOutputChanges),
    '===================================================================='
  ].join('\n');
}
