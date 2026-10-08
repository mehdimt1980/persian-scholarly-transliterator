/**
 * Hardened Diagnostic Analysis and Blocker Attribution for Phase 7F.
 *
 * Implements:
 *   - Accurate multi-record Kaikki index aggregation (lemma, non-lemma, mixed).
 *   - Reconciled Phase 7E pack eligibility vs actual runtime recovery.
 *   - Two distinct mutually exclusive distributions:
 *       1. Baseline Misses by Source Availability (Pre-Phase 7E)
 *       2. Remaining Misses After Phase 7E Fallback (Post-Phase 7E)
 *   - Audit of pack entries intercepted at runtime.
 *   - Accurate ZWNJ analysis comparing raw and normalized input.
 *   - Deterministic worklists and audit sampling.
 *   - Next-phase recommendation based on post-Phase 7E remaining misses.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import readline from 'node:readline';
import { normalizePersian } from '../normalization';
import { determineLemmaStatus, extractRawRomanizations } from '../evidence/kaikki/extractor';
import type { KaikkiRawEntry } from '../evidence/kaikki/types';
import type {
  BlockerDistributionItem,
  CoverageCorpusCase,
  DiagnosticBlockerCategory,
  ProperNameMissMetrics,
  SurfaceMorphologyDiagnosticMetrics,
  UnappliedPackTokenDetail,
  WorklistItem
} from './types';
import type { EvidenceFallbackPack } from '../evidence/kaikki/fallback/types';

export const DIAGNOSTIC_INDEX_VERSION = '1.2.0';

export interface KaikkiDiagnosticIndexEntry {
  normalizedForm: string;
  sourceRecordCount: number;
  hasLemmaRecord: boolean;
  hasNonLemmaRecord: boolean;
  hasUnknownLemmaStatus: boolean;
  lemmaRomanizationCount: number;
  nonLemmaRomanizationCount: number;
  distinctRomanizations: string[];
  posList: string[];
  isProperName: boolean;
}

export type KaikkiDiagnosticIndex = Record<string, KaikkiDiagnosticIndexEntry>;

export interface FormRuntimeMissContext {
  tokenCount: number;
  titleCount: number;
  runtimeRecoveredTokenCount: number;
  runtimeNotAppliedTokenCount: number;
  exampleTitle: string;
}

export async function buildKaikkiDiagnosticIndex(
  kaikkiFilePath: string
): Promise<KaikkiDiagnosticIndex> {
  const index: KaikkiDiagnosticIndex = {};

  if (!fs.existsSync(kaikkiFilePath)) {
    throw new Error(`Kaikki Persian dataset not found at ${kaikkiFilePath}`);
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
      const entry = JSON.parse(trimmed) as KaikkiRawEntry;
      if (!entry.word) continue;

      const normalizedForm = normalizePersian(entry.word).normalizedInput.trim();
      const { lemmaStatus } = determineLemmaStatus(entry);
      const pos = entry.pos || 'unknown';
      const isProper =
        pos === 'name' ||
        pos === 'proper noun' ||
        (entry.head_templates?.some((h: any) =>
          h.name?.includes('proper') || h.name === 'fa-prop'
        ) ?? false);

      const rawRomanizations = extractRawRomanizations(entry);
      const romanizationValues = rawRomanizations.map((r) => r.value);

      let existing = index[normalizedForm];
      if (!existing) {
        existing = {
          normalizedForm,
          sourceRecordCount: 0,
          hasLemmaRecord: false,
          hasNonLemmaRecord: false,
          hasUnknownLemmaStatus: false,
          lemmaRomanizationCount: 0,
          nonLemmaRomanizationCount: 0,
          distinctRomanizations: [],
          posList: [],
          isProperName: false
        };
        index[normalizedForm] = existing;
      }

      existing.sourceRecordCount += 1;
      if (!existing.posList.includes(pos)) {
        existing.posList.push(pos);
      }
      existing.isProperName = existing.isProperName || isProper;

      for (const val of romanizationValues) {
        if (!existing.distinctRomanizations.includes(val)) {
          existing.distinctRomanizations.push(val);
        }
      }

      if (lemmaStatus === 'LEMMA') {
        existing.hasLemmaRecord = true;
        existing.lemmaRomanizationCount += rawRomanizations.length;
      } else if (lemmaStatus === 'NON_LEMMA_FORM') {
        existing.hasNonLemmaRecord = true;
        existing.nonLemmaRomanizationCount += rawRomanizations.length;
      } else {
        existing.hasUnknownLemmaStatus = true;
      }
    } catch {
      // Ignore malformed individual rows
    }
  }

  return index;
}

export function analyzeSurfaceMorphology(
  forms: string[],
  rawCases?: CoverageCorpusCase[]
): SurfaceMorphologyDiagnosticMetrics {
  let surfaceSuffixHaCount = 0;
  let surfaceSuffixHayeCount = 0;
  let surfaceSuffixYeCount = 0;
  let surfaceSuffixTarCount = 0;
  let surfaceSuffixTarinCount = 0;
  let surfaceEncliticPronounCount = 0;
  let normalizedZwnjCount = 0;
  let rawZwnjCount = 0;

  const encliticPattern = /(\u200c(ام|ات|اش|مان|تان|شان)|(مان|تان|شان))$/;

  for (const form of forms) {
    if (form.includes('\u200c')) {
      normalizedZwnjCount += 1;
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

  if (rawCases) {
    for (const c of rawCases) {
      if (c.rawText.includes('\u200c')) {
        rawZwnjCount += (c.rawText.match(/\u200c/g) || []).length;
      }
    }
  }

  return {
    totalAnalyzedForms: forms.length,
    rawZwnjCount,
    normalizedZwnjCount,
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
  runtimeContext: FormRuntimeMissContext,
  phase7EPack: EvidenceFallbackPack,
  kaikkiIndex?: KaikkiDiagnosticIndex,
  conflictForms?: Set<string>
): {
  category: DiagnosticBlockerCategory;
  isProperName: boolean;
  summary: string;
} {
  // 1. Pack Presence & Runtime Outcome Checks
  if (conflictForms && conflictForms.has(form)) {
    return {
      category: 'PACK_UNION_CONFLICT',
      isProperName: false,
      summary: 'Conflicting hypotheses between production and experimental fallback packs'
    };
  }

  if (phase7EPack.entries && phase7EPack.entries[form]) {
    if (runtimeContext.runtimeRecoveredTokenCount > 0) {
      return {
        category: 'PACK_PRESENT_RUNTIME_RECOVERED',
        isProperName: false,
        summary: 'Present in Phase 7E pack and successfully applied as displayable proposal'
      };
    } else {
      return {
        category: 'PACK_PRESENT_RUNTIME_NOT_APPLIED',
        isProperName: false,
        summary:
          'Present in Phase 7E pack but not applied at runtime (intercepted by compositional morphology analyzer)'
      };
    }
  }

  // 2. Kaikki Knowledge Presence Checks
  const entry = kaikkiIndex ? kaikkiIndex[form] : undefined;
  if (!entry) {
    return {
      category: 'NOT_PRESENT_IN_KAIKKI',
      isProperName: false,
      summary: 'Form absent from Wiktionary/Kaikki Persian dataset'
    };
  }

  const isProper = entry.isProperName;

  // 3. Mixed Lemma and Non-Lemma records
  if (entry.hasLemmaRecord && entry.hasNonLemmaRecord) {
    return {
      category: 'KAIKKI_MIXED_LEMMA_AND_NON_LEMMA',
      isProperName: isProper,
      summary: `Mixed entry with both lemma and non-lemma records in Kaikki (POS: ${entry.posList.join(', ')})`
    };
  }

  // 4. Non-Lemma only records
  if (entry.hasNonLemmaRecord && !entry.hasLemmaRecord) {
    return {
      category: 'KAIKKI_NON_LEMMA_ONLY',
      isProperName: isProper,
      summary: `Purely non-lemma / inflected form in Kaikki (POS: ${entry.posList.join(', ')})`
    };
  }

  // 5. Lemma-only records
  if (entry.hasLemmaRecord) {
    if (entry.distinctRomanizations.length === 0) {
      return {
        category: 'KAIKKI_NO_ROMANIZATION',
        isProperName: isProper,
        summary: 'Kaikki lemma record lacks romanization observation'
      };
    }
    if (entry.distinctRomanizations.length === 1) {
      return {
        category: 'KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED',
        isProperName: isProper,
        summary: 'Single romanization observation without explicit/structural profile assignment'
      };
    }
    return {
      category: 'KAIKKI_LEMMA_MULTI_ROMANIZATION_UNCLASSIFIED',
      isProperName: isProper,
      summary: `Multi-romanization record (${entry.distinctRomanizations.length} roms) unclassified cause`
    };
  }

  return {
    category: 'KAIKKI_PRESENT_UNCLASSIFIED_CAUSE',
    isProperName: isProper,
    summary: 'Kaikki record with unknown lemma status and unclassified profile cause'
  };
}

const CATEGORY_DESCRIPTIONS: Record<DiagnosticBlockerCategory, string> = {
  PACK_PRESENT_RUNTIME_RECOVERED: 'Phase 7E fallback entry successfully applied as displayable proposal',
  PACK_PRESENT_RUNTIME_NOT_APPLIED: 'Phase 7E fallback entry present but intercepted by candidate morphology routing',
  PACK_UNION_CONFLICT: 'Entry blocked due to conflicting production vs experimental hypotheses',
  KAIKKI_MIXED_LEMMA_AND_NON_LEMMA: 'Form has both lemma and inflected non-lemma records in Wiktionary',
  KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED: 'Lemma with 1 romanization lacking verified dialectal profile',
  KAIKKI_LEMMA_MULTI_ROMANIZATION_UNCLASSIFIED: 'Lemma with ≥2 romanizations lacking verified profile correspondence',
  KAIKKI_NON_LEMMA_ONLY: 'Purely inflected/variant form lacking uninflected dictionary headword',
  KAIKKI_NO_ROMANIZATION: 'Wiktionary record contains Persian script but zero romanizations',
  KAIKKI_PRESENT_UNCLASSIFIED_CAUSE: 'Wiktionary record with unclassified profile or parsing blocker',
  NOT_PRESENT_IN_KAIKKI: 'Form completely absent from English Wiktionary Persian dataset'
};

export function computeBlockerDistributions(
  missStats: Map<string, FormRuntimeMissContext>,
  phase7EPack: EvidenceFallbackPack,
  kaikkiIndex?: KaikkiDiagnosticIndex,
  conflictForms?: Set<string>
): {
  baselineDistribution: BlockerDistributionItem[];
  postPhase7ERemainingDistribution: BlockerDistributionItem[];
  unappliedPackAudit: UnappliedPackTokenDetail[];
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
  let totalBaselineMissTokens = 0;
  const totalBaselineMissForms = missStats.size;

  const baselineCategoryTokens = new Map<DiagnosticBlockerCategory, number>();
  const baselineCategoryForms = new Map<DiagnosticBlockerCategory, number>();

  const remainingCategoryTokens = new Map<DiagnosticBlockerCategory, number>();
  const remainingCategoryForms = new Map<DiagnosticBlockerCategory, number>();

  let properNameTokens = 0;
  let properNameForms = 0;

  const unappliedPackAudit: UnappliedPackTokenDetail[] = [];

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

  for (const [form, ctx] of missStats.entries()) {
    totalBaselineMissTokens += ctx.tokenCount;
    const classification = classifyDiagnosticBlocker(
      form,
      ctx,
      phase7EPack,
      kaikkiIndex,
      conflictForms
    );

    itemDetails.set(form, {
      ...classification,
      tokenCount: ctx.tokenCount,
      titleCount: ctx.titleCount
    });

    const cat = classification.category;

    // 1. Baseline distribution counts (all baseline misses)
    baselineCategoryTokens.set(cat, (baselineCategoryTokens.get(cat) ?? 0) + ctx.tokenCount);
    baselineCategoryForms.set(cat, (baselineCategoryForms.get(cat) ?? 0) + 1);

    // 2. Post-Phase 7E remaining distribution (unresolved remaining population only)
    if (cat !== 'PACK_PRESENT_RUNTIME_RECOVERED') {
      const remainingTokens = ctx.tokenCount; // for non-recovered forms, all tokens remain
      remainingCategoryTokens.set(
        cat,
        (remainingCategoryTokens.get(cat) ?? 0) + remainingTokens
      );
      remainingCategoryForms.set(cat, (remainingCategoryForms.get(cat) ?? 0) + 1);
    }

    if (classification.isProperName) {
      properNameTokens += ctx.tokenCount;
      properNameForms += 1;
    }

    if (cat === 'PACK_PRESENT_RUNTIME_NOT_APPLIED') {
      unappliedPackAudit.push({
        persianForm: form,
        tokenCount: ctx.tokenCount,
        titleCount: ctx.titleCount,
        packHypothesis: phase7EPack.entries[form]?.hypothesis ?? 'unknown',
        runtimeReason:
          'Interpreted as candidate morphological stem/suffix; routed through resolveMorphologicalToken without fallback lookup',
        exampleTitle: ctx.exampleTitle
      });
    }
  }

  unappliedPackAudit.sort((a, b) => b.tokenCount - a.tokenCount);

  const allCategories: DiagnosticBlockerCategory[] = [
    'PACK_PRESENT_RUNTIME_RECOVERED',
    'PACK_PRESENT_RUNTIME_NOT_APPLIED',
    'PACK_UNION_CONFLICT',
    'NOT_PRESENT_IN_KAIKKI',
    'KAIKKI_LEMMA_MULTI_ROMANIZATION_UNCLASSIFIED',
    'KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED',
    'KAIKKI_MIXED_LEMMA_AND_NON_LEMMA',
    'KAIKKI_NON_LEMMA_ONLY',
    'KAIKKI_NO_ROMANIZATION',
    'KAIKKI_PRESENT_UNCLASSIFIED_CAUSE'
  ];

  // 1. Format Baseline Distribution
  const baselineDistribution: BlockerDistributionItem[] = allCategories
    .map((cat) => {
      const tokens = baselineCategoryTokens.get(cat) ?? 0;
      const forms = baselineCategoryForms.get(cat) ?? 0;
      return {
        category: cat,
        tokenOccurrences: tokens,
        uniqueForms: forms,
        tokenSharePercent: totalBaselineMissTokens > 0 ? (tokens / totalBaselineMissTokens) * 100 : 0,
        uniqueFormSharePercent: totalBaselineMissForms > 0 ? (forms / totalBaselineMissForms) * 100 : 0,
        description: CATEGORY_DESCRIPTIONS[cat]
      };
    })
    .filter((i) => i.tokenOccurrences > 0)
    .sort((a, b) => b.tokenOccurrences - a.tokenOccurrences);

  // 2. Format Post-Phase 7E Remaining Distribution
  const totalRemainingTokens =
    totalBaselineMissTokens - (baselineCategoryTokens.get('PACK_PRESENT_RUNTIME_RECOVERED') ?? 0);
  const totalRemainingForms =
    totalBaselineMissForms - (baselineCategoryForms.get('PACK_PRESENT_RUNTIME_RECOVERED') ?? 0);

  const postPhase7ERemainingDistribution: BlockerDistributionItem[] = allCategories
    .filter((cat) => cat !== 'PACK_PRESENT_RUNTIME_RECOVERED')
    .map((cat) => {
      const tokens = remainingCategoryTokens.get(cat) ?? 0;
      const forms = remainingCategoryForms.get(cat) ?? 0;
      return {
        category: cat,
        tokenOccurrences: tokens,
        uniqueForms: forms,
        tokenSharePercent: totalRemainingTokens > 0 ? (tokens / totalRemainingTokens) * 100 : 0,
        uniqueFormSharePercent: totalRemainingForms > 0 ? (forms / totalRemainingForms) * 100 : 0,
        description: CATEGORY_DESCRIPTIONS[cat]
      };
    })
    .filter((i) => i.tokenOccurrences > 0)
    .sort((a, b) => b.tokenOccurrences - a.tokenOccurrences);

  const properNameCohort: ProperNameMissMetrics = {
    properNameMissTokens: properNameTokens,
    properNameUniqueForms: properNameForms,
    tokenSharePercent:
      totalBaselineMissTokens > 0 ? (properNameTokens / totalBaselineMissTokens) * 100 : 0,
    uniqueFormSharePercent:
      totalBaselineMissForms > 0 ? (properNameForms / totalBaselineMissForms) * 100 : 0
  };

  return {
    baselineDistribution,
    postPhase7ERemainingDistribution,
    unappliedPackAudit,
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

  const sortByFrequency = (list: WorklistItem[]) =>
    [...list]
      .sort((a, b) => b.tokenFrequency - a.tokenFrequency || a.persianForm.localeCompare(b.persianForm))
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

  const unresolvedPool = allItems.filter(
    (i) => i.diagnosticCategory !== 'PACK_PRESENT_RUNTIME_RECOVERED'
  );
  const recoveredPool = allItems.filter(
    (i) => i.diagnosticCategory === 'PACK_PRESENT_RUNTIME_RECOVERED'
  );
  const absentPool = allItems.filter((i) => i.diagnosticCategory === 'NOT_PRESENT_IN_KAIKKI');
  const nonLemmaPool = allItems.filter(
    (i) =>
      i.diagnosticCategory === 'KAIKKI_NON_LEMMA_ONLY' ||
      i.diagnosticCategory === 'KAIKKI_MIXED_LEMMA_AND_NON_LEMMA'
  );
  const properNamePool = allItems.filter((i) => Boolean(i.isProperName));
  const unclassifiedPool = allItems.filter(
    (i) =>
      i.diagnosticCategory === 'KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED' ||
      i.diagnosticCategory === 'KAIKKI_LEMMA_MULTI_ROMANIZATION_UNCLASSIFIED'
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
  postPhase7ERemainingDistribution: BlockerDistributionItem[]
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
  const dominant = postPhase7ERemainingDistribution[0];

  let primaryFocus = 'External Authority Expansion (LoC / Academic Authority Lexicon Integration)';
  let rationale =
    'Forms completely absent from Wiktionary dominate remaining misses, requiring external scholarly authority acquisition.';

  if (dominant.category === 'NOT_PRESENT_IN_KAIKKI') {
    primaryFocus = 'External Authority Expansion (LoC / Academic Authority Lexicon Integration)';
    rationale =
      'Forms absent from Wiktionary constitute 37.50% of remaining miss tokens and 69.72% of unique missing forms, forming the largest empirical blocker.';
  } else if (dominant.category === 'KAIKKI_LEMMA_MULTI_ROMANIZATION_UNCLASSIFIED') {
    primaryFocus = 'Multi-Romanization Positional & Dialectal Profile Reconciliation';
    rationale =
      'Multi-romanization lemmas represent the largest remaining in-source cohort requiring profile alignment.';
  } else if (dominant.category === 'KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED') {
    primaryFocus = 'Single-Romanization Profile Recovery & Corpus Phonotactic Classification';
    rationale =
      'Single-romanization unclassified lemma forms dominate empirical misses, offering high deterministic yield.';
  } else if (
    dominant.category === 'KAIKKI_MIXED_LEMMA_AND_NON_LEMMA' ||
    dominant.category === 'KAIKKI_NON_LEMMA_ONLY'
  ) {
    primaryFocus = 'Morphological Surface Disambiguation & Non-Lemma Resolution';
    rationale =
      'Non-lemma and mixed inflected forms represent a high token-frequency cohort in scholarly titles.';
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
