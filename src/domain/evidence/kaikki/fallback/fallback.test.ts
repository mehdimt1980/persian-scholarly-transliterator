import { describe, it, expect } from 'vitest';
import { EvidenceFallbackRepository } from './repository';
import { generateFallbackPack } from './generator';
import { deriveConfidenceTier, computeFallbackEntryId } from './identity';
import { resolveEvidenceFallback } from './resolver';
import { evaluateFallbackCoverage } from './evaluateCli';
import { DEFAULT_EVIDENCE_FALLBACK_REPOSITORY } from '../../../../data/fallback';
import { DEFAULT_LEXICON_REPOSITORY } from '../../../../data/lexicon';
import { LexiconRepository } from '../../../lexicon/repository';
import { transliterate } from '../../../engine';
import { parseTransliterationWorkspace } from '../../../../client/workspace/validation';
import { PHASE7B_SAMPLE_FIXTURES_PATH } from '../scheme/fixtures';
import type { EvidenceFallbackPack } from './types';
import type { Token, TokenAnalysis } from '../../../types';

describe('Phase 7C: Evidence-Backed Automatic Lexical Fallback', () => {
  describe('1. Evidence Fallback Repository & Schema Invariants', () => {
    it('successfully loads and validates the default fallback repository', () => {
      expect(DEFAULT_EVIDENCE_FALLBACK_REPOSITORY.getEntryCount()).toBeGreaterThan(0);
      const manifest = DEFAULT_EVIDENCE_FALLBACK_REPOSITORY.getManifest();
      expect(manifest.packVersion).toBe('1.0.0');
      expect(manifest.entryCount).toBe(DEFAULT_EVIDENCE_FALLBACK_REPOSITORY.getEntryCount());
      expect(() => DEFAULT_EVIDENCE_FALLBACK_REPOSITORY.assertValid()).not.toThrow();
    });

    it('retrieves entries by normalized Persian form', () => {
      const entry = DEFAULT_EVIDENCE_FALLBACK_REPOSITORY.findByNormalized('شیراز');
      expect(entry).toBeDefined();
      expect(entry?.hypothesis).toBe('shīrāz');
      expect(entry?.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
      expect(entry?.confidenceTier).toBe('SINGLE_OBSERVATION_DETERMINISTIC');
      expect(entry?.sourceProfiles).toContain('IRANIAN');
    });

    it('rejects pack with entryCount mismatch', () => {
      const badPack: EvidenceFallbackPack = {
        manifest: {
          packVersion: '1.0.0',
          generatedAt: new Date().toISOString(),
          inputSha256: 'abc',
          extractorVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0',
          entryCount: 5
        },
        entries: {}
      };
      expect(() => new EvidenceFallbackRepository(badPack)).toThrow(/entryCount mismatch/);
    });

    it('rejects pack with non-unanimous entries', () => {
      const badPack: EvidenceFallbackPack = {
        manifest: {
          packVersion: '1.0.0',
          generatedAt: new Date().toISOString(),
          inputSha256: 'abc',
          extractorVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0',
          entryCount: 1
        },
        entries: {
          تست: {
            id: 'fb-kaikki-1',
            normalizedForm: 'تست',
            hypothesis: 'tist',
            consensusStatus: 'CONFLICTING_DETERMINISTIC' as any,
            confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
            candidateAnalysisId: 'cand-1',
            evidenceCount: 1,
            sourceProfiles: ['IRANIAN'],
            interpretations: [
              { evidenceId: 'evi-1', romanization: 'test', profile: 'IRANIAN' }
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
      expect(() => new EvidenceFallbackRepository(badPack)).toThrow(/not UNANIMOUS_DETERMINISTIC/);
    });

    it('rejects pack with empty hypothesis or mismatched normalizedForm key', () => {
      const badPack: EvidenceFallbackPack = {
        manifest: {
          packVersion: '1.0.0',
          generatedAt: new Date().toISOString(),
          inputSha256: 'abc',
          extractorVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0',
          entryCount: 1
        },
        entries: {
          تست: {
            id: 'fb-kaikki-2',
            normalizedForm: 'تست_مختلف',
            hypothesis: 'tist',
            consensusStatus: 'UNANIMOUS_DETERMINISTIC',
            confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
            candidateAnalysisId: 'cand-1',
            evidenceCount: 1,
            sourceProfiles: ['IRANIAN'],
            interpretations: [
              { evidenceId: 'evi-1', romanization: 'test', profile: 'IRANIAN' }
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
      expect(() => new EvidenceFallbackRepository(badPack)).toThrow(/key mismatch/);
    });

    it('rejects pack with invalid confidence tier or empty/invalid sourceProfiles', () => {
      const baseEntry = {
        id: 'fb-kaikki-3',
        normalizedForm: 'تست',
        hypothesis: 'tist',
        consensusStatus: 'UNANIMOUS_DETERMINISTIC' as const,
        confidenceTier: 'INVALID_TIER' as any,
        candidateAnalysisId: 'cand-1',
        evidenceCount: 1,
        sourceProfiles: ['IRANIAN' as const],
        interpretations: [
          { evidenceId: 'evi-1', romanization: 'test', profile: 'IRANIAN' as const }
        ],
        generatedFrom: {
          acquisitionVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0'
        }
      };

      const badTierPack: EvidenceFallbackPack = {
        manifest: {
          packVersion: '1.0.0',
          generatedAt: new Date().toISOString(),
          inputSha256: 'abc',
          extractorVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0',
          entryCount: 1
        },
        entries: { تست: { ...baseEntry } }
      };
      expect(() => new EvidenceFallbackRepository(badTierPack)).toThrow(/invalid confidenceTier/);

      const badProfilesPack: EvidenceFallbackPack = {
        ...badTierPack,
        entries: {
          تست: {
            ...baseEntry,
            confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
            sourceProfiles: []
          }
        }
      };
      expect(() => new EvidenceFallbackRepository(badProfilesPack)).toThrow(/empty sourceProfiles/);
    });

    it('rejects pack with evidenceCount mismatch or invalid interpretation', () => {
      const baseEntry = {
        id: 'fb-kaikki-4',
        normalizedForm: 'تست',
        hypothesis: 'tist',
        consensusStatus: 'UNANIMOUS_DETERMINISTIC' as const,
        confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC' as const,
        candidateAnalysisId: 'cand-1',
        evidenceCount: 2, // Mismatch: declares 2, interpretations length is 1
        sourceProfiles: ['IRANIAN' as const],
        interpretations: [
          { evidenceId: 'evi-1', romanization: 'test', profile: 'IRANIAN' as const }
        ],
        generatedFrom: {
          acquisitionVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0'
        }
      };

      const mismatchPack: EvidenceFallbackPack = {
        manifest: {
          packVersion: '1.0.0',
          generatedAt: new Date().toISOString(),
          inputSha256: 'abc',
          extractorVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0',
          entryCount: 1
        },
        entries: { تست: { ...baseEntry } }
      };
      expect(() => new EvidenceFallbackRepository(mismatchPack)).toThrow(/evidenceCount mismatch/);
    });
  });

  describe('2. Fallback Pack Generator & Confidence Tiers', () => {
    it('generates a valid fallback pack from sample fixtures', async () => {
      const pack = await generateFallbackPack(PHASE7B_SAMPLE_FIXTURES_PATH, {
        packVersion: '1.0.0'
      });

      expect(pack.manifest.entryCount).toBeGreaterThan(0);
      expect(pack.entries['شیراز']).toBeDefined();
      expect(pack.entries['شیراز'].hypothesis).toBe('shīrāz');
      expect(pack.entries['گفتار']).toBeDefined();
      expect(pack.entries['گفتار'].hypothesis).toBe('guftār');
      expect(pack.entries['گفتار'].confidenceTier).toBe('CROSS_PROFILE_CONSENSUS');
    });

    it('correctly derives confidence tiers', () => {
      expect(deriveConfidenceTier(['CLASSICAL_DARI', 'IRANIAN'], 2)).toBe('CROSS_PROFILE_CONSENSUS');
      expect(deriveConfidenceTier(['IRANIAN'], 2)).toBe('MULTI_OBSERVATION_CONSENSUS');
      expect(deriveConfidenceTier(['IRANIAN'], 1)).toBe('SINGLE_OBSERVATION_DETERMINISTIC');
    });

    it('enforces deterministic ID computation', () => {
      const id1 = computeFallbackEntryId('1.0.0', 'گفتار', 'guftār', 'analysis-1', ['evi-2', 'evi-1']);
      const id2 = computeFallbackEntryId('1.0.0', 'گفتار', 'guftār', 'analysis-1', ['evi-1', 'evi-2']);
      expect(id1).toBe(id2);
      expect(id1.startsWith('fb-kaikki-')).toBe(true);
    });

    it('enforces size guard ceiling', async () => {
      await expect(
        generateFallbackPack(PHASE7B_SAMPLE_FIXTURES_PATH, {
          maxPackBytes: 10 // impossibly small ceiling
        })
      ).rejects.toThrow(/exceeds size ceiling/);
    });
  });

  describe('3. Pure Fallback Resolver & Token Snapshot', () => {
    it('resolves an unknown token to an unresolved evidence-derived proposal', () => {
      const token: Token = {
        normalizedSurface: 'شیراز',
        type: 'persian-word',
        normalizedStart: 0,
        normalizedEnd: 5
      };
      const analysis: TokenAnalysis = {
        tokenIndex: 0,
        normalizedSurface: 'شیراز',
        lookupForm: 'شیراز',
        normalizedStart: 0,
        normalizedEnd: 5,
        explicitVowels: [],
        explicitIzafat: null,
        unsupportedCombiningMarks: [],
        zwnjBoundaries: [],
        evidencedSegments: ['شیراز'],
        warnings: [],
        provenance: []
      };

      const result = resolveEvidenceFallback(
        token,
        analysis,
        DEFAULT_EVIDENCE_FALLBACK_REPOSITORY,
        'ijmes_full'
      );

      expect(result).not.toBeNull();
      expect(result?.status).toBe('UNRESOLVED');
      expect(result?.canonicalTransliteration).toBeNull();
      expect(result?.automaticCanonical).toBeNull();
      expect(result?.rendered).toBe('shīrāz');
      expect(result?.blockingReason).toBe('EVIDENCE_DERIVED_REVIEW_REQUIRED');

      expect(result?.evidenceDerivedProposal).toBeDefined();
      expect(result?.evidenceDerivedProposal?.hypothesis).toBe('shīrāz');
      expect(result?.evidenceDerivedProposal?.renderedProposal).toBe('shīrāz');
      expect(result?.evidenceDerivedProposal?.confidenceTier).toBe('SINGLE_OBSERVATION_DETERMINISTIC');
      expect(result?.evidenceDerivedProposal?.source).toBe('KAIKKI_WIKTIONARY');

      // Verify automatic snapshot
      expect(result?.automatic.status).toBe('UNRESOLVED');
      expect(result?.automatic.canonicalTransliteration).toBeNull();
      expect(result?.automatic.rendered).toBe('shīrāz');
      expect(result?.automatic.blockingReason).toBe('EVIDENCE_DERIVED_REVIEW_REQUIRED');
    });

    it('renders citation title profile on the proposal', () => {
      const token: Token = {
        normalizedSurface: 'شیراز',
        type: 'persian-word',
        normalizedStart: 0,
        normalizedEnd: 5
      };
      const analysis: TokenAnalysis = {
        tokenIndex: 0,
        normalizedSurface: 'شیراز',
        lookupForm: 'شیراز',
        normalizedStart: 0,
        normalizedEnd: 5,
        explicitVowels: [],
        explicitIzafat: null,
        unsupportedCombiningMarks: [],
        zwnjBoundaries: [],
        evidencedSegments: ['شیراز'],
        warnings: [],
        provenance: []
      };

      const result = resolveEvidenceFallback(
        token,
        analysis,
        DEFAULT_EVIDENCE_FALLBACK_REPOSITORY,
        'ijmes_citation_title'
      );

      expect(result?.rendered).toBe('Shīrāz');
      expect(result?.evidenceDerivedProposal?.hypothesis).toBe('shīrāz');
      expect(result?.evidenceDerivedProposal?.renderedProposal).toBe('Shīrāz');
    });
  });

  describe('4. Engine Precedence & Integration', () => {
    it('preserves reviewed lexicon priority over fallback repository (lexicon always wins)', () => {
      // 'گفتار' is in reviewed lexicon (guftār), and also in fallback pack
      const result = transliterate('گفتار', 'ijmes_full');
      expect(result.tokens[0].status).toBe('LEXICON_RESOLVED');
      expect(result.tokens[0].canonicalTransliteration).toBe('guftār');
      expect(result.tokens[0].evidenceDerivedProposal).toBeUndefined();
    });

    it('falls back cleanly for unreviewed tokens and blocks copying until review', () => {
      const result = transliterate('شیراز', 'ijmes_full');
      expect(result.tokens[0].status).toBe('UNRESOLVED');
      expect(result.tokens[0].canonicalTransliteration).toBeNull();
      expect(result.tokens[0].rendered).toBe('shīrāz');
      expect(result.output).toBe('shīrāz');
      expect(result.copyable).toBe(false);

      // Review issues should contain an EVIDENCE_DERIVED_READING issue
      expect(result.reviewIssues.length).toBe(1);
      const issue = result.reviewIssues[0];
      expect(issue.type).toBe('EVIDENCE_DERIVED_READING');
      expect(issue.allowedActions).toContain('ACCEPT_EVIDENCE_DERIVED');
      expect(issue.allowedActions).toContain('MANUAL_CANONICAL_OVERRIDE');
      expect(issue.alternatives[0].canonical).toBe('shīrāz');
    });

    it('properly capitalizes citation titles on fallback tokens', () => {
      const result = transliterate('شیراز کتاب', 'ijmes_citation_title');
      expect(result.tokens[0].rendered).toBe('Shīrāz');
      expect(result.tokens[0].canonicalTransliteration).toBeNull();
      expect(result.tokens[0].evidenceDerivedProposal?.hypothesis).toBe('shīrāz');
      expect(result.tokens[2].rendered).toBe('Kitāb');
    });


    it('does not bypass unsupported combining mark errors with fallback', () => {
      const result = transliterate('شیرازْ', 'ijmes_full');
      const wordToken = result.tokens[0];
      if (wordToken.blockingReason === 'UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE') {
        expect(wordToken.evidenceDerivedProposal).toBeUndefined();
      }
    });
  });

  describe('5. Review Issue Detection & Tamper-Resistant Decision Application', () => {
    it('accepts evidence-derived proposal into USER_OVERRIDE with immutable automatic snapshot', () => {
      const initial = transliterate('شیراز', 'ijmes_full');
      expect(initial.copyable).toBe(false);
      const issue = initial.reviewIssues[0];
      expect(issue.type).toBe('EVIDENCE_DERIVED_READING');

      const decision = {
        issueId: issue.id,
        action: 'ACCEPT_EVIDENCE_DERIVED' as const,
        selectedAlternativeId: issue.alternatives[0].id
      };

      const accepted = transliterate('شیراز', 'ijmes_full', [decision]);
      expect(accepted.tokens[0].status).toBe('USER_OVERRIDE');
      expect(accepted.tokens[0].canonicalTransliteration).toBe('shīrāz');
      expect(accepted.tokens[0].rendered).toBe('shīrāz');
      expect(accepted.copyable).toBe(true);

      // Automatic snapshot MUST remain unresolved with null canonical
      expect(accepted.tokens[0].automatic.status).toBe('UNRESOLVED');
      expect(accepted.tokens[0].automatic.canonicalTransliteration).toBeNull();
      expect(accepted.tokens[0].automatic.evidenceDerivedProposal?.hypothesis).toBe('shīrāz');
      expect(accepted.reviewIssues.length).toBe(0);
      expect(accepted.appliedDecisions.length).toBe(1);
    });

    it('rejects tampered canonical values during ACCEPT_EVIDENCE_DERIVED', () => {
      const initial = transliterate('شیراز', 'ijmes_full');
      const issue = initial.reviewIssues[0];

      const tamperedDecision = {
        issueId: issue.id,
        action: 'ACCEPT_EVIDENCE_DERIVED' as const,
        selectedAlternativeId: issue.alternatives[0].id,
        manualCanonicalTransliteration: 'tampered_wrong_reading'
      };

      const res = transliterate('شیراز', 'ijmes_full', [tamperedDecision]);
      expect(res.tokens[0].status).toBe('UNRESOLVED');
      expect(res.tokens[0].canonicalTransliteration).toBeNull();
      expect(res.staleDecisions.length).toBe(1);
      expect(res.copyable).toBe(false);
    });

    it('strictly fails closed when selectedAlternativeId is missing, empty, or mismatched', () => {
      const initial = transliterate('شیراز', 'ijmes_full');
      const issue = initial.reviewIssues[0];

      // Missing selectedAlternativeId
      const missingDecision = {
        issueId: issue.id,
        action: 'ACCEPT_EVIDENCE_DERIVED' as const
      };
      const resMissing = transliterate('شیراز', 'ijmes_full', [missingDecision as any]);
      expect(resMissing.tokens[0].status).toBe('UNRESOLVED');
      expect(resMissing.staleDecisions.length).toBe(1);

      // Empty selectedAlternativeId
      const emptyDecision = {
        issueId: issue.id,
        action: 'ACCEPT_EVIDENCE_DERIVED' as const,
        selectedAlternativeId: '   '
      };
      const resEmpty = transliterate('شیراز', 'ijmes_full', [emptyDecision]);
      expect(resEmpty.tokens[0].status).toBe('UNRESOLVED');
      expect(resEmpty.staleDecisions.length).toBe(1);

      // Wrong selectedAlternativeId
      const wrongDecision = {
        issueId: issue.id,
        action: 'ACCEPT_EVIDENCE_DERIVED' as const,
        selectedAlternativeId: 'fb-kaikki-wrong-proposal-id'
      };
      const resWrong = transliterate('شیراز', 'ijmes_full', [wrongDecision]);
      expect(resWrong.tokens[0].status).toBe('UNRESOLVED');
      expect(resWrong.staleDecisions.length).toBe(1);
    });
  });

  describe('6. Workspace Persistence Round-Trip for ACCEPT_EVIDENCE_DERIVED', () => {
    it('serializes, parses/validates, and re-applies ACCEPT_EVIDENCE_DERIVED across sessions', () => {
      const initial = transliterate('شیراز', 'ijmes_full');
      const issue = initial.reviewIssues[0];
      const decision = {
        issueId: issue.id,
        action: 'ACCEPT_EVIDENCE_DERIVED' as const,
        selectedAlternativeId: issue.alternatives[0].id
      };

      const workspacePayload = {
        schemaVersion: 1,
        input: 'شیراز',
        profile: 'ijmes_full',
        updatedAt: new Date().toISOString(),
        reviewDecisions: [decision]
      };

      const parseResult = parseTransliterationWorkspace(workspacePayload);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) return;

      expect(parseResult.data.reviewDecisions.length).toBe(1);
      expect(parseResult.data.reviewDecisions[0].action).toBe('ACCEPT_EVIDENCE_DERIVED');
      expect(parseResult.data.reviewDecisions[0].selectedAlternativeId).toBe(issue.alternatives[0].id);

      // Re-running engine with restored workspace decisions restores USER_OVERRIDE
      const restored = transliterate(
        parseResult.data.input,
        parseResult.data.profile,
        parseResult.data.reviewDecisions
      );
      expect(restored.tokens[0].status).toBe('USER_OVERRIDE');
      expect(restored.tokens[0].canonicalTransliteration).toBe('shīrāz');
      expect(restored.copyable).toBe(true);
    });
  });

  describe('7. Stale Pack Version / Proposal Identity Invariant', () => {
    it('marks decision as stale when fallback pack version changes entry identity', () => {
      const initial = transliterate('شیراز', 'ijmes_full');
      const issue = initial.reviewIssues[0];

      // Stored decision from Pack v1.0.0
      const oldDecision = {
        issueId: issue.id,
        action: 'ACCEPT_EVIDENCE_DERIVED' as const,
        selectedAlternativeId: issue.alternatives[0].id
      };

      // Create a mock Pack v2.0.0 repository with a different version in entry ID
      const packV2: EvidenceFallbackPack = {
        manifest: {
          packVersion: '2.0.0',
          generatedAt: new Date().toISOString(),
          inputSha256: 'abc',
          extractorVersion: '2.0.0',
          interpreterVersion: '2.0.0',
          ruleSetVersion: '2.0.0',
          aggregatorVersion: '2.0.0',
          entryCount: 1
        },
        entries: {
          شیراز: {
            id: 'fb-kaikki-v2-diff-id',
            normalizedForm: 'شیراز',
            hypothesis: 'shīrāz',
            consensusStatus: 'UNANIMOUS_DETERMINISTIC',
            confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
            candidateAnalysisId: 'cand-shiraz',
            evidenceCount: 1,
            sourceProfiles: ['IRANIAN'],
            interpretations: [
              { evidenceId: 'evi-1', romanization: 'shiraz', profile: 'IRANIAN' }
            ],
            generatedFrom: {
              acquisitionVersion: '2.0.0',
              interpreterVersion: '2.0.0',
              ruleSetVersion: '2.0.0',
              aggregatorVersion: '2.0.0'
            }
          }
        }
      };
      const repoV2 = new EvidenceFallbackRepository(packV2);

      // Re-running with old v1 decision on v2 fallback repository fails closed (marked stale)
      const res = transliterate('شیراز', 'ijmes_full', [oldDecision], DEFAULT_LEXICON_REPOSITORY, repoV2);
      expect(res.tokens[0].status).toBe('UNRESOLVED');
      expect(res.tokens[0].canonicalTransliteration).toBeNull();
      expect(res.staleDecisions.length).toBe(1);
      expect(res.copyable).toBe(false);
    });
  });

  describe('8. Custom Lexicon Isolation & Explicit Fallback Opt-In', () => {
    it('isolates custom LexiconRepository from production fallback repository unless explicitly provided', () => {
      const customLexicon = new LexiconRepository([
        {
          id: 'lex-test',
          surface: 'تست',
          normalized: 'تست',
          readings: [{ id: 'r1', canonical: 'test', confidence: 1.0, source: 'CUSTOM' }]
        }
      ]);

      // 1. Without explicit fallback repository, custom lexicon receives NO production fallback
      const withoutFallback = transliterate('شیراز', 'ijmes_full', [], customLexicon);
      expect(withoutFallback.tokens[0].status).toBe('UNRESOLVED');
      expect(withoutFallback.tokens[0].blockingReason).toBe('NO_LEXICAL_ENTRY');
      expect(withoutFallback.tokens[0].evidenceDerivedProposal).toBeUndefined();
      expect(withoutFallback.tokens[0].rendered).toBe('⟦شیراز: unresolved⟧');

      // 2. With explicit fallback repository passed, evidence proposal appears
      const withExplicitFallback = transliterate(
        'شیراز',
        'ijmes_full',
        [],
        customLexicon,
        DEFAULT_EVIDENCE_FALLBACK_REPOSITORY
      );
      expect(withExplicitFallback.tokens[0].status).toBe('UNRESOLVED');
      expect(withExplicitFallback.tokens[0].blockingReason).toBe('EVIDENCE_DERIVED_REVIEW_REQUIRED');
      expect(withExplicitFallback.tokens[0].evidenceDerivedProposal).toBeDefined();
      expect(withExplicitFallback.tokens[0].rendered).toBe('shīrāz');
    });
  });

  describe('9. Multi-Token Phrases & Usability', () => {
    it('handles mixed phrases with reviewed words and evidence fallback tokens', () => {
      // 'کتاب' is in default lexicon (kitāb), 'شیراز' is in fallback (shīrāz)
      const res = transliterate('کتاب شیراز', 'ijmes_full');
      expect(res.tokens[0].status).toBe('LEXICON_RESOLVED');
      expect(res.tokens[0].canonicalTransliteration).toBe('kitāb');

      expect(res.tokens[2].status).toBe('UNRESOLVED');
      expect(res.tokens[2].canonicalTransliteration).toBeNull();
      expect(res.tokens[2].rendered).toBe('shīrāz');

      expect(res.output).toBe('kitāb shīrāz');
      expect(res.copyable).toBe(false);

      // Accepting the second token makes entire phrase copyable
      const issue = res.reviewIssues[0];
      const decision = {
        issueId: issue.id,
        action: 'ACCEPT_EVIDENCE_DERIVED' as const,
        selectedAlternativeId: issue.alternatives[0].id
      };

      const accepted = transliterate('کتاب شیراز', 'ijmes_full', [decision]);
      expect(accepted.copyable).toBe(true);
      expect(accepted.output).toBe('kitāb shīrāz');
    });
  });

  describe('10. Coverage & Governance Invariants', () => {
    it('evaluates fallback benchmark and reports improved display coverage with strictly unchanged authority', () => {
      const report = evaluateFallbackCoverage();
      expect(report.eligibleFallbackHits).toBeGreaterThan(0);
      expect(report.displayCoverageAfter).toBeGreaterThan(report.displayCoverageBefore);
      expect(report.authoritativeCoverageAfter).toBe(report.authoritativeCoverageBefore);
      expect(report.automaticPromotions).toBe(0);
      expect(report.authoritativeLexiconMutations).toBe(0);
    });

    it('proves zero mutations on DEFAULT_LEXICON_REPOSITORY', () => {
      const entryCountBefore = DEFAULT_LEXICON_REPOSITORY.getAllEntries().length;
      transliterate('شیراز حضور عالی', 'ijmes_full');
      const entryCountAfter = DEFAULT_LEXICON_REPOSITORY.getAllEntries().length;
      expect(entryCountAfter).toBe(entryCountBefore);
    });
  });
});
