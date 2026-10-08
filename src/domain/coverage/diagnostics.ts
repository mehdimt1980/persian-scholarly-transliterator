/**
 * Diagnostic Analysis and Blocker Attribution for Phase 7F.
 *
 * Implements:
 *   - Remaining-miss diagnostic join against Kaikki / Wiktionary knowledge pipeline.
 *   - Frequency-weighting of remaining blocker categories.
 *   - Proper-name cohort metrics.
 *   - Surface morphology pattern diagnostics.
 *   - Top-100 diagnostic worklists.
 *   - Deterministic audit samples (50 items each).
 *   - Evidence-based next-intervention ranking strictly from the DIAGNOSTIC split.
 */

import crypto from 'node:crypto';
import type {
  BlockerDistributionItem,
  CoverageTitleOutcome,
  DiagnosticBlockerCategory,
  ProperNameMissMetrics,
  SurfaceMorphologyDiagnosticMetrics,
  WorklistItem
} from './types';
import type { EvidenceFallbackPack } from '../evidence/kaikki/fallback/types';

export interface KaikkiDiagnosticIndexEntry {
  normalizedForm: string;
  isLemma: boolean;
  isProperName: boolean;
  romanizationCount: number;
  hasProfileBlocked?: boolean;
  hasConflict?: boolean;
  posList: string[];
}

export type KaikkiDiagnosticIndex = Record<string, KaikkiDiagnosticIndexEntry>;

export function analyzeSurfaceMorphology(
  forms: string[]
): SurfaceMorphologyDiagnosticMetrics {
  let surfaceZwnjCount = 0;
  let surfaceSuffixHaCount = 0;
  let surfaceSuffixHayeCount = 0;
  let surfaceSuffixYeCount = 0;
  let surfaceSuffixTarCount = 0;
  let surfaceSuffixTarinCount = 0;
  let surfaceEncliticPronounCount = 0;

  const encliticPattern = /(\u200c(ام|ات|اش|مان|تان|شان)|(مان|تان|شان))$/;

  for (const form of forms) {
    if (form.includes('\u200c')) {
      surfaceZwnjCount += 1;
    }
    if (form.endsWith('\u200cها') || (form.endsWith('ها') && form.length > 2)) {
      surfaceSuffixHaCount += 1;
    }
    if (form.endsWith('\u200cهای') || (form.endsWith('های') && form.length > 3)) {
      surfaceSuffixHayeCount += 1;
    }
    if (form.endsWith('\u200cی') || (form.endsWith('ی') && form.length > 2)) {
      surfaceSuffixYeCount += 1;
    }
    if (form.endsWith('\u200cتر') || (form.endsWith('تر') && form.length > 2)) {
      surfaceSuffixTarCount += 1;
    }
    if (form.endsWith('\u200cترین') || (form.endsWith('ترین') && form.length > 4)) {
      surfaceSuffixTarinCount += 1;
    }
    if (encliticPattern.test(form) && form.length > 3) {
      surfaceEncliticPronounCount += 1;
    }
  }

  return {
    totalAnalyzedForms: forms.length,
    surfaceZwnjCount,
    surfaceSuffixHaCount,
    surfaceSuffixHayeCount,
    surfaceSuffixYeCount,
    surfaceSuffixTarCount,
    surfaceSuffixTarinCount,
    surfaceEncliticPronounCount
  };
}

export function classifyDiagnosticBlocker(
  form: string,
  phase7EPack: EvidenceFallbackPack,
  kaikkiIndex?: KaikkiDiagnosticIndex
): { category: DiagnosticBlockerCategory; isProperName: boolean; summary: string } {
  // 1. Is it covered in Phase 7E recovered pack?
  if (phase7EPack.entries && phase7EPack.entries[form]) {
    return {
      category: 'PHASE7E_ELIGIBLE',
      isProperName: false,
      summary: 'Covered by Phase 7E recovered fallback pack'
    };
  }

  // 2. Is it in Kaikki dictionary?
  const entry = kaikkiIndex ? kaikkiIndex[form] : undefined;
  if (!entry) {
    return {
      category: 'NOT_PRESENT_IN_KAIKKI',
      isProperName: false,
      summary: 'Form absent from Wiktionary/Kaikki Persian dataset'
    };
  }

  const isProper = entry.isProperName;

  if (!entry.isLemma) {
    return {
      category: 'KAIKKI_NON_LEMMA',
      isProperName: isProper,
      summary: `Non-lemma/inflected form in Kaikki (POS: ${entry.posList.join(', ') || 'inflected'})`
    };
  }

  if (entry.romanizationCount === 0) {
    return {
      category: 'KAIKKI_NO_ROMANIZATION',
      isProperName: isProper,
      summary: 'Kaikki lemma record lacks romanization observation'
    };
  }

  if (entry.hasConflict) {
    return {
      category: 'KAIKKI_CONFLICTING',
      isProperName: isProper,
      summary: 'Competing conflicting romanizations or scheme mapping conflict'
    };
  }

  if (entry.hasProfileBlocked) {
    return {
      category: 'KAIKKI_PROFILE_OR_ALIGNMENT_BLOCKED',
      isProperName: isProper,
      summary: 'Profile alignment or positional correspondence blocked'
    };
  }

  if (entry.romanizationCount === 1) {
    return {
      category: 'KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED',
      isProperName: isProper,
      summary: 'Single romanization observation without explicit/structural profile assignment'
    };
  }

  return {
    category: 'KAIKKI_LEMMA_MULTI_ROMANIZATION_INSUFFICIENT_SIGNAL',
    isProperName: isProper,
    summary: `Multi-romanization record (${entry.romanizationCount} roms) lacking sufficient positional signal`
  };
}

