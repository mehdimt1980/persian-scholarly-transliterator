import { describe, expect, it } from 'vitest';
import { DEFAULT_LEXICON_REPOSITORY } from '../../data/lexicon';
import { EvidenceFallbackRepository } from '../evidence/kaikki/fallback/repository';
import type { EvidenceFallbackPack } from '../evidence/kaikki/fallback/types';
import { transliterate } from '../engine';

describe('Phase 7G: Safe Whole-Word Evidence vs Morphology Resolution', () => {
  const dummyFallbackPack: EvidenceFallbackPack = {
    manifest: {
      packVersion: '7g-test',
      generatedAt: '2026-10-08T00:00:00Z',
      inputSha256: 'sha',
      extractorVersion: '1.0.0',
      interpreterVersion: '1.0.0',
      ruleSetVersion: '1.0.0',
      aggregatorVersion: '1.0.0',
      entryCount: 4
    },
    entries: {
      استان: {
        id: 'fb-ostan',
        normalizedForm: 'استان',
        hypothesis: 'ustān',
        consensusStatus: 'UNANIMOUS_DETERMINISTIC',
        confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
        candidateAnalysisId: 'can-1',
        evidenceCount: 1,
        sourceProfiles: ['IRANIAN'],
        interpretations: [
          { evidenceId: 'ev-1', romanization: 'ostân', profile: 'IRANIAN' }
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
        hypothesis: 'dānish',
        consensusStatus: 'UNANIMOUS_DETERMINISTIC',
        confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
        candidateAnalysisId: 'can-2',
        evidenceCount: 1,
        sourceProfiles: ['IRANIAN'],
        interpretations: [
          { evidenceId: 'ev-2', romanization: 'dânesh', profile: 'IRANIAN' }
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
        candidateAnalysisId: 'can-3',
        evidenceCount: 1,
        sourceProfiles: ['IRANIAN'],
        interpretations: [
          { evidenceId: 'ev-3', romanization: 'taghyīrāt', profile: 'IRANIAN' }
        ],
        generatedFrom: {
          acquisitionVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0'
        }
      },
      کتابها: {
        id: 'fb-ketabha-disagree',
        normalizedForm: 'کتابها',
        hypothesis: 'ketāb-hā-disagree',
        consensusStatus: 'UNANIMOUS_DETERMINISTIC',
        confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
        candidateAnalysisId: 'can-4',
        evidenceCount: 1,
        sourceProfiles: ['IRANIAN'],
        interpretations: [
          { evidenceId: 'ev-4', romanization: 'ketâbhâ', profile: 'IRANIAN' }
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

  const fallbackRepo = new EvidenceFallbackRepository(dummyFallbackPack);

  it('safely recovers candidate suffix matches when exact fallback exists and policy is enabled', () => {
    // Under SAFE_WHOLE_WORD_EVIDENCE, "استان" is safely surfaced from fallback
    const res = transliterate(
      'استان البرز',
      'ijmes_citation_title',
      [],
      DEFAULT_LEXICON_REPOSITORY,
      fallbackRepo,
      { resolutionPolicy: 'SAFE_WHOLE_WORD_EVIDENCE' }
    );

    const ostanToken = res.tokens[0];
    expect(ostanToken.normalizedSurface).toBe('استان');
    expect(ostanToken.rendered).toBe('Ustān');
    expect(ostanToken.status).toBe('UNRESOLVED');
    expect(ostanToken.canonicalTransliteration).toBeNull();
    expect(ostanToken.automatic.evidenceDerivedProposal).toBeDefined();
    expect(ostanToken.automatic.evidenceDerivedProposal?.hypothesis).toBe('ustān');
  });

  it('safely recovers other shape-intercepted forms: دانش and تغییرات', () => {
    const resDanesh = transliterate(
      'دانش بنیادی',
      'ijmes_full',
      [],
      DEFAULT_LEXICON_REPOSITORY,
      fallbackRepo,
      { resolutionPolicy: 'SAFE_WHOLE_WORD_EVIDENCE' }
    );
    expect(resDanesh.tokens[0].rendered).toBe('dānish');
    expect(resDanesh.tokens[0].status).toBe('UNRESOLVED');
    expect(resDanesh.tokens[0].canonicalTransliteration).toBeNull();

    const resTaghyirat = transliterate(
      'تغییرات اقلیمی',
      'ijmes_full',
      [],
      DEFAULT_LEXICON_REPOSITORY,
      fallbackRepo,
      { resolutionPolicy: 'SAFE_WHOLE_WORD_EVIDENCE' }
    );
    expect(resTaghyirat.tokens[0].rendered).toBe('taghyīrāt');
    expect(resTaghyirat.tokens[0].status).toBe('UNRESOLVED');
    expect(resTaghyirat.tokens[0].canonicalTransliteration).toBeNull();
  });

  it('preserves confirmed authoritative morphology over external fallback', () => {
    // "کتاب‌ها" has confirmed reviewed stem "کتاب" in lexicon with ZWNJ boundary.
    // Even if fallback has a whole-word entry, confirmed morphology must win!
    const res = transliterate(
      'کتاب‌ها',
      'ijmes_full',
      [],
      DEFAULT_LEXICON_REPOSITORY,
      fallbackRepo,
      { resolutionPolicy: 'SAFE_WHOLE_WORD_EVIDENCE' }
    );

    const token = res.tokens[0];
    expect(token.status).toBe('LEXICON_RESOLVED');
    expect(token.canonicalTransliteration).toBe('kitāb-hā');
    expect(token.rendered).toBe('kitāb-hā');
    expect(token.automatic.evidenceDerivedProposal).toBeUndefined();
  });

  it('preserves explicit orthographic blocking (combining marks) without bypass', () => {
    // Token with unsupported mark
    const res = transliterate(
      'استانْ', // with sukun
      'ijmes_full',
      [],
      DEFAULT_LEXICON_REPOSITORY,
      fallbackRepo,
      { resolutionPolicy: 'SAFE_WHOLE_WORD_EVIDENCE' }
    );

    const token = res.tokens[0];
    expect(token.status).toBe('UNRESOLVED');
    expect(token.blockingReason).toBe('UNSUPPORTED_ORTHOGRAPHIC_EVIDENCE');
    expect(token.canonicalTransliteration).toBeNull();
  });

  it('leaves candidate morphology unresolved when no fallback entry exists', () => {
    // "کرمان" has candidate morphology but is not in dummyFallbackPack
    const res = transliterate(
      'کرمان',
      'ijmes_full',
      [],
      DEFAULT_LEXICON_REPOSITORY,
      fallbackRepo,
      { resolutionPolicy: 'SAFE_WHOLE_WORD_EVIDENCE' }
    );

    const token = res.tokens[0];
    expect(token.status).toBe('UNRESOLVED');
    expect(token.canonicalTransliteration).toBeNull();
    expect(token.blockingReason).toBe('NO_LEXICAL_ENTRY');
  });

  it('preserves 100% byte-for-byte legacy behavior when policy is CURRENT_PRODUCTION or omitted', () => {
    const resDefault = transliterate(
      'استان البرز',
      'ijmes_citation_title',
      [],
      DEFAULT_LEXICON_REPOSITORY,
      fallbackRepo
    );

    const resExplicitProd = transliterate(
      'استان البرز',
      'ijmes_citation_title',
      [],
      DEFAULT_LEXICON_REPOSITORY,
      fallbackRepo,
      { resolutionPolicy: 'CURRENT_PRODUCTION' }
    );

    expect(resDefault.output).toBe(resExplicitProd.output);
    expect(resDefault.tokens[0].rendered).toBe('⟦استان: unresolved: UNSEGMENTED | PRODUCTIVE_SEGMENTATION⟧');
    expect(resDefault.tokens[0].status).toBe('UNRESOLVED');
    expect(resDefault.tokens[0].automatic.evidenceDerivedProposal).toBeUndefined();
  });
});
