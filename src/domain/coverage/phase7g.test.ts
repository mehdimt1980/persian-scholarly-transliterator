import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { transliterate } from '../engine';
import { DEFAULT_LEXICON_REPOSITORY } from '../../data/lexicon';
import { EvidenceFallbackRepository } from '../evidence/kaikki/fallback/repository';
import { runPhase7GEvaluation } from './phase7gRunner';
import type { EvidenceFallbackPack } from '../evidence/kaikki/fallback/types';
import type { Phase7GSafeResolutionSummaryReport } from './types';

describe('Phase 7G: Safe Whole-Word Evidence Resolution Strategy & Regression Gates', () => {
  const fallbackPack: EvidenceFallbackPack = {
    manifest: {
      packVersion: 'phase7g-test-pack-v1',
      generatedAt: new Date().toISOString(),
      inputSha256: 'test-hash',
      extractorVersion: '1.0.0',
      interpreterVersion: '1.0.0',
      ruleSetVersion: '1.0.0',
      aggregatorVersion: '1.0.0',
      entryCount: 5
    },
    entries: {
      استان: {
        id: 'fb-ostan',
        normalizedForm: 'استان',
        hypothesis: 'ostān',
        consensusStatus: 'UNANIMOUS_DETERMINISTIC',
        confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
        candidateAnalysisId: 'cand-ostan',
        evidenceCount: 1,
        sourceProfiles: ['IRANIAN'],
        interpretations: [
          { evidenceId: 'evi-ostan-1', romanization: 'ostān', profile: 'IRANIAN' }
        ],
        generatedFrom: {
          acquisitionVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0'
        }
      },
      دانش: {
        id: 'fb-danesh',
        normalizedForm: 'دانش',
        hypothesis: 'dānesh',
        consensusStatus: 'UNANIMOUS_DETERMINISTIC',
        confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
        candidateAnalysisId: 'cand-danesh',
        evidenceCount: 1,
        sourceProfiles: ['IRANIAN'],
        interpretations: [
          { evidenceId: 'evi-danesh-1', romanization: 'dāneš', profile: 'IRANIAN' }
        ],
        generatedFrom: {
          acquisitionVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0'
        }
      },
      بارش: {
        id: 'fb-baresh',
        normalizedForm: 'بارش',
        hypothesis: 'bāresh',
        consensusStatus: 'UNANIMOUS_DETERMINISTIC',
        confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
        candidateAnalysisId: 'cand-baresh',
        evidenceCount: 1,
        sourceProfiles: ['IRANIAN'],
        interpretations: [
          { evidenceId: 'evi-baresh-1', romanization: 'bāreš', profile: 'IRANIAN' }
        ],
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
        candidateAnalysisId: 'cand-taghyirat',
        evidenceCount: 1,
        sourceProfiles: ['IRANIAN'],
        interpretations: [
          { evidenceId: 'evi-taghyirat-1', romanization: 'taġyīrāt', profile: 'IRANIAN' }
        ],
        generatedFrom: {
          acquisitionVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0'
        }
      },
      کتابها: {
        id: 'fb-ketabha',
        normalizedForm: 'کتابها',
        hypothesis: 'ketābhā',
        consensusStatus: 'UNANIMOUS_DETERMINISTIC',
        confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
        candidateAnalysisId: 'cand-ketabha',
        evidenceCount: 1,
        sourceProfiles: ['IRANIAN'],
        interpretations: [
          { evidenceId: 'evi-ketabha-1', romanization: 'ketābhā', profile: 'IRANIAN' }
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

  const testRepo = new EvidenceFallbackRepository(fallbackPack);

  describe('1. Production Default Immutability & Opt-In Policy Invariants', () => {
    it('defaults to CURRENT_PRODUCTION when resolutionPolicy is omitted', () => {
      const resDefault = transliterate('استان', 'ijmes_citation_title', [], DEFAULT_LEXICON_REPOSITORY, testRepo);
      const resExplicitProd = transliterate(
        'استان',
        'ijmes_citation_title',
        [],
        DEFAULT_LEXICON_REPOSITORY,
        testRepo,
        { resolutionPolicy: 'CURRENT_PRODUCTION' }
      );

      expect(resDefault).toEqual(resExplicitProd);
    });

    it('intercepts candidate morphology under CURRENT_PRODUCTION but recovers under SAFE_WHOLE_WORD_EVIDENCE', () => {
      // استان matches -ān suffix shape in morphology analyzer
      const resProd = transliterate(
        'استان',
        'ijmes_citation_title',
        [],
        DEFAULT_LEXICON_REPOSITORY,
        testRepo,
        { resolutionPolicy: 'CURRENT_PRODUCTION' }
      );
      // Under production, candidate morphology without reviewed stem leaves it unresolved without proposal
      expect(resProd.tokens[0].status).toBe('UNRESOLVED');
      expect((resProd.tokens[0] as any).evidenceDerivedProposal).toBeUndefined();

      // Under SAFE_WHOLE_WORD_EVIDENCE, exact whole-word fallback is safely surfaced
      const resSafe = transliterate(
        'استان',
        'ijmes_citation_title',
        [],
        DEFAULT_LEXICON_REPOSITORY,
        testRepo,
        { resolutionPolicy: 'SAFE_WHOLE_WORD_EVIDENCE' }
      );
      expect(resSafe.tokens[0].status).toBe('UNRESOLVED');
      expect((resSafe.tokens[0] as any).evidenceDerivedProposal).toBeDefined();
      expect((resSafe.tokens[0] as any).evidenceDerivedProposal.hypothesis).toBe('ostān');
    });
  });

  describe('2. Resolution Precedence & Authority Boundaries', () => {
    it('confirmed reviewed morphology takes strict precedence over whole-word fallback', () => {
      // کتاب‌ها has ZWNJ and matches plural-ha rule with reviewed stem کتاب -> CONFIRMED
      const res = transliterate(
        'کتاب‌ها',
        'ijmes_citation_title',
        [],
        DEFAULT_LEXICON_REPOSITORY,
        testRepo,
        { resolutionPolicy: 'SAFE_WHOLE_WORD_EVIDENCE' }
      );
      expect(res.tokens[0].status).toBe('LEXICON_RESOLVED');
      expect(res.tokens[0].canonicalTransliteration).toBe('kitāb-hā');
      expect((res.tokens[0] as any).evidenceDerivedProposal).toBeUndefined();
    });

    it('reviewed exact whole-word authority takes strict precedence over fallback', () => {
      // ایران is in the reviewed lexicon
      const res = transliterate(
        'ایران',
        'ijmes_citation_title',
        [],
        DEFAULT_LEXICON_REPOSITORY,
        testRepo,
        { resolutionPolicy: 'SAFE_WHOLE_WORD_EVIDENCE' }
      );
      expect(res.tokens[0].status).toBe('LEXICON_RESOLVED');
      expect(res.tokens[0].canonicalTransliteration).toBe('īrān');
      expect(res.tokens[0].rendered).toBe('Īrān');
    });

    it('evidence-derived proposals strictly remain non-authoritative', () => {
      const res = transliterate(
        'دانش',
        'ijmes_citation_title',
        [],
        DEFAULT_LEXICON_REPOSITORY,
        testRepo,
        { resolutionPolicy: 'SAFE_WHOLE_WORD_EVIDENCE' }
      );
      expect(res.tokens[0].status).toBe('UNRESOLVED');
      expect(res.tokens[0].canonicalTransliteration).toBeNull();
      expect(res.copyable).toBe(false);
      expect((res.tokens[0] as any).evidenceDerivedProposal).toBeDefined();
    });

    it('unsupported explicit orthography is never bypassed by fallback routing', () => {
      // Form with unsupported diacritic
      const res = transliterate(
        'اَسْتان',
        'ijmes_citation_title',
        [],
        DEFAULT_LEXICON_REPOSITORY,
        testRepo,
        { resolutionPolicy: 'SAFE_WHOLE_WORD_EVIDENCE' }
      );
      expect(res.tokens[0].status).toBe('UNRESOLVED');
      expect(res.tokens[0].blockingReason).toBe('UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE');
      expect((res.tokens[0] as any).evidenceDerivedProposal).toBeUndefined();
    });
  });

  describe('3. Phase 7G Safe Resolution Frozen Evaluation & Governance', () => {
    it('executes full evaluation or verifies committed summary report', async () => {
      let report: Phase7GSafeResolutionSummaryReport;
      const phase7EPackPath = path.resolve(
        process.cwd(),
        'artifacts',
        'phase7e',
        'kaikki-fallback-recovered-full.json'
      );

      if (fs.existsSync(phase7EPackPath)) {
        report = await runPhase7GEvaluation();
      } else {
        const jsonPath = path.resolve(
          process.cwd(),
          'src',
          'validation',
          'reports',
          'phase7g-safe-resolution-summary.json'
        );
        report = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Phase7GSafeResolutionSummaryReport;
      }

      // Verify input identity hashes
      expect(report.inputIdentity.frozenCorpusSha256).toBe(
        '28d91c460585ac028e987b01f4ea274f6bd991ad3a2ea79a16f8080fae9b5d5a'
      );
      expect(report.inputIdentity.holdoutSha256).toBe(
        '92ad183e088acbecded7165a806e808d9918482d3d6ce98f3c04072e0fd215d2'
      );

      // Verify reconciliation of the 834 intercepted tokens
      const recon = report.interceptedDiagnosticReconciliation;
      expect(recon.totalOriginalInterceptedTokens).toBe(834);
      expect(recon.safeRoutingProposalsCreated).toBe(834);
      expect(recon.stillBlockedByConfirmedMorphology).toBe(0);
      expect(recon.blockedByCompetingReviewedEvidence).toBe(0);
      expect(recon.blockedByExplicitOrthography).toBe(0);
      expect(recon.invalidOrMissingFallback).toBe(0);
      expect(recon.unresolvedForOtherReasons).toBe(0);
      expect(recon.recoveredUniqueForms).toBe(62);
      expect(recon.affectedTitles).toBe(709);

      // Governance: zero new authoritative tokens
      expect(report.regressionSummary.newAuthoritativeTokens).toBe(0);
      expect(report.regressionSummary.lostDisplayabilityTokens).toBe(0);
      expect(report.governance.falseAuthoritative).toBe(0);
      expect(report.governance.underBlocked).toBe(0);
      expect(report.governance.automaticPromotions).toBe(0);
      expect(report.governance.authoritativeLexiconMutations).toBe(0);
      expect(report.governance.productionDefaultUnchanged).toBe(true);
      expect(report.governance.productionFallbackPackUnchanged).toBe(true);

      // Coverage progression
      const prod = report.configurations.CURRENT_PRODUCTION;
      const exp7E = report.configurations.PHASE7E_EXPERIMENTAL;
      const safe7G = report.configurations.PHASE7G_SAFE_ROUTING;

      expect(safe7G.displayTokenCoverage).toBeGreaterThan(exp7E.displayTokenCoverage);
      expect(exp7E.displayTokenCoverage).toBeGreaterThan(prod.displayTokenCoverage);
      expect(safe7G.authoritativeTokenCoverage).toBe(prod.authoritativeTokenCoverage);
    }, 30000);
  });
});
