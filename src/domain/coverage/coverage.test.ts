import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LEXICON_REPOSITORY } from '../../data/lexicon';
import { evaluateTitleEligibility } from './openalex/eligibility';
import {
  computeCorpusSha256,
  computeSelectionHash,
  selectAndSplitCorpus,
  type CandidatePoolItem
} from './openalex/selection';
import { buildEvaluationFallbackUnion } from './fallbackUnion';
import { evaluateCoverageCorpus, EVALUATOR_VERSION } from './evaluator';
import {
  analyzeSurfaceMorphology,
  classifyDiagnosticBlocker,
  computeBlockerDistributions,
  DIAGNOSTIC_INDEX_VERSION,
  generateWorklistsAndAuditSamples,
  type FormRuntimeMissContext,
  type KaikkiDiagnosticIndex
} from './diagnostics';
import { loadPrivateCorpus } from './privateAdapter';
import { computePackSemanticSha256, runCoverageEvaluation } from './cli';
import type { CoverageCorpusCase } from './types';
import type { EvidenceFallbackPack } from '../evidence/kaikki/fallback/types';

describe('Phase 7F: Real Scholarly Persian Coverage Corpus & Evaluation', () => {
  describe('1. Persian-Script Title Eligibility Filter', () => {
    it('accepts valid Persian scholarly titles without requiring specific Persian letters', () => {
      // "بررسی نقش فرهنگ در توسعه" has only shared Arabic-script letters
      const result = evaluateTitleEligibility('بررسی نقش فرهنگ در توسعه', 'fa');
      expect(result.eligible).toBe(true);
      expect(result.persianTokenCount).toBe(5);
      expect(result.arabicLetterCount).toBeGreaterThan(15);
    });

    it('rejects empty or whitespace titles', () => {
      expect(evaluateTitleEligibility('', 'fa').eligible).toBe(false);
      expect(evaluateTitleEligibility('', 'fa').rejectionReason).toBe('EMPTY_TITLE');
      expect(evaluateTitleEligibility('   ', 'fa').eligible).toBe(false);
      expect(evaluateTitleEligibility(null, 'fa').eligible).toBe(false);
    });

    it('rejects non-Persian language metadata', () => {
      const res = evaluateTitleEligibility('بررسی نقش فرهنگ', 'en');
      expect(res.eligible).toBe(false);
      expect(res.rejectionReason).toBe('NOT_LANGUAGE_FA');
    });

    it('rejects primary Latin-script metadata titles', () => {
      const res = evaluateTitleEligibility('Theory of Thermal Stresses', 'fa');
      expect(res.eligible).toBe(false);
      expect(res.rejectionReason).toBe('ONLY_PUNCTUATION_OR_NUMBERS');

      const resMixed = evaluateTitleEligibility('Introduction to Iran بررسی', 'fa');
      expect(resMixed.eligible).toBe(false);
      expect(resMixed.rejectionReason).toBe('PRIMARY_LATIN_METADATA');
    });

    it('rejects titles with fewer than 2 Persian lexical tokens', () => {
      const res = evaluateTitleEligibility('ایران', 'fa');
      expect(res.eligible).toBe(false);
      expect(res.rejectionReason).toBe('FEWER_THAN_TWO_PERSIAN_TOKENS');
    });

    it('rejects titles that are only punctuation or numbers', () => {
      const res = evaluateTitleEligibility('1234 - 5678', 'fa');
      expect(res.eligible).toBe(false);
      expect(res.rejectionReason).toBe('ONLY_PUNCTUATION_OR_NUMBERS');
    });

    it('rejects duplicate normalized titles', () => {
      const seen = new Set<string>();
      const res1 = evaluateTitleEligibility('تاریخ بیهقی', 'fa', seen);
      expect(res1.eligible).toBe(true);
      seen.add(res1.normalizedTitle);

      const res2 = evaluateTitleEligibility('تاريخ بيهقي', 'fa', seen); // arabic yeh/kaf normalizes to same
      expect(res2.eligible).toBe(false);
      expect(res2.rejectionReason).toBe('DUPLICATE_NORMALIZED_TITLE');
    });
  });

  describe('2. Architectural Dependency Boundary (Holdout Invariant)', () => {
    it('ensures acquisition/selection modules do NOT import engine, lexicon, or fallback repositories', () => {
      const openalexDir = path.resolve(__dirname, 'openalex');
      const files = fs.readdirSync(openalexDir).filter((f) => f.endsWith('.ts'));

      const forbiddenPatterns = [
        /from\s+['"].*engine['"]/,
        /from\s+['"].*lexicon['"]/,
        /from\s+['"].*fallback['"]/,
        /from\s+['"].*candidate['"]/
      ];

      for (const file of files) {
        const fullPath = path.join(openalexDir, file);
        const content = fs.readFileSync(fullPath, 'utf8');

        for (const pattern of forbiddenPatterns) {
          expect(
            pattern.test(content),
            `Forbidden dependency in ${file}: matches ${pattern}`
          ).toBe(false);
        }
      }
    });
  });

  describe('3. Deterministic Selection & Split', () => {
    const mockPool: CandidatePoolItem[] = [
      {
        openAlexId: 'W001',
        rawTitle: 'عنوان اول',
        normalizedTitle: 'عنوان اول',
        language: 'fa',
        workType: 'article',
        selectionHash: computeSelectionHash('W001')
      },
      {
        openAlexId: 'W002',
        rawTitle: 'عنوان دوم',
        normalizedTitle: 'عنوان دوم',
        language: 'fa',
        workType: 'book',
        selectionHash: computeSelectionHash('W002')
      },
      {
        openAlexId: 'W003',
        rawTitle: 'عنوان سوم',
        normalizedTitle: 'عنوان سوم',
        language: 'fa',
        workType: 'article',
        selectionHash: computeSelectionHash('W003')
      },
      {
        openAlexId: 'W004',
        rawTitle: 'عنوان چهارم',
        normalizedTitle: 'عنوان چهارم',
        language: 'fa',
        workType: 'dissertation',
        selectionHash: computeSelectionHash('W004')
      },
      {
        openAlexId: 'W005',
        rawTitle: 'عنوان پنجم',
        normalizedTitle: 'عنوان پنجم',
        language: 'fa',
        workType: 'book',
        selectionHash: computeSelectionHash('W005')
      }
    ];

    it('selects and splits pool deterministically across runs', () => {
      const run1 = selectAndSplitCorpus(mockPool, 4, 0.75);
      const run2 = selectAndSplitCorpus(mockPool, 4, 0.75);

      expect(run1.selectedCases.length).toBe(4);
      expect(run1.diagnosticCases.length).toBe(3);
      expect(run1.holdoutCases.length).toBe(1);

      expect(run1.corpusSha256).toBe(run2.corpusSha256);
      expect(run1.holdoutSha256).toBe(run2.holdoutSha256);
      expect(run1.selectedCases.map((c) => c.id)).toEqual(
        run2.selectedCases.map((c) => c.id)
      );
    });

    it('computes distinct hashes when title or metadata changes', () => {
      const run = selectAndSplitCorpus(mockPool, 4, 0.75);
      const mutatedCases = run.selectedCases.map((c, idx) =>
        idx === 0 ? { ...c, rawText: 'عنوان تغییر یافته' } : c
      );

      const mutatedHash = computeCorpusSha256(mutatedCases);
      expect(mutatedHash).not.toBe(run.corpusSha256);
    });
  });

  describe('4. Safe Fallback Union & Conflict Resolution', () => {
    const dummyProdPack: EvidenceFallbackPack = {
      manifest: {
        packVersion: '1.0.0',
        generatedAt: '2026-01-01T00:00:00Z',
        inputSha256: 'sha1',
        extractorVersion: '1.0.0',
        interpreterVersion: '1.0.0',
        ruleSetVersion: '1.0.0',
        aggregatorVersion: '1.0.0',
        entryCount: 2
      },
      entries: {
        گفتار: {
          id: 'fb-1',
          normalizedForm: 'گفتار',
          hypothesis: 'guftār',
          consensusStatus: 'UNANIMOUS_DETERMINISTIC',
          confidenceTier: 'CROSS_PROFILE_CONSENSUS',
          candidateAnalysisId: 'can-1',
          evidenceCount: 2,
          sourceProfiles: ['CLASSICAL_DARI', 'IRANIAN'],
          interpretations: [
            { evidenceId: 'e1', romanization: 'guftār', profile: 'CLASSICAL_DARI' },
            { evidenceId: 'e2', romanization: 'goftâr', profile: 'IRANIAN' }
          ],
          generatedFrom: {
            acquisitionVersion: '1.0.0',
            interpreterVersion: '1.0.0',
            ruleSetVersion: '1.0.0',
            aggregatorVersion: '1.0.0'
          }
        },
        تعارض: {
          id: 'fb-2',
          normalizedForm: 'تعارض',
          hypothesis: 'taʿāruż',
          consensusStatus: 'UNANIMOUS_DETERMINISTIC',
          confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
          candidateAnalysisId: 'can-2',
          evidenceCount: 1,
          sourceProfiles: ['IRANIAN'],
          interpretations: [
            { evidenceId: 'e3', romanization: 'taʿāroz', profile: 'IRANIAN' }
          ],
          generatedFrom: {
            acquisitionVersion: '1.0.0',
            interpreterVersion: '1.0.0',
            ruleSetVersion: '1.0.0',
            aggregatorVersion: '1.0.0'
          }
        }
      }
    };

    const dummyExpPack: EvidenceFallbackPack = {
      manifest: {
        packVersion: '7e-recovered',
        generatedAt: '2026-01-01T00:00:00Z',
        inputSha256: 'sha2',
        extractorVersion: '1.0.0',
        interpreterVersion: '1.0.0',
        ruleSetVersion: '1.0.0',
        aggregatorVersion: '1.0.0',
        entryCount: 3
      },
      entries: {
        گفتار: {
          id: 'fb-1-exp',
          normalizedForm: 'گفتار',
          hypothesis: 'guftār', // Identical -> deduplicate
          consensusStatus: 'UNANIMOUS_DETERMINISTIC',
          confidenceTier: 'CROSS_PROFILE_CONSENSUS',
          candidateAnalysisId: 'can-1',
          evidenceCount: 2,
          sourceProfiles: ['CLASSICAL_DARI', 'IRANIAN'],
          interpretations: [
            { evidenceId: 'e1', romanization: 'guftār', profile: 'CLASSICAL_DARI' },
            { evidenceId: 'e2', romanization: 'goftâr', profile: 'IRANIAN' }
          ],
          generatedFrom: {
            acquisitionVersion: '1.0.0',
            interpreterVersion: '1.0.0',
            ruleSetVersion: '1.0.0',
            aggregatorVersion: '1.0.0'
          }
        },
        تعارض: {
          id: 'fb-2-exp',
          normalizedForm: 'تعارض',
          hypothesis: 'taʿāriz', // Conflicting -> block and record conflict
          consensusStatus: 'UNANIMOUS_DETERMINISTIC',
          confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
          candidateAnalysisId: 'can-2',
          evidenceCount: 1,
          sourceProfiles: ['IRANIAN'],
          interpretations: [
            { evidenceId: 'e4', romanization: 'taʿāriz', profile: 'IRANIAN' }
          ],
          generatedFrom: {
            acquisitionVersion: '1.0.0',
            interpreterVersion: '1.0.0',
            ruleSetVersion: '1.0.0',
            aggregatorVersion: '1.0.0'
          }
        },
        دانشگاه: {
          id: 'fb-3-exp',
          normalizedForm: 'دانشگاه',
          hypothesis: 'dānishgāh',
          consensusStatus: 'UNANIMOUS_DETERMINISTIC',
          confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
          candidateAnalysisId: 'can-3',
          evidenceCount: 1,
          sourceProfiles: ['IRANIAN'],
          interpretations: [
            { evidenceId: 'e5', romanization: 'dāneshgāh', profile: 'IRANIAN' }
          ],
          generatedFrom: {
            acquisitionVersion: '1.0.0',
            interpreterVersion: '1.0.0',
            ruleSetVersion: '1.0.0',
            aggregatorVersion: '1.0.0'
          }
        }
      }
    };

    it('deduplicates identical entries and blocks conflicting entries with EVALUATION_FALLBACK_CONFLICT', () => {
      const unionResult = buildEvaluationFallbackUnion(dummyProdPack, dummyExpPack);

      expect(unionResult.deduplicatedCount).toBe(1);
      expect(unionResult.conflicts.length).toBe(1);
      expect(unionResult.conflicts[0].normalizedForm).toBe('تعارض');
      expect(unionResult.conflicts[0].reason).toBe('EVALUATION_FALLBACK_CONFLICT');

      // The conflict should NOT be in the merged repository
      expect(unionResult.pack.entries['تعارض']).toBeUndefined();
      expect(unionResult.repository.findByNormalized('تعارض')).toBeUndefined();

      // Non-conflicting entries should be present
      expect(unionResult.pack.entries['گفتار']).toBeDefined();
      expect(unionResult.pack.entries['دانشگاه']).toBeDefined();
      expect(unionResult.totalEntries).toBe(2);
    });
  });

  describe('5. Evaluator Metrics & Recovery Calculations', () => {
    const testCases: CoverageCorpusCase[] = [
      {
        id: 'c1',
        source: 'OPENALEX',
        sourceId: 'W1',
        rawText: 'تاریخ و تمدن',
        normalizedText: 'تاریخ و تمدن',
        kind: 'TITLE',
        metadata: { workType: 'book', publicationYear: 2020 },
        split: 'DIAGNOSTIC'
      },
      {
        id: 'c2',
        source: 'OPENALEX',
        sourceId: 'W2',
        rawText: 'گفتار در شیراز',
        normalizedText: 'گفتار در شیراز',
        kind: 'TITLE',
        metadata: { workType: 'article', publicationYear: 2021 },
        split: 'LOCKED_HOLDOUT'
      }
    ];

    it('excludes non-Persian tokens from coverage denominator', () => {
      const customCase: CoverageCorpusCase[] = [
        {
          id: 'c-mixed',
          source: 'LOCAL',
          sourceId: 'loc-1',
          rawText: 'تاریخ ایران (Vol. 2, 2020)',
          normalizedText: 'تاریخ ایران (Vol. 2, 2020)',
          kind: 'TITLE',
          metadata: { workType: 'book' },
          split: 'DIAGNOSTIC'
        }
      ];

      const res = evaluateCoverageCorpus(customCase);
      // Denominator should be exactly 2 tokens ("تاریخ", "ایران"), ignoring "(", "Vol.", "2,", "2020)"
      expect(res.totalPersianTokens).toBe(2);
      expect(res.configurations.CURRENT_PRODUCTION.totalPersianTokens).toBe(2);
    });

    it('computes display coverage and lexical miss recovery correctly', () => {
      const res = evaluateCoverageCorpus(testCases);

      expect(res.totalCases).toBe(2);
      expect(res.totalPersianTokens).toBe(6);
      expect(res.configurations.CURRENT_PRODUCTION.displayTokenCoverage).toBeGreaterThan(0);
      expect(res.configurations.CURRENT_PRODUCTION.fullyDisplayableTitleRate).toBeGreaterThan(0);
    });
  });

  describe('6. Hardened Diagnostic Blocker & Mixed Lemma/Non-Lemma Attribution', () => {
    const dummyPack: EvidenceFallbackPack = {
      manifest: {
        packVersion: '7e',
        generatedAt: '',
        inputSha256: '',
        extractorVersion: '1.0.0',
        interpreterVersion: '1.0.0',
        ruleSetVersion: '1.0.0',
        aggregatorVersion: '1.0.0',
        entryCount: 2
      },
      entries: {
        جهاد: {
          id: 'fb-jihad',
          normalizedForm: 'جهاد',
          hypothesis: 'jihād',
          consensusStatus: 'UNANIMOUS_DETERMINISTIC',
          confidenceTier: 'CROSS_PROFILE_CONSENSUS',
          candidateAnalysisId: 'can',
          evidenceCount: 2,
          sourceProfiles: ['CLASSICAL_DARI', 'IRANIAN'],
          interpretations: [],
          generatedFrom: {
            acquisitionVersion: '1.0.0',
            interpreterVersion: '1.0.0',
            ruleSetVersion: '1.0.0',
            aggregatorVersion: '1.0.0'
          }
        },
        تغییرات: {
          id: 'fb-taghyirat',
          normalizedForm: 'تغییرات',
          hypothesis: 'taghyīrāt',
          consensusStatus: 'UNANIMOUS_DETERMINISTIC',
          confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
          candidateAnalysisId: 'can-t',
          evidenceCount: 1,
          sourceProfiles: ['IRANIAN'],
          interpretations: [],
          generatedFrom: {
            acquisitionVersion: '1.0.0',
            interpreterVersion: '1.0.0',
            ruleSetVersion: '1.0.0',
            aggregatorVersion: '1.0.0'
          }
        }
      }
    };

    const mockKaikkiIndex: KaikkiDiagnosticIndex = {
      کتابها: {
        normalizedForm: 'کتابها',
        sourceRecordCount: 1,
        hasLemmaRecord: false,
        hasNonLemmaRecord: true,
        hasUnknownLemmaStatus: false,
        lemmaRomanizationCount: 0,
        nonLemmaRomanizationCount: 1,
        distinctRomanizations: ['ketâbhâ'],
        posList: ['noun'],
        isProperName: false
      },
      تهران: {
        normalizedForm: 'تهران',
        sourceRecordCount: 1,
        hasLemmaRecord: true,
        hasNonLemmaRecord: false,
        hasUnknownLemmaStatus: false,
        lemmaRomanizationCount: 1,
        nonLemmaRomanizationCount: 0,
        distinctRomanizations: ['tehrân'],
        posList: ['name'],
        isProperName: true
      },
      بر: {
        // High frequency word with multiple records: lemma (prep) + non-lemma (verb form)
        normalizedForm: 'بر',
        sourceRecordCount: 3,
        hasLemmaRecord: true,
        hasNonLemmaRecord: true,
        hasUnknownLemmaStatus: false,
        lemmaRomanizationCount: 1,
        nonLemmaRomanizationCount: 2,
        distinctRomanizations: ['bar', 'bor'],
        posList: ['prep', 'verb'],
        isProperName: false
      },
      با: {
        // High frequency preposition: lemma only
        normalizedForm: 'با',
        sourceRecordCount: 1,
        hasLemmaRecord: true,
        hasNonLemmaRecord: false,
        hasUnknownLemmaStatus: false,
        lemmaRomanizationCount: 1,
        nonLemmaRomanizationCount: 0,
        distinctRomanizations: ['bā'],
        posList: ['prep'],
        isProperName: false
      },
      واژه_تک_روم: {
        normalizedForm: 'واژه_تک_روم',
        sourceRecordCount: 1,
        hasLemmaRecord: true,
        hasNonLemmaRecord: false,
        hasUnknownLemmaStatus: false,
        lemmaRomanizationCount: 1,
        nonLemmaRomanizationCount: 0,
        distinctRomanizations: ['single-rom'],
        posList: ['noun'],
        isProperName: false
      },
      واژه_چند_روم: {
        normalizedForm: 'واژه_چند_روم',
        sourceRecordCount: 2,
        hasLemmaRecord: true,
        hasNonLemmaRecord: false,
        hasUnknownLemmaStatus: false,
        lemmaRomanizationCount: 3,
        nonLemmaRomanizationCount: 0,
        distinctRomanizations: ['rom1', 'rom2', 'rom3'],
        posList: ['noun'],
        isProperName: false
      }
    };

    it('distinguishes PACK_PRESENT_RUNTIME_RECOVERED from PACK_PRESENT_RUNTIME_NOT_APPLIED', () => {
      // 1. Recovered at runtime
      const ctxRecovered: FormRuntimeMissContext = {
        tokenCount: 10,
        titleCount: 8,
        runtimeRecoveredTokenCount: 10,
        runtimeNotAppliedTokenCount: 0,
        exampleTitle: 'جهاد علمی'
      };
      const resRecovered = classifyDiagnosticBlocker('جهاد', ctxRecovered, dummyPack, mockKaikkiIndex);
      expect(resRecovered.category).toBe('PACK_PRESENT_RUNTIME_RECOVERED');

      // 2. Present in pack but intercepted/not applied at runtime
      const ctxNotApplied: FormRuntimeMissContext = {
        tokenCount: 5,
        titleCount: 4,
        runtimeRecoveredTokenCount: 0,
        runtimeNotAppliedTokenCount: 5,
        exampleTitle: 'بررسی تغییرات اقلیمی'
      };
      const resNotApplied = classifyDiagnosticBlocker('تغییرات', ctxNotApplied, dummyPack, mockKaikkiIndex);
      expect(resNotApplied.category).toBe('PACK_PRESENT_RUNTIME_NOT_APPLIED');
    });

    it('identifies mixed lemma + non-lemma forms accurately (including high-frequency words)', () => {
      const ctx: FormRuntimeMissContext = {
        tokenCount: 12,
        titleCount: 10,
        runtimeRecoveredTokenCount: 0,
        runtimeNotAppliedTokenCount: 12,
        exampleTitle: 'مروری بر تاریخ'
      };

      // "بر" has both lemma and non-lemma records in Kaikki -> MIXED
      const resBar = classifyDiagnosticBlocker('بر', ctx, dummyPack, mockKaikkiIndex);
      expect(resBar.category).toBe('KAIKKI_MIXED_LEMMA_AND_NON_LEMMA');

      // "با" has only lemma records -> SINGLE ROMANIZATION
      const resBa = classifyDiagnosticBlocker('با', ctx, dummyPack, mockKaikkiIndex);
      expect(resBa.category).toBe('KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED');
    });

    it('classifies non-lemma-only vs unclassified lemma records', () => {
      const dummyCtx: FormRuntimeMissContext = {
        tokenCount: 2,
        titleCount: 2,
        runtimeRecoveredTokenCount: 0,
        runtimeNotAppliedTokenCount: 2,
        exampleTitle: 'کتابها در ایران'
      };

      // Non-lemma only
      expect(
        classifyDiagnosticBlocker('کتابها', dummyCtx, dummyPack, mockKaikkiIndex).category
      ).toBe('KAIKKI_NON_LEMMA_ONLY');

      // Multi-romanization lemma
      expect(
        classifyDiagnosticBlocker('واژه_چند_روم', dummyCtx, dummyPack, mockKaikkiIndex).category
      ).toBe('KAIKKI_LEMMA_MULTI_ROMANIZATION_UNCLASSIFIED');

      // Not present in Kaikki
      expect(
        classifyDiagnosticBlocker('غایب_کامل', dummyCtx, dummyPack, mockKaikkiIndex).category
      ).toBe('NOT_PRESENT_IN_KAIKKI');
    });

    it('conserves token and form totals in dual distribution calculations', () => {
      const missStats = new Map<string, FormRuntimeMissContext>();
      missStats.set('جهاد', {
        tokenCount: 10,
        titleCount: 8,
        runtimeRecoveredTokenCount: 10,
        runtimeNotAppliedTokenCount: 0,
        exampleTitle: 'جهاد علمی'
      });
      missStats.set('تغییرات', {
        tokenCount: 5,
        titleCount: 4,
        runtimeRecoveredTokenCount: 0,
        runtimeNotAppliedTokenCount: 5,
        exampleTitle: 'تغییرات اقلیمی'
      });
      missStats.set('بر', {
        tokenCount: 20,
        titleCount: 15,
        runtimeRecoveredTokenCount: 0,
        runtimeNotAppliedTokenCount: 20,
        exampleTitle: 'مروری بر تاریخ'
      });
      missStats.set('غایب_کامل', {
        tokenCount: 7,
        titleCount: 5,
        runtimeRecoveredTokenCount: 0,
        runtimeNotAppliedTokenCount: 7,
        exampleTitle: 'یک عنوان'
      });

      const {
        baselineDistribution,
        postPhase7ERemainingDistribution,
        unappliedPackAudit
      } = computeBlockerDistributions(missStats, dummyPack, mockKaikkiIndex);

      // Baseline total: 10 + 5 + 20 + 7 = 42 tokens, 4 forms
      const totalBaselineTokens = baselineDistribution.reduce((acc, i) => acc + i.tokenOccurrences, 0);
      const totalBaselineForms = baselineDistribution.reduce((acc, i) => acc + i.uniqueForms, 0);
      expect(totalBaselineTokens).toBe(42);
      expect(totalBaselineForms).toBe(4);

      // Remaining total (minus 10 recovered tokens for 'جهاد'): 32 tokens, 3 forms
      const totalRemainingTokens = postPhase7ERemainingDistribution.reduce(
        (acc, i) => acc + i.tokenOccurrences,
        0
      );
      const totalRemainingForms = postPhase7ERemainingDistribution.reduce(
        (acc, i) => acc + i.uniqueForms,
        0
      );
      expect(totalRemainingTokens).toBe(32);
      expect(totalRemainingForms).toBe(3);

      // Unapplied audit has 1 entry ('تغییرات')
      expect(unappliedPackAudit.length).toBe(1);
      expect(unappliedPackAudit[0].persianForm).toBe('تغییرات');
    });

    it('conserves token counts when a single form has mixed runtime outcomes (some tokens recovered, some intercepted)', () => {
      const missStats = new Map<string, FormRuntimeMissContext>();
      // "استان" in pack: 10 tokens total, 6 recovered at runtime, 4 intercepted by morphology
      missStats.set('استان', {
        tokenCount: 10,
        titleCount: 8,
        runtimeRecoveredTokenCount: 6,
        runtimeNotAppliedTokenCount: 4,
        exampleTitle: 'استان البرز'
      });

      const packWithOstan: EvidenceFallbackPack = {
        ...dummyPack,
        entries: {
          ...dummyPack.entries,
          استان: {
            id: 'fb-ostan',
            normalizedForm: 'استان',
            hypothesis: 'ustān',
            consensusStatus: 'UNANIMOUS_DETERMINISTIC',
            confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
            candidateAnalysisId: 'can-o',
            evidenceCount: 1,
            sourceProfiles: ['IRANIAN'],
            interpretations: [],
            generatedFrom: {
              acquisitionVersion: '1.0.0',
              interpreterVersion: '1.0.0',
              ruleSetVersion: '1.0.0',
              aggregatorVersion: '1.0.0'
            }
          }
        }
      };

      const {
        baselineDistribution,
        postPhase7ERemainingDistribution,
        unappliedPackAudit
      } = computeBlockerDistributions(missStats, packWithOstan, mockKaikkiIndex);

      // Baseline: 6 tokens recovered + 4 tokens not applied = 10 tokens total
      const recoveredItem = baselineDistribution.find(
        (i) => i.category === 'PACK_PRESENT_RUNTIME_RECOVERED'
      );
      const notAppliedItem = baselineDistribution.find(
        (i) => i.category === 'PACK_PRESENT_RUNTIME_NOT_APPLIED'
      );

      expect(recoveredItem?.tokenOccurrences).toBe(6);
      expect(notAppliedItem?.tokenOccurrences).toBe(4);

      const totalBaselineTokens = baselineDistribution.reduce(
        (acc, i) => acc + i.tokenOccurrences,
        0
      );
      expect(totalBaselineTokens).toBe(10);

      // Post-Phase 7E remaining: only the 4 non-applied tokens remain
      const totalRemainingTokens = postPhase7ERemainingDistribution.reduce(
        (acc, i) => acc + i.tokenOccurrences,
        0
      );
      expect(totalRemainingTokens).toBe(4);

      // Unapplied audit records the 4 intercepted occurrences
      expect(unappliedPackAudit.length).toBe(1);
      expect(unappliedPackAudit[0].persianForm).toBe('استان');
      expect(unappliedPackAudit[0].tokenCount).toBe(4);
    });

    it('measures raw vs normalized ZWNJ separately', () => {
      const forms = ['کتاب\u200cها', 'تحقیقی'];
      const rawCases: CoverageCorpusCase[] = [
        {
          id: '1',
          source: 'OPENALEX',
          sourceId: 'W1',
          rawText: 'کتاب\u200cها در ایران',
          normalizedText: 'کتاب\u200cها در ایران',
          kind: 'TITLE',
          metadata: {},
          split: 'DIAGNOSTIC'
        },
        {
          id: '2',
          source: 'OPENALEX',
          sourceId: 'W2',
          rawText: 'داده های تجربی',
          normalizedText: 'داده های تجربی',
          kind: 'TITLE',
          metadata: {},
          split: 'DIAGNOSTIC'
        }
      ];

      const res = analyzeSurfaceMorphology(forms, rawCases);
      expect(res.rawZwnjCount).toBe(1);
      expect(res.normalizedZwnjCount).toBe(1);
      expect(res.surfaceSuffixHaCount).toBe(1);
    });

    it('generates deterministic worklists and audit samples', () => {
      const itemDetails = new Map<
        string,
        {
          category: any;
          isProperName: boolean;
          summary: string;
          tokenCount: number;
          titleCount: number;
        }
      >();

      itemDetails.set('جهاد', {
        category: 'PACK_PRESENT_RUNTIME_RECOVERED',
        isProperName: false,
        summary: 'sum',
        tokenCount: 10,
        titleCount: 8
      });
      itemDetails.set('تهران', {
        category: 'KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED',
        isProperName: true,
        summary: 'sum',
        tokenCount: 25,
        titleCount: 20
      });

      const res1 = generateWorklistsAndAuditSamples(itemDetails);
      const res2 = generateWorklistsAndAuditSamples(itemDetails);

      expect(res1.topUnresolvedWorklist).toEqual(res2.topUnresolvedWorklist);
      expect(res1.auditSamples).toEqual(res2.auditSamples);
    });
  });

  describe('7. Fail-Closed Dependency Gate Checks', () => {
    it('fails closed when production fallback pack is missing', async () => {
      await expect(
        runCoverageEvaluation({
          productionPackPath: 'non-existent/path.json'
        })
      ).rejects.toThrow('[FAIL CLOSED] Production fallback pack missing');
    });

    it('fails closed when Phase 7E experimental pack is missing in full evaluation mode', async () => {
      await expect(
        runCoverageEvaluation({
          phase7EPackPath: 'non-existent/phase7e.json'
        })
      ).rejects.toThrow('[FAIL CLOSED] Validated Phase 7E experimental pack missing');
    });

    it('fails closed when Kaikki diagnostic dataset is missing in full evaluation mode', async () => {
      const validDummyPack = path.resolve(
        process.cwd(),
        'src',
        'data',
        'generated',
        'kaikki-fallback.v1.json'
      );
      await expect(
        runCoverageEvaluation({
          phase7EPackPath: validDummyPack,
          kaikkiJsonlPath: 'non-existent/kaikki.jsonl'
        })
      ).rejects.toThrow('[FAIL CLOSED] Kaikki diagnostic source dataset missing');
    });

    it('fails closed when Kaikki diagnostic dataset SHA-256 mismatches expected reference', async () => {
      const validDummyPack = path.resolve(
        process.cwd(),
        'src',
        'data',
        'generated',
        'kaikki-fallback.v1.json'
      );
      const tempKaikkiPath = path.resolve(__dirname, 'temp-bad-kaikki.jsonl');
      fs.writeFileSync(tempKaikkiPath, '{"word": "تست"}\n', 'utf8');

      try {
        await expect(
          runCoverageEvaluation({
            phase7EPackPath: validDummyPack,
            kaikkiJsonlPath: tempKaikkiPath
          })
        ).rejects.toThrow(/\[FAIL CLOSED\] Kaikki source dataset SHA-256 .* does not match expected reference/);
      } finally {
        if (fs.existsSync(tempKaikkiPath)) {
          fs.unlinkSync(tempKaikkiPath);
        }
      }
    });

    it('isolates partial evaluation outputs and does not overwrite committed reports in --coverage-only mode', async () => {
      const validDummyPack = path.resolve(
        process.cwd(),
        'src',
        'data',
        'generated',
        'kaikki-fallback.v1.json'
      );
      const tempJsonOut = path.resolve(__dirname, 'test-partial-report.json');
      const tempMdOut = path.resolve(__dirname, 'test-partial-report.md');
      const tempCorpusPath = path.resolve(__dirname, 'temp-mini-corpus.jsonl');
      fs.writeFileSync(
        tempCorpusPath,
        JSON.stringify({ id: 'c-1', text: 'تاریخ و تمدن', kind: 'TITLE' }) + '\n',
        'utf8'
      );

      try {
        const report = await runCoverageEvaluation({
          corpusPath: tempCorpusPath,
          coverageOnly: true,
          phase7EPackPath: validDummyPack,
          kaikkiJsonlPath: 'non-existent/kaikki.jsonl',
          reportJsonPath: tempJsonOut,
          reportMdPath: tempMdOut
        });

        expect(report.reportVersion).toBe('PARTIAL_COVERAGE_ONLY');
        expect(fs.existsSync(tempJsonOut)).toBe(true);
        expect(fs.existsSync(tempMdOut)).toBe(true);

        const loadedJson = JSON.parse(fs.readFileSync(tempJsonOut, 'utf8'));
        expect(loadedJson.reportVersion).toBe('PARTIAL_COVERAGE_ONLY');
      } finally {
        if (fs.existsSync(tempCorpusPath)) fs.unlinkSync(tempCorpusPath);
        if (fs.existsSync(tempJsonOut)) fs.unlinkSync(tempJsonOut);
        if (fs.existsSync(tempMdOut)) fs.unlinkSync(tempMdOut);
      }
    });

    it('computes deterministic pack semantic SHA256 invariant to object key ordering', () => {
      const packA: EvidenceFallbackPack = {
        manifest: {
          packVersion: '1.0.0',
          generatedAt: '2026-01-01T00:00:00Z',
          inputSha256: 'sha',
          extractorVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0',
          entryCount: 2
        },
        entries: {
          گفتار: {
            id: '1',
            normalizedForm: 'گفتار',
            hypothesis: 'guftār',
            consensusStatus: 'UNANIMOUS_DETERMINISTIC',
            confidenceTier: 'CROSS_PROFILE_CONSENSUS',
            candidateAnalysisId: 'c1',
            evidenceCount: 1,
            sourceProfiles: ['IRANIAN'],
            interpretations: [],
            generatedFrom: {
              acquisitionVersion: '1.0.0',
              interpreterVersion: '1.0.0',
              ruleSetVersion: '1.0.0',
              aggregatorVersion: '1.0.0'
            }
          },
          شیراز: {
            id: '2',
            normalizedForm: 'شیراز',
            hypothesis: 'shīrāz',
            consensusStatus: 'UNANIMOUS_DETERMINISTIC',
            confidenceTier: 'CROSS_PROFILE_CONSENSUS',
            candidateAnalysisId: 'c2',
            evidenceCount: 1,
            sourceProfiles: ['IRANIAN'],
            interpretations: [],
            generatedFrom: {
              acquisitionVersion: '1.0.0',
              interpreterVersion: '1.0.0',
              ruleSetVersion: '1.0.0',
              aggregatorVersion: '1.0.0'
            }
          }
        }
      };

      const packB: EvidenceFallbackPack = {
        manifest: { ...packA.manifest },
        entries: {
          شیراز: packA.entries.شیراز,
          گفتار: packA.entries.گفتار
        }
      };

      expect(computePackSemanticSha256(packA)).toBe(computePackSemanticSha256(packB));
    });
  });

  describe('8. Local Private Corpus Adapter', () => {
    it('loads and normalizes local JSONL test lines correctly', () => {
      const tmpPath = path.resolve(__dirname, 'test-private-corpus.jsonl');
      const lines = [
        JSON.stringify({ id: 'loc-1', text: 'تاریخ تمدن ایران', kind: 'TITLE' }),
        JSON.stringify({ id: 'loc-2', text: 'بررسی ادبیات معاصر', kind: 'TITLE' })
      ];
      fs.writeFileSync(tmpPath, lines.join('\n'), 'utf8');

      try {
        const loaded = loadPrivateCorpus(tmpPath);
        expect(loaded.length).toBe(2);
        expect(loaded[0].id).toBe('loc-1');
        expect(loaded[0].rawText).toBe('تاریخ تمدن ایران');
        expect(loaded[0].split).toMatch(/DIAGNOSTIC|LOCKED_HOLDOUT/);
      } finally {
        fs.unlinkSync(tmpPath);
      }
    });
  });

  describe('9. Production Governance & Engine Immutability Invariants', () => {
    it('verifies production fallback pack remains strictly untouched', () => {
      const prodPackPath = path.resolve(
        process.cwd(),
        'src',
        'data',
        'generated',
        'kaikki-fallback.v1.json'
      );
      const pack = JSON.parse(fs.readFileSync(prodPackPath, 'utf8')) as EvidenceFallbackPack;

      expect(pack.manifest.entryCount).toBe(4);
      expect(Object.keys(pack.entries)).toEqual(['گفتار', 'شیراز', 'حضور', 'عالی']);
    });

    it('verifies DEFAULT_LEXICON_REPOSITORY is unchanged and valid', () => {
      expect(() => DEFAULT_LEXICON_REPOSITORY.assertValid()).not.toThrow();
    });

    it('exports defined engine and evaluator versions', () => {
      expect(EVALUATOR_VERSION).toBe('1.0.0');
      expect(DIAGNOSTIC_INDEX_VERSION).toBe('1.2.0');
    });
  });
});
