import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LEXICON_REPOSITORY } from '../../data/lexicon';
import {
  DEFAULT_EVIDENCE_FALLBACK_REPOSITORY
} from '../../data/fallback';
import { evaluateTitleEligibility } from './openalex/eligibility';
import {
  computeCorpusSha256,
  computeSelectionHash,
  selectAndSplitCorpus,
  type CandidatePoolItem
} from './openalex/selection';
import { buildEvaluationFallbackUnion } from './fallbackUnion';
import { evaluateCoverageCorpus } from './evaluator';
import {
  analyzeSurfaceMorphology,
  classifyDiagnosticBlocker,
  generateWorklistsAndAuditSamples,
  type KaikkiDiagnosticIndex
} from './diagnostics';
import { loadPrivateCorpus } from './privateAdapter';
import type { CoverageCorpusCase } from './types';
import type {
  EvidenceFallbackPack
} from '../evidence/kaikki/fallback/types';

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
        rawText: 'تاریخ و تمدن', // "تاریخ" and "و" and "تمدن" (reviewed lexicon covers all 3)
        normalizedText: 'تاریخ و تمدن',
        kind: 'TITLE',
        metadata: { workType: 'book', publicationYear: 2020 },
        split: 'DIAGNOSTIC'
      },
      {
        id: 'c2',
        source: 'OPENALEX',
        sourceId: 'W2',
        rawText: 'گفتار در شیراز', // "گفتار", "در", "شیراز" ("گفتار" and "شیراز" in fallback)
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

  describe('6. Diagnostic Blocker & Surface Morphology Classification', () => {
    const dummyPack: EvidenceFallbackPack = {
      manifest: {
        packVersion: '7e',
        generatedAt: '',
        inputSha256: '',
        extractorVersion: '',
        interpreterVersion: '',
        ruleSetVersion: '',
        aggregatorVersion: '',
        entryCount: 1
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
            acquisitionVersion: '',
            interpreterVersion: '',
            ruleSetVersion: '',
            aggregatorVersion: ''
          }
        }
      }
    };

    const mockKaikkiIndex: KaikkiDiagnosticIndex = {
      کتابها: {
        normalizedForm: 'کتابها',
        isLemma: false,
        isProperName: false,
        romanizationCount: 1,
        posList: ['noun']
      },
      تهران: {
        normalizedForm: 'تهران',
        isLemma: true,
        isProperName: true,
        romanizationCount: 1,
        posList: ['name']
      },
      واژه_تک_روم: {
        normalizedForm: 'واژه_تک_روم',
        isLemma: true,
        isProperName: false,
        romanizationCount: 1,
        posList: ['noun']
      },
      واژه_چند_روم: {
        normalizedForm: 'واژه_چند_روم',
        isLemma: true,
        isProperName: false,
        romanizationCount: 3,
        posList: ['noun']
      }
    };

    it('classifies miss categories accurately', () => {
      // 1. Phase 7E eligible
      expect(
        classifyDiagnosticBlocker('جهاد', dummyPack, mockKaikkiIndex).category
      ).toBe('PHASE7E_ELIGIBLE');

      // 2. Non-lemma
      expect(
        classifyDiagnosticBlocker('کتابها', dummyPack, mockKaikkiIndex).category
      ).toBe('KAIKKI_NON_LEMMA');

      // 3. Single romanization unclassified
      expect(
        classifyDiagnosticBlocker('واژه_تک_روم', dummyPack, mockKaikkiIndex).category
      ).toBe('KAIKKI_LEMMA_SINGLE_ROMANIZATION_UNCLASSIFIED');

      // 4. Multi romanization
      expect(
        classifyDiagnosticBlocker('واژه_چند_روم', dummyPack, mockKaikkiIndex).category
      ).toBe('KAIKKI_LEMMA_MULTI_ROMANIZATION_INSUFFICIENT_SIGNAL');

      // 5. Not in Kaikki
      expect(
        classifyDiagnosticBlocker('واژه_کاملا_غایب', dummyPack, mockKaikkiIndex).category
      ).toBe('NOT_PRESENT_IN_KAIKKI');
    });

    it('analyzes transparent surface morphology patterns', () => {
      const forms = [
        'کتاب\u200cها',
        'مقاله‌های',
        'تحقیقی',
        'سریع‌تر',
        'بهترین',
        'کتاب‌شان'
      ];
      const res = analyzeSurfaceMorphology(forms);

      expect(res.surfaceZwnjCount).toBeGreaterThan(0);
      expect(res.surfaceSuffixHaCount).toBe(1);
      expect(res.surfaceSuffixHayeCount).toBe(1);
      expect(res.surfaceSuffixYeCount).toBe(2);
      expect(res.surfaceSuffixTarCount).toBe(1);
      expect(res.surfaceSuffixTarinCount).toBe(1);
      expect(res.surfaceEncliticPronounCount).toBe(1);
    });

    it('generates deterministic audit samples and worklists without random variation', () => {
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
        category: 'PHASE7E_ELIGIBLE',
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

  describe('7. Local Private Corpus Adapter', () => {
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

  describe('8. Production Governance Invariants', () => {
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
  });
});
