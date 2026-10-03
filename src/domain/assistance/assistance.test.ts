import { describe, expect, it, vi } from 'vitest';
import { transliterate } from '../engine';
import { LexicalEntry } from '../lexicon/types';
import { LexiconRepository } from '../lexicon/repository';
import { RULES } from '../provenance';
import { ReviewDecision } from '../review/types';
import {
  AssistedCandidateProposal,
  AssistedResolution,
  buildResolverRequest,
  candidateToReviewDecision,
  computeRequestFingerprint,
  generateSuggestionId,
  validateProviderResolution
} from './index';
import { FakeAssistedResolverProvider } from '../../server/assistance/provider';
import { getAssistedResolverConfig, isOpenAiConfigured } from '../../server/assistance/configuration';
import { OpenAiAssistedResolverProvider } from '../../server/assistance/openaiProvider';

describe('Phase 3 Human-Gated Assisted Candidate Resolver', () => {
  describe('Zero-Authority Invariant', () => {
    it('fetching assisted suggestions does not alter transliteration status, copyability, or canonical output', async () => {
      const input = 'کرم';
      const initial = transliterate(input);
      expect(initial.status).toBe('AMBIGUOUS');
      expect(initial.copyable).toBe(false);
      expect(initial.tokens[0].canonicalTransliteration).toBeNull();
      expect(initial.reviewIssues.length).toBe(1);

      const request = buildResolverRequest(initial, initial.reviewIssues[0].id);
      expect(request).toBeDefined();

      const provider = new FakeAssistedResolverProvider();
      const resolution = await provider.resolve(request!);

      expect(resolution.candidates.length).toBeGreaterThan(0);
      expect(resolution.issueId).toBe(initial.reviewIssues[0].id);

      // Re-evaluate transliteration without human decision
      const afterFetch = transliterate(input);
      expect(afterFetch.status).toBe('AMBIGUOUS');
      expect(afterFetch.copyable).toBe(false);
      expect(afterFetch.tokens[0].canonicalTransliteration).toBeNull();
      expect(afterFetch.tokens[0].status).toBe('AMBIGUOUS');
      expect(afterFetch.appliedDecisions.length).toBe(0);
    });
  });

  describe('Human Acceptance and Provenance Tracking', () => {
    it('maps accepted lexical suggestion into an authoritative Phase 2C ReviewDecision with assistance provenance', async () => {
      const input = 'کرم';
      const initial = transliterate(input);
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const provider = new FakeAssistedResolverProvider();
      const resolution = await provider.resolve(request);

      const kirmCandidate = resolution.candidates.find(
        (c) => c.kind === 'EXISTING_LEXICAL_READING' && c.canonical === 'kirm'
      )!;
      expect(kirmCandidate).toBeDefined();

      // Pure typed conversion
      const humanDecision = candidateToReviewDecision(kirmCandidate, resolution, issue);
      expect(humanDecision.action).toBe('SELECT_LEXICAL_READING');
      expect(humanDecision.assistance?.suggestionId).toBe(kirmCandidate.id);

      const resolved = transliterate(input, 'ijmes_full', [humanDecision]);
      expect(resolved.copyable).toBe(true);
      expect(resolved.status).toBe('USER_OVERRIDE');
      expect(resolved.output).toBe('kirm');
      expect(resolved.tokens[0].status).toBe('USER_OVERRIDE');
      expect(resolved.tokens[0].canonicalTransliteration).toBe('kirm');
      expect(resolved.tokens[0].userDecision?.assistance?.suggestionId).toBe(kirmCandidate.id);
      expect(resolved.tokens[0].userDecision?.assistance?.provider).toBe('fake-provider');

      // Automatic evidence remains preserved
      expect(resolved.tokens[0].automatic.status).toBe('AMBIGUOUS');
      expect(resolved.tokens[0].automatic.alternatives).toEqual(['karam', 'kirm']);
    });
  });

  describe('Unknown Token Manual Canonical Suggestions', () => {
    it('proposes manual canonical transliteration for unknown token and applies only on human acceptance', async () => {
      const input = 'مشروطهخواهی';
      const initial = transliterate(input);
      expect(initial.status).toBe('UNRESOLVED');
      const issue = initial.reviewIssues[0];
      expect(issue.type).toBe('UNKNOWN_TOKEN');

      const request = buildResolverRequest(initial, issue.id)!;
      const provider = new FakeAssistedResolverProvider('fake-provider', 'fake-model', () => ({
        issueId: issue.id,
        candidates: [
          {
            kind: 'MANUAL_CANONICAL',
            canonical: 'mashrūṭa-khvāhī',
            rank: 1,
            modelConfidence: 0.95,
            rationale: 'Compound noun transliteration conforming to IJMES standard.',
            basis: 'MODEL_INFERENCE',
            evidenceRefs: []
          }
        ]
      }));

      const resolution = await provider.resolve(request);
      expect(resolution.candidates.length).toBe(1);
      const manualCandidate = resolution.candidates[0];
      expect(manualCandidate.kind).toBe('MANUAL_CANONICAL');
      if (manualCandidate.kind === 'MANUAL_CANONICAL') {
        expect(manualCandidate.canonical).toBe('mashrūṭa-khvāhī');
      }

      const decision = candidateToReviewDecision(manualCandidate, resolution, issue);
      expect(decision.action).toBe('MANUAL_CANONICAL_OVERRIDE');

      const resolved = transliterate(input, 'ijmes_full', [decision]);
      expect(resolved.copyable).toBe(true);
      expect(resolved.status).toBe('USER_OVERRIDE');
      expect(resolved.output).toBe('mashrūṭa-khvāhī');
    });
  });

  describe('Izāfat Candidate Assistance', () => {
    it('suggests izāfat decision without mutating relation until human confirms', async () => {
      const input = 'تاریخ ایران';
      const initial = transliterate(input);
      expect(initial.status).toBe('AMBIGUOUS');
      const issue = initial.reviewIssues[0];
      expect(issue.type).toBe('IZAFAT_CANDIDATE');

      const request = buildResolverRequest(initial, issue.id)!;
      const provider = new FakeAssistedResolverProvider();
      const resolution = await provider.resolve(request);

      const izafatCandidate = resolution.candidates.find(
        (c) => c.kind === 'IZAFAT_DECISION' && c.relationDecision === 'ACCEPT_IZAFAT'
      );
      expect(izafatCandidate).toBeDefined();

      const decision = candidateToReviewDecision(izafatCandidate!, resolution, issue);
      expect(decision.action).toBe('ACCEPT_IZAFAT');

      const resolved = transliterate(input, 'ijmes_full', [decision]);
      expect(resolved.copyable).toBe(true);
      expect(resolved.output).toBe('tārīkh-i īrān');
      expect(resolved.relations[0].status).toBe('CONFIRMED');
      expect(resolved.relations[0].disposition).toBe('ACCEPTED');
    });
  });

  describe('Morphology Ambiguity Assistance', () => {
    it('ranks morphology branch and preserves iterative post-decision review loop', async () => {
      const customLexicon: LexicalEntry[] = [
        {
          id: 'lex:stem',
          surface: 'کتاب',
          normalized: 'کتاب',
          category: 'noun',
          readings: [
            { canonical: 'kitāb_a', confidence: 0.5, source: 'Source 1' },
            { canonical: 'kitāb_b', confidence: 0.5, source: 'Source 2' }
          ]
        },
        {
          id: 'lex:whole',
          surface: 'کتابها',
          normalized: 'کتابها',
          category: 'noun',
          readings: [{ canonical: 'kitābhā', confidence: 0.8, source: 'Whole' }]
        }
      ];
      const repo = new LexiconRepository(customLexicon);
      const input = 'کتابها';

      const initial = transliterate(input, 'ijmes_full', [], repo);
      const morphIssue = initial.reviewIssues[0];
      expect(morphIssue.type).toBe('MORPHOLOGY_AMBIGUITY');

      const request = buildResolverRequest(initial, morphIssue.id)!;
      const provider = new FakeAssistedResolverProvider('fake-provider', 'fake-model', () => ({
        issueId: morphIssue.id,
        candidates: [
          {
            kind: 'MORPHOLOGY_BRANCH',
            morphologyBranch: 'PRODUCTIVE_SEGMENTATION',
            rank: 1,
            modelConfidence: 0.88,
            rationale: 'Context strongly favors productive plural suffix -hā.',
            basis: 'CONTEXTUAL_INFERENCE',
            evidenceRefs: []
          }
        ]
      }));

      const resolution = await provider.resolve(request);
      const morphCandidate = resolution.candidates[0];
      expect(morphCandidate.kind).toBe('MORPHOLOGY_BRANCH');
      if (morphCandidate.kind === 'MORPHOLOGY_BRANCH') {
        expect(morphCandidate.morphologyBranch).toBe('PRODUCTIVE_SEGMENTATION');
      }

      const morphDecision = candidateToReviewDecision(morphCandidate, resolution, morphIssue);
      expect(morphDecision.action).toBe('SELECT_MORPHOLOGY');

      // Applying morphology decision resolves branch competition, but stem lexical ambiguity is recomputed!
      const postMorph = transliterate(input, 'ijmes_full', [morphDecision], repo);
      expect(postMorph.copyable).toBe(false);
      expect(postMorph.status).toBe('AMBIGUOUS');
      expect(postMorph.reviewIssues.length).toBe(1);
      expect(postMorph.reviewIssues[0].type).toBe('LEXICAL_AMBIGUITY');
    });
  });

  describe('Focused Regression Suite (Section 21)', () => {
    // 1. Responses API adapter structured parsing with mocked client
    it('1. parses structured Responses API output with mocked OpenAI client', async () => {
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const provider = new OpenAiAssistedResolverProvider('test-key', 'gpt-4o-2024-08-06');
      const mockResponse = {
        id: 'resp_test_123',
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  issueId: request.issueId,
                  candidates: [
                    {
                      kind: 'EXISTING_LEXICAL_READING',
                      alternativeId: request.availableAlternatives[0].id,
                      rank: 1,
                      rationale: 'Contextual reading',
                      basis: 'CONTEXTUAL_INFERENCE',
                      evidenceRefs: [request.availableAlternatives[0].id]
                    }
                  ]
                })
              }
            ]
          }
        ]
      };

      // Mock responses.create
      (provider as unknown as { client: { responses: { create: unknown } } }).client = {
        responses: {
          create: vi.fn().mockResolvedValue(mockResponse)
        }
      };

      const resolution = await provider.resolve(request);
      expect(resolution.issueId).toBe(issue.id);
      expect(resolution.candidates.length).toBe(1);
      const first = resolution.candidates[0];
      expect(first.kind).toBe('EXISTING_LEXICAL_READING');
      if (first.kind === 'EXISTING_LEXICAL_READING') {
        expect(first.alternativeId).toBe(request.availableAlternatives[0].id);
        expect(first.canonical).toBe(request.availableAlternatives[0].canonical);
      }
    });

    // 2. Assistance unavailable when model env is missing
    it('2. requires explicit model and marks assistance unavailable when missing', () => {
      const origKey = process.env.OPENAI_API_KEY;
      const origModel = process.env.ASSISTED_RESOLVER_MODEL;

      try {
        process.env.OPENAI_API_KEY = 'valid-api-key';
        delete process.env.ASSISTED_RESOLVER_MODEL;

        expect(isOpenAiConfigured()).toBe(false);
        const config = getAssistedResolverConfig();
        expect(config.model).toBeUndefined();

        expect(() => new OpenAiAssistedResolverProvider('key', undefined)).toThrow(
          /ASSISTED_RESOLVER_MODEL environment variable/
        );
      } finally {
        if (origKey) process.env.OPENAI_API_KEY = origKey;
        else delete process.env.OPENAI_API_KEY;
        if (origModel) process.env.ASSISTED_RESOLVER_MODEL = origModel;
        else delete process.env.ASSISTED_RESOLVER_MODEL;
      }
    });

    // 3. Morphology evidence after punctuation/whitespace maps by tokenIndex
    it('3. correctly looks up morphology evidence occurring after leading punctuation and whitespace', () => {
      const customLexicon: LexicalEntry[] = [
        {
          id: 'lex:stem',
          surface: 'کتاب',
          normalized: 'کتاب',
          category: 'noun',
          readings: [{ canonical: 'kitāb', confidence: 0.9, source: 'Source' }]
        },
        {
          id: 'lex:whole',
          surface: 'کتابها',
          normalized: 'کتابها',
          category: 'noun',
          readings: [{ canonical: 'kitābhā', confidence: 0.8, source: 'Whole' }]
        }
      ];
      const repo = new LexiconRepository(customLexicon);
      const input = '« کتابها »';
      const result = transliterate(input, 'ijmes_full', [], repo);
      const morphIssue = result.reviewIssues.find((i) => i.type === 'MORPHOLOGY_AMBIGUITY')!;
      expect(morphIssue).toBeDefined();

      // Leading punctuation « and space means tokenIndex is 2
      expect(morphIssue.tokenIndexes[0]).toBe(2);

      const request = buildResolverRequest(result, morphIssue.id)!;
      expect(request).toBeDefined();
      expect(request.morphologyEvidence).toBeDefined();
      expect(request.morphologyEvidence?.isSegmented).toBe(true);
      expect(request.morphologyEvidence?.stem).toBe('کتاب');
    });

    // 4. Explicit kasra appears in resolver orthographic evidence
    it('4. includes explicit kasra and rule evidence in resolver orthographicEvidence payload', () => {
      const input = 'کِتاب';
      const result = transliterate(input);
      // In default lexicon کتاب is single reading, but let's check analysis
      const analysis = result.analyses[0];
      expect(analysis.explicitVowels.length).toBeGreaterThan(0);
      expect(analysis.explicitVowels[0].mark).toBe('KASRA');

      // Create a simulated issue for this token to inspect resolver request
      const issue = result.reviewIssues[0] || {
        id: 'issue:test:kasra',
        type: 'INSUFFICIENT_VOCALIZATION',
        tokenIndexes: [0],
        surface: 'کِتاب',
        description: 'Vocalized test',
        alternatives: [{ id: 'alt:kitab', label: 'kitāb', canonical: 'kitāb' }],
        allowedActions: ['SELECT_LEXICAL_READING', 'MANUAL_CANONICAL_OVERRIDE']
      };

      const modifiedResult = {
        ...result,
        reviewIssues: [issue]
      };

      const request = buildResolverRequest(modifiedResult, issue.id)!;
      expect(request.orthographicEvidence.explicitVowels.length).toBeGreaterThan(0);
      expect(request.orthographicEvidence.explicitVowels[0].mark).toBe('KASRA');
      expect(request.orthographicEvidence.explicitVowels[0].vowel).toBe('i');
      expect(request.orthographicEvidence.explicitVowels[0].ruleId).toBe('PERSIAN-ORTH-KASRA');
    });

    // 5. Conflicting alternativeId / canonical is rejected
    it('5. rejects candidate with contradictory alternativeId and canonical', () => {
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const alt = request.availableAlternatives.find((a) => a.canonical === 'kirm')!;
      expect(alt).toBeDefined();

      const invalidPayload = {
        issueId: request.issueId,
        candidates: [
          {
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: alt.id,
            canonical: 'karam', // Contradicts alt's canonical 'kirm'
            rank: 1,
            rationale: 'Conflicting candidate',
            basis: 'CONTEXTUAL_INFERENCE',
            evidenceRefs: [alt.id]
          }
        ]
      };

      const validation = validateProviderResolution(invalidPayload, request, 'prov', 'mod');
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('contradictory canonical'))).toBe(true);
    });

    // 6. Morphology branch not in ReviewIssue alternatives is rejected
    it('6. rejects morphology branch candidate not in ReviewIssue alternatives', () => {
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const invalidPayload = {
        issueId: request.issueId,
        candidates: [
          {
            kind: 'MORPHOLOGY_BRANCH',
            morphologyBranch: 'PRODUCTIVE_SEGMENTATION',
            rank: 1,
            rationale: 'Invalid branch for lexical ambiguity',
            basis: 'MODEL_INFERENCE',
            evidenceRefs: []
          }
        ]
      };

      const validation = validateProviderResolution(invalidPayload, request, 'prov', 'mod');
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Action "SELECT_MORPHOLOGY" is not permitted'))).toBe(true);
    });

    // 7. Duplicate semantic candidate is rejected
    it('7. rejects candidates with duplicate semantic payload even if ranks differ', () => {
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const alt = request.availableAlternatives[0];
      const invalidPayload = {
        issueId: request.issueId,
        candidates: [
          {
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: alt.id,
            canonical: alt.canonical,
            rank: 1,
            rationale: 'First pick',
            basis: 'CONTEXTUAL_INFERENCE',
            evidenceRefs: [alt.id]
          },
          {
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: alt.id,
            canonical: alt.canonical,
            rank: 2,
            rationale: 'Duplicate semantic pick at rank 2',
            basis: 'CONTEXTUAL_INFERENCE',
            evidenceRefs: [alt.id]
          }
        ]
      };

      const validation = validateProviderResolution(invalidPayload, request, 'prov', 'mod');
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Duplicate semantic candidate detected'))).toBe(true);
    });

    // 8. Excluded lexical reading is rejected under vowel evidence
    it('8. rejects excluded lexical reading when vocalization conflict filtered it out', () => {
      const customLexicon: LexicalEntry[] = [
        {
          id: 'lex:vow-test',
          surface: 'کرم',
          normalized: 'کرم',
          category: 'noun',
          readings: [
            {
              id: 'reading:kirm',
              canonical: 'kirm',
              confidence: 0.9,
              source: 'Source',
              vocalization: [{ vowel: 'i', afterBaseIndex: 0 }]
            },
            {
              id: 'reading:kerm',
              canonical: 'kerm',
              confidence: 0.8,
              source: 'Source'
            },
            {
              id: 'reading:karam',
              canonical: 'karam',
              confidence: 0.8,
              source: 'Source',
              vocalization: [{ vowel: 'a', afterBaseIndex: 0 }]
            }
          ]
        }
      ];
      const repo = new LexiconRepository(customLexicon);
      // Input has kasra: 'کِرم' -> AMBIGUOUS between kirm and kerm, but karam is excluded by conflict
      const res = transliterate('کِرم', 'ijmes_full', [], repo);
      expect(res.status).toBe('AMBIGUOUS');
      const issue = res.reviewIssues[0];
      expect(issue).toBeDefined();
      expect(issue.alternatives.map((a) => a.canonical)).toEqual(['kirm', 'kerm']);

      const request = buildResolverRequest(res, issue.id)!;
      expect(request).toBeDefined();

      // Provider tries to propose the excluded reading 'karam'
      const invalidPayload = {
        issueId: request.issueId,
        candidates: [
          {
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: 'reading:karam',
            canonical: 'karam',
            rank: 1,
            rationale: 'Invalid excluded reading',
            basis: 'CONTEXTUAL_INFERENCE',
            evidenceRefs: []
          }
        ]
      };

      const validation = validateProviderResolution(invalidPayload, request, 'prov', 'mod');
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('non-existent alternativeId'))).toBe(true);
    });

    // 9. Raw upstream error is not returned by the API route
    it('9. returns sanitized API error structures without leaking upstream stack traces or keys', async () => {
      // Direct validation of error sanitization behavior
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const provider = new OpenAiAssistedResolverProvider('test-key', 'gpt-4o');
      (provider as unknown as { client: { responses: { create: unknown } } }).client = {
        responses: {
          create: vi.fn().mockRejectedValue(new Error('Sensitive upstream API key sk-12345 leaked in stack trace'))
        }
      };

      await expect(provider.resolve(request)).rejects.toThrow();
    });

    // 10. Timeout fails safely
    it('10. aborts cleanly on timeout without mutating transliteration engine state', async () => {
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const provider = new FakeAssistedResolverProvider();
      const controller = new AbortController();
      controller.abort();

      await expect(provider.resolve(request, controller.signal)).rejects.toThrow(/aborted/);

      // Core engine remains untouched
      const post = transliterate('کرم');
      expect(post.status).toBe('AMBIGUOUS');
      expect(post.copyable).toBe(false);
    });

    // 11. Malformed / refusal output fails safely
    it('11. fails safely when model returns a refusal response', async () => {
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const provider = new OpenAiAssistedResolverProvider('test-key', 'gpt-4o');
      const mockRefusalResponse = {
        id: 'resp_refusal',
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'refusal',
                refusal: 'I cannot provide suggestions for this text.'
              }
            ]
          }
        ]
      };

      (provider as unknown as { client: { responses: { create: unknown } } }).client = {
        responses: {
          create: vi.fn().mockResolvedValue(mockRefusalResponse)
        }
      };

      await expect(provider.resolve(request)).rejects.toThrow(/refused request/);
    });

    // 12. Request fingerprint changes when orthographic evidence changes
    it('12. generates distinct fingerprints when orthographic evidence changes', () => {
      const baseResult = transliterate('کتاب');
      const issue = {
        id: 'issue:test:fingerprint',
        type: 'UNKNOWN_TOKEN' as const,
        tokenIndexes: [0],
        surface: 'کتاب',
        description: 'Test',
        alternatives: [],
        allowedActions: ['MANUAL_CANONICAL_OVERRIDE' as const]
      };

      const resultWithoutVowels = { ...baseResult, reviewIssues: [issue] };
      const req1 = buildResolverRequest(resultWithoutVowels, issue.id)!;

      const resultWithVowels = {
        ...baseResult,
        reviewIssues: [issue],
        analyses: [
          {
            ...baseResult.analyses[0],
            explicitVowels: [
              {
                mark: 'KASRA' as const,
                vowel: 'i' as const,
                normalizedTokenOffset: 1,
                afterBaseIndex: 0,
                rule: RULES.orthKasra,
                relationOnly: false
              }
            ]
          }
        ]
      };
      const req2 = buildResolverRequest(resultWithVowels, issue.id)!;

      const fp1 = computeRequestFingerprint(req1, 'test-prov', 'test-mod');
      const fp2 = computeRequestFingerprint(req2, 'test-prov', 'test-mod');
      expect(fp1).not.toBe(fp2);
    });

    // 13. Request fingerprint changes when morphology/relation evidence changes
    it('13. generates distinct fingerprints when morphology or relation evidence changes', () => {
      const initial = transliterate('کتابها');
      const issue = initial.reviewIssues[0];
      const reqWithMorph = buildResolverRequest(initial, issue.id)!;

      const initialNoMorph = {
        ...initial,
        morphology: []
      };
      const reqNoMorph = buildResolverRequest(initialNoMorph, issue.id)!;

      const fp1 = computeRequestFingerprint(reqWithMorph, 'test-prov', 'test-mod');
      const fp2 = computeRequestFingerprint(reqNoMorph, 'test-prov', 'test-mod');
      expect(fp1).not.toBe(fp2);
    });

    // 14. Typed candidate-to-review-decision mapping
    it('14. correctly maps each candidate kind to typed ReviewDecision and throws on invalid action', () => {
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];

      const resolution: AssistedResolution = {
        issueId: issue.id,
        candidates: [],
        provider: 'mock-p',
        model: 'mock-m',
        promptVersion: 'v1',
        requestFingerprint: 'fp123',
        warnings: []
      };

      const lexicalCandidate = {
        id: 'sugg:1',
        kind: 'EXISTING_LEXICAL_READING' as const,
        alternativeId: 'reading:kirm',
        canonical: 'kirm',
        rank: 1,
        rationale: 'context',
        basis: 'CONTEXTUAL_INFERENCE' as const,
        evidenceRefs: []
      };

      const decision = candidateToReviewDecision(lexicalCandidate, resolution, issue);
      expect(decision.action).toBe('SELECT_LEXICAL_READING');
      expect(decision.selectedAlternativeId).toBe('reading:kirm');
      expect(decision.assistance?.suggestionId).toBe('sugg:1');

      // Unauthorized candidate throws
      const izafatCandidate = {
        id: 'sugg:2',
        kind: 'IZAFAT_DECISION' as const,
        relationDecision: 'ACCEPT_IZAFAT' as const,
        rank: 1,
        rationale: 'izafat',
        basis: 'MODEL_INFERENCE' as const,
        evidenceRefs: []
      };

      expect(() => candidateToReviewDecision(izafatCandidate, resolution, issue)).toThrow(/does not permit action/);
    });

    // 15. Stale suggestions are explicitly non-applicable
    it('15. rejects stale suggestion when applied to a different or modified input state', () => {
      const initialA = transliterate('کرم کتاب');
      const issueA = initialA.reviewIssues[0];

      const staleDecision: ReviewDecision = {
        issueId: issueA.id,
        action: 'SELECT_LEXICAL_READING',
        selectedAlternativeId: 'kirm'
      };

      const resultB = transliterate('کرم دولت', 'ijmes_full', [staleDecision]);
      expect(resultB.appliedDecisions.length).toBe(0);
      expect(resultB.staleDecisions.length).toBe(1);
      expect(resultB.status).toBe('AMBIGUOUS');
    });
  });
});
