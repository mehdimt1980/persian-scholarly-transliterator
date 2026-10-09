import { describe, expect, it } from 'vitest';
import {
  buildPhraseResolverRequest,
  computePhraseReadingFingerprintV2,
  computePhraseReadingFingerprintV3
} from '../assistance';
import { transliterate } from '../engine';
import {
  diagnoseScholarlyCanonical,
  removePublicationDiacritics,
  renderScholarlyCanonical
} from './index';

const TITLE_CONTEXT = { contentCategory: 'BOOK_OR_ARTICLE_TITLE' as const };

describe('Phase 8B deterministic presentation renderer', () => {
  it('preserves the canonical value and full scholarly diacritics', () => {
    const canonical = 'ṣadā-yi pā-yi bārān dar kūchihā-yi tihrān';
    const result = renderScholarlyCanonical(canonical, { id: 'full_scholarly_v1' });
    expect(result).toMatchObject({ ok: true, canonical, output: canonical });
    expect(canonical).toBe('ṣadā-yi pā-yi bārān dar kūchihā-yi tihrān');
  });

  it('renders the diagnostic title mechanically without declaring it gold', () => {
    const canonical = 'ṣadā-yi pā-yi bārān dar kūchihā-yi tihrān';
    const result = renderScholarlyCanonical(canonical, { id: 'ijmes_publication_v1' }, TITLE_CONTEXT);
    expect(result.output).toBe('Sada-yi Pa-yi Baran dar Kuchiha-yi Tihran');
    expect(result.canonical).toBe(canonical);
    expect(result.diagnostics.map((item) => item.id)).toContain('PRESENTATION_DOES_NOT_VERIFY_READING');
  });

  it('removes precomposed and decomposed ordinary diacritics but preserves ʿayn and hamza', () => {
    const nfc = 'ʿālim ṣafāʾ żamīr';
    const nfd = nfc.normalize('NFD');
    expect(removePublicationDiacritics(nfc)).toBe('ʿalim safaʾ zamir');
    expect(removePublicationDiacritics(nfd)).toBe('ʿalim safaʾ zamir');
  });

  it('applies bounded minor-word, al-, contraction, suffix, compound, and punctuation rules', () => {
    const canonical = 'al-nūr wa-l-zandaqa: kitāb-i buzurg dar īrān';
    const result = renderScholarlyCanonical(canonical, { id: 'ijmes_publication_v1' }, TITLE_CONTEXT);
    expect(result.output).toBe('al-Nur wa-l-Zandaqa: Kitab-i Buzurg dar Iran');
  });

  it('capitalizes a title-boundary minor word but retains the al- exception', () => {
    expect(renderScholarlyCanonical('dar īrān', { id: 'ijmes_publication_v1' }, TITLE_CONTEXT).output)
      .toBe('Dar Iran');
    expect(renderScholarlyCanonical('al-nūr', { id: 'ijmes_publication_v1' }, TITLE_CONTEXT).output)
      .toBe('al-Nur');
  });

  it('is deterministic, idempotent, punctuation-preserving, and Unicode-safe', () => {
    const canonical = 'ʿilm, dar īrān!';
    const first = renderScholarlyCanonical(canonical, { id: 'ijmes_publication_v1' }, TITLE_CONTEXT);
    const second = renderScholarlyCanonical(first.output!, { id: 'ijmes_publication_v1' }, TITLE_CONTEXT);
    expect(first.output).toBe('ʿIlm, dar Iran!');
    expect(second.output).toBe(first.output);
  });

  it('keeps technical terms fully diacritized under IJMES publication policy', () => {
    const result = renderScholarlyCanonical('vilāyat-i faqīh', { id: 'ijmes_publication_v1' }, { contentCategory: 'TECHNICAL_TERM' });
    expect(result.output).toBe('vilāyat-i faqīh');
  });

  it('validates bounded custom policy and fails closed without required context', () => {
    expect(renderScholarlyCanonical('kitāb', { id: 'ijmes_publication_v1' }).ok).toBe(false);
    const invalid = renderScholarlyCanonical('kitāb', {
      id: 'custom_scholarly_v1',
      options: { diacritics: 'FULL', capitalization: 'ENGLISH_TITLE', contentCategory: 'PERSONAL_NAME' }
    });
    expect(invalid).toMatchObject({ ok: false, output: null });
    const custom = renderScholarlyCanonical('kitāb-i buzurg', {
      id: 'custom_scholarly_v1',
      options: { diacritics: 'FULL', capitalization: 'ENGLISH_TITLE', contentCategory: 'BOOK_OR_ARTICLE_TITLE' }
    });
    expect(custom.output).toBe('Kitāb-i Buzurg');

    const malformed = renderScholarlyCanonical('kitāb', {
      id: 'custom_scholarly_v1',
      options: { diacritics: 'UNKNOWN', capitalization: 'PRESERVE', contentCategory: 'TECHNICAL_TERM', extra: true }
    } as unknown as Parameters<typeof renderScholarlyCanonical>[1]);
    expect(malformed).toMatchObject({ ok: false, output: null });
    expect(malformed.diagnostics).toContainEqual(expect.objectContaining({ id: 'CUSTOM_V1_INVALID_OPTIONS' }));
    const unsupported = renderScholarlyCanonical('kitāb', { id: 'future_profile' } as unknown as Parameters<typeof renderScholarlyCanonical>[1]);
    expect(unsupported).toMatchObject({ ok: false, output: null, profileId: 'unsupported' });
  });
});