export function computeBlockerDistribution(
  missStats: Map<string, { tokenCount: number; titleCount: number }>,
  phase7EPack: EvidenceFallbackPack,
  kaikkiIndex?: KaikkiDiagnosticIndex
): {
  distribution: BlockerDistributionItem[];
  properNameCohort: ProperNameMissMetrics;
  itemDetails: Map<
    string,
    {
      category: DiagnosticBlockerCategory;
      isProperName: boolean;
      summary: string;
      tokenCount: number;
      titleCount: number;
    }
  >;
} {
  let totalMissTokens = 0;
  const totalMissForms = missStats.size;

  const categoryTokens = new Map<DiagnosticBlockerCategory, number>();
  const categoryForms = new Map<DiagnosticBlockerCategory, number>();

  let properNameTokens = 0;
  let properNameForms = 0;

  const itemDetails = new Map<
    string,
    {
      category: DiagnosticBlockerCategory;
      isProperName: boolean;
      summary: string;
      tokenCount: number;
      titleCount: number;
    }
  >();

  for (const [form, stats] of missStats.entries()) {
    totalMissTokens += stats.tokenCount;
    const classification = classifyDiagnosticBlocker(form, phase7EPack, kaikkiIndex);

    itemDetails.set(form, {
      ...classification,
      tokenCount: stats.tokenCount,
      titleCount: stats.titleCount
    });

    const cat = classification.category;
    categoryTokens.set(cat, (categoryTokens.get(cat) ?? 0) + stats.tokenCount);
    categoryForms.set(cat, (categoryForms.get(cat) ?? 0) + 1);

    if (classification.isProperName) {
      properNameTokens += stats.tokenCount;
      properNameForms += 1;
    }
  }

  const allCategories: DiagnosticBlockerCategory[] = [
    'KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED',
    'KAIKKI_NON_LEMMA',
    'NOT_PRESENT_IN_KAIKKI',
    'KAIKKI_LEMMA_MULTI_ROMANIZATION_INSUFFICIENT_SIGNAL',
    'PHASE7E_ELIGIBLE',
    'KAIKKI_NO_ROMANIZATION',
    'KAIKKI_PROFILE_OR_ALIGNMENT_BLOCKED',
    'KAIKKI_CONFLICTING'
  ];

  const distribution: BlockerDistributionItem[] = allCategories.map((cat) => {
    const tokens = categoryTokens.get(cat) ?? 0;
    const forms = categoryForms.get(cat) ?? 0;
    return {
      category: cat,
      tokenOccurrences: tokens,
      uniqueForms: forms,
      tokenSharePercent: totalMissTokens > 0 ? (tokens / totalMissTokens) * 100 : 0,
      uniqueFormSharePercent: totalMissForms > 0 ? (forms / totalMissForms) * 100 : 0
    };
  });

  // Sort distribution descending by token share
  distribution.sort((a, b) => b.tokenOccurrences - a.tokenOccurrences);

  const properNameCohort: ProperNameMissMetrics = {
    properNameMissTokens: properNameTokens,
    properNameUniqueForms: properNameForms,
    tokenSharePercent: totalMissTokens > 0 ? (properNameTokens / totalMissTokens) * 100 : 0,
    uniqueFormSharePercent: totalMissForms > 0 ? (properNameForms / totalMissForms) * 100 : 0
  };

  return {
    distribution,
    properNameCohort,
    itemDetails
  };
}

function sampleDeterministic(
  items: WorklistItem[],
  sampleSize: number = 50,
  seedPrefix: string = 'phase7f-audit'
): WorklistItem[] {
  const withHash = items.map((item) => ({
    item,
    hash: crypto
      .createHash('sha256')
      .update(`${seedPrefix}:${item.diagnosticCategory}:${item.persianForm}`)
      .digest('hex')
  }));

  withHash.sort((a, b) => a.hash.localeCompare(b.hash));
  return withHash.slice(0, sampleSize).map((w) => w.item);
}