describe('Phase 8B scholarly canonical diagnostics', () => {
  it('flags ALA-LC characters and initial hamza without rewriting', () => {
    const result = diagnoseScholarlyCanonical({ canonical: 'ʾemr maʻnā z̤amīr', contentCategory: 'GENERAL_SCHOLARLY_TEXT' });
    expect(result.normalizedCanonical).toBe('ʾemr maʻnā z̤amīr');
    expect(result.diagnostics.map((item) => item.id)).toEqual(expect.arrayContaining([
      'IJMES_CANONICAL_UNSUPPORTED_ALA_LC_CHARACTER',
      'IJMES_CANONICAL_INITIAL_HAMZA',
      'IJMES_PERSIAN_SHORT_VOWEL_SUSPECTED'
    ]));
  });

  it('distinguishes initial from medial hamza', () => {
    const medial = diagnoseScholarlyCanonical({ canonical: 'masʾala', contentCategory: 'GENERAL_SCHOLARLY_TEXT' });
    expect(medial.diagnostics).not.toContainEqual(expect.objectContaining({ id: 'IJMES_CANONICAL_INITIAL_HAMZA' }));
  });

  it('treats e/o as suspected review, not an automatic replacement', () => {
    const suspicious = diagnoseScholarlyCanonical({ canonical: 'kūchehā', contentCategory: 'BOOK_OR_ARTICLE_TITLE' });
    expect(suspicious.diagnostics).toContainEqual(expect.objectContaining({ id: 'IJMES_PERSIAN_SHORT_VOWEL_SUSPECTED', severity: 'REVIEW_REQUIRED' }));
    expect(suspicious.normalizedCanonical).toBe('kūchehā');
    expect(diagnoseScholarlyCanonical({ canonical: 'guftār rūy ayvān', contentCategory: 'GENERAL_SCHOLARLY_TEXT' }).diagnostics)
      .not.toContainEqual(expect.objectContaining({ id: 'IJMES_PERSIAN_SHORT_VOWEL_SUSPECTED' }));
  });

  it('records proper-name identity as unverified unless scoped evidence exists', () => {
    expect(diagnoseScholarlyCanonical({ canonical: 'tihrān', contentCategory: 'PLACE_NAME' }).diagnostics)
      .toContainEqual(expect.objectContaining({ id: 'IJMES_IDENTITY_SPELLING_UNVERIFIED', severity: 'INFO' }));
    expect(diagnoseScholarlyCanonical({ canonical: 'Tehran', contentCategory: 'PLACE_NAME', verifiedWordListIdentity: true }).diagnostics)
      .not.toContainEqual(expect.objectContaining({ id: 'IJMES_IDENTITY_SPELLING_UNVERIFIED' }));
  });
});

describe('Phase 8B reading identity', () => {
  it('separates reading identity from rendering-only fields', () => {
    const request = buildPhraseResolverRequest(transliterate('واژه دیگر', 'ijmes_citation_title'));
    const renderingOnly = {
      ...request,
      profile: 'ijmes_full' as const,
      deterministicOutput: 'presentation changed',
      tokenEvidence: request.tokenEvidence.map((token) => ({ ...token, rendered: `rendered:${token.index}` }))
    };
    expect(computePhraseReadingFingerprintV2(request, 'mock', 'model'))
      .toBe(computePhraseReadingFingerprintV2(renderingOnly, 'mock', 'model'));
  });

  it('V3 includes interpretation-relevant review evidence but normalizes set ordering', () => {
    const request = buildPhraseResolverRequest(transliterate('واژه دیگر', 'ijmes_citation_title'));
    const issue = request.reviewIssues[0];
    const reordered = {
      ...request,
      reviewIssues: request.reviewIssues.map((item) => ({
        ...item,
        tokenIndexes: [...item.tokenIndexes].reverse(),
        allowedActions: [...item.allowedActions].reverse(),
        alternatives: [...item.alternatives].reverse()
      }))
    };
    expect(computePhraseReadingFingerprintV3(request, 'mock', 'model'))
      .toBe(computePhraseReadingFingerprintV3(reordered, 'mock', 'model'));

    const changedEvidence = {
      ...request,
      reviewIssues: request.reviewIssues.map((item, index) => index === 0
        ? { ...item, evidenceSummary: `${item.evidenceSummary ?? ''} changed` }
        : item)
    };
    const changedSource = {
      ...request,
      reviewIssues: request.reviewIssues.map((item, index) => index === 0
        ? {
            ...item,
            alternatives: item.alternatives.length > 0
              ? item.alternatives.map((alternative, alternativeIndex) => alternativeIndex === 0
                  ? { ...alternative, source: `${alternative.source ?? ''} changed` }
                  : alternative)
              : [{ id: 'synthetic', label: 'Synthetic', canonical: 'x', source: 'changed-source' }]
          }
        : item)
    };
    expect(issue).toBeDefined();
    expect(computePhraseReadingFingerprintV3(request, 'mock', 'model'))
      .not.toBe(computePhraseReadingFingerprintV3(changedEvidence, 'mock', 'model'));
    expect(computePhraseReadingFingerprintV3(request, 'mock', 'model'))
      .not.toBe(computePhraseReadingFingerprintV3(changedSource, 'mock', 'model'));
  });

  it('invalidates material semantic context and source changes', () => {
    const request = buildPhraseResolverRequest(transliterate('واژه دیگر', 'ijmes_citation_title'));
    expect(computePhraseReadingFingerprintV2(request, 'mock', 'model')).not.toBe(
      computePhraseReadingFingerprintV2({ ...request, contextKind: 'GENERAL_SCHOLARLY_TEXT' }, 'mock', 'model')
    );
    expect(computePhraseReadingFingerprintV2(request, 'mock', 'model')).not.toBe(
      computePhraseReadingFingerprintV2({ ...request, originalInput: `${request.originalInput} نو` }, 'mock', 'model')
    );
  });
});