export function generateWorklistsAndAuditSamples(
  itemDetails: Map<
    string,
    {
      category: DiagnosticBlockerCategory;
      isProperName: boolean;
      summary: string;
      tokenCount: number;
      titleCount: number;
    }
  >
): {
  topUnresolvedWorklist: WorklistItem[];
  topNewlyRecoveredWorklist: WorklistItem[];
  topAbsentFromKaikkiWorklist: WorklistItem[];
  topNonLemmaWorklist: WorklistItem[];
  topProperNameWorklist: WorklistItem[];
  auditSamples: {
    newlyRecovered: WorklistItem[];
    stillUnclassifiedKaikki: WorklistItem[];
    nonLemmaMisses: WorklistItem[];
    notPresentInKaikki: WorklistItem[];
    properNameMisses: WorklistItem[];
  };
} {
  const allItems: WorklistItem[] = Array.from(itemDetails.entries()).map(
    ([form, d]) => ({
      rank: 0,
      persianForm: form,
      tokenFrequency: d.tokenCount,
      titleCount: d.titleCount,
      diagnosticCategory: d.category,
      kaikkiStateSummary: d.summary,
      isProperName: d.isProperName
    })
  );

  // Sorting helper: frequency desc, then form asc
  const sortByFrequency = (list: WorklistItem[]) =>
    [...list]
      .sort((a, b) => b.tokenFrequency - a.tokenFrequency || a.persianForm.localeCompare(b.persianForm))
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

  const unresolvedPool = allItems.filter((i) => i.diagnosticCategory !== 'PHASE7E_ELIGIBLE');
  const recoveredPool = allItems.filter((i) => i.diagnosticCategory === 'PHASE7E_ELIGIBLE');
  const absentPool = allItems.filter((i) => i.diagnosticCategory === 'NOT_PRESENT_IN_KAIKKI');
  const nonLemmaPool = allItems.filter((i) => i.diagnosticCategory === 'KAIKKI_NON_LEMMA');
  const properNamePool = allItems.filter((i) => Boolean(i.isProperName));
  const unclassifiedPool = allItems.filter(
    (i) => i.diagnosticCategory === 'KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED'
  );

  const topUnresolvedWorklist = sortByFrequency(unresolvedPool).slice(0, 100);
  const topNewlyRecoveredWorklist = sortByFrequency(recoveredPool).slice(0, 100);
  const topAbsentFromKaikkiWorklist = sortByFrequency(absentPool).slice(0, 100);
  const topNonLemmaWorklist = sortByFrequency(nonLemmaPool).slice(0, 100);
  const topProperNameWorklist = sortByFrequency(properNamePool).slice(0, 100);

  const auditSamples = {
    newlyRecovered: sampleDeterministic(recoveredPool, 50, 'audit-recovered'),
    stillUnclassifiedKaikki: sampleDeterministic(unclassifiedPool, 50, 'audit-unclassified'),
    nonLemmaMisses: sampleDeterministic(nonLemmaPool, 50, 'audit-non-lemma'),
    notPresentInKaikki: sampleDeterministic(absentPool, 50, 'audit-absent'),
    properNameMisses: sampleDeterministic(properNamePool, 50, 'audit-proper-name')
  };

  return {
    topUnresolvedWorklist,
    topNewlyRecoveredWorklist,
    topAbsentFromKaikkiWorklist,
    topNonLemmaWorklist,
    topProperNameWorklist,
    auditSamples
  };
}

export function rankNextInterventionFromDiagnostic(
  diagnosticBlockers: BlockerDistributionItem[]
): {
  recommendedPhase: 'Phase 7G';
  primaryFocus: string;
  rationale: string;
  diagnosticEvidence: {
    dominantBlockerCategory: DiagnosticBlockerCategory;
    tokenShare: number;
    uniqueFormShare: number;
  };
} {
  // Filter out PHASE7E_ELIGIBLE to find the top REMAINING blocker category in Diagnostic Split
  const remaining = diagnosticBlockers.filter(
    (b) => b.category !== 'PHASE7E_ELIGIBLE'
  );
  const dominant = remaining[0] ?? diagnosticBlockers[0];

  let primaryFocus = 'Morphological Surface Disambiguation & Non-Lemma Lexicon Resolution';
  let rationale =
    'Non-lemma inflected forms constitute the largest empirical blocker cohort in scholarly titles.';

  if (dominant.category === 'KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED') {
    primaryFocus = 'Single-Romanization Profile Recovery & Corpus Phonotactic Classification';
    rationale =
      'Single-romanization unclassified lemma forms dominate empirical misses, offering high deterministic yield.';
  } else if (dominant.category === 'NOT_PRESENT_IN_KAIKKI') {
    primaryFocus = 'External Authority Expansion (LoC / Academic Authority Lexicon Integration)';
    rationale =
      'Forms absent from Wiktionary dominate, requiring external scholarly authority acquisition.';
  } else if (dominant.category === 'KAIKKI_NON_LEMMA') {
    primaryFocus = 'Morphology Pipeline & Inflected Form Resolution';
    rationale =
      'Inflected non-lemma forms dominate token occurrences in real scholarly titles.';
  }

  return {
    recommendedPhase: 'Phase 7G',
    primaryFocus,
    rationale,
    diagnosticEvidence: {
      dominantBlockerCategory: dominant.category,
      tokenShare: dominant.tokenSharePercent,
      uniqueFormShare: dominant.uniqueFormSharePercent
    }
  };
}
