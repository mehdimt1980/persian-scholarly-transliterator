import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
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
  validateAssistedApplicability,
  validateProviderResolution
} from './index';
import { FakeAssistedResolverProvider } from '../../server/assistance/provider';
import { getAssistedResolverConfig, isOpenAiConfigured } from '../../server/assistance/configuration';
import { OpenAiAssistedResolverProvider } from '../../server/assistance/openaiProvider';
import { handleAssistRequest } from '../../server/assistance/handleAssistRequest';

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

      // Pure typed conversion with request fingerprint verification
      const humanDecision = candidateToReviewDecision(kirmCandidate, resolution, issue, request);
      expect(humanDecision.action).toBe('SELECT_LEXICAL_READING');
      expect(humanDecision.assistance?.suggestionId).toBe(kirmCandidate.id);
      expect(humanDecision.assistance?.requestFingerprint).toBe(resolution.requestFingerprint);

      const resolved = transliterate(input, 'ijmes_full', [humanDecision]);
      expect(resolved.copyable).toBe(true);
      expect(resolved.status).toBe('USER_OVERRIDE');
      expect(resolved.output).toBe('kirm');
      expect(resolved.tokens[0].status).toBe('USER_OVERRIDE');
      expect(resolved.tokens[0].canonicalTransliteration).toBe('kirm');
      expect(resolved.tokens[0].userDecision?.assistance?.suggestionId).toBe(kirmCandidate.id);
      expect(resolved.tokens[0].userDecision?.assistance?.provider).toBe('fake-provider');
      expect(resolved.tokens[0].userDecision?.assistance?.requestFingerprint).toBe(resolution.requestFingerprint);

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

      const decision = candidateToReviewDecision(manualCandidate, resolution, issue, request);
      expect(decision.action).toBe('MANUAL_CANONICAL_OVERRIDE');
      expect(decision.assistance?.requestFingerprint).toBe(resolution.requestFingerprint);

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

      const decision = candidateToReviewDecision(izafatCandidate!, resolution, issue, request);
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
            basis: 'MODEL_INFERENCE',
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

      const morphDecision = candidateToReviewDecision(morphCandidate, resolution, morphIssue, request);
      expect(morphDecision.action).toBe('SELECT_MORPHOLOGY');

      // Applying morphology decision resolves branch competition, but stem lexical ambiguity is recomputed!
      const postMorph = transliterate(input, 'ijmes_full', [morphDecision], repo);
      expect(postMorph.copyable).toBe(false);
      expect(postMorph.status).toBe('AMBIGUOUS');
      expect(postMorph.reviewIssues.length).toBe(1);
      expect(postMorph.reviewIssues[0].type).toBe('LEXICAL_AMBIGUITY');
    });
  });

  describe('Strict Authority Boundary & Request Fingerprint Verification (Sections 1, 2, 3, 11)', () => {
    it('11A. invalidates resolution when profile changes (ijmes_full to ijmes_title)', () => {
      const input = 'کرم';
      const initialFull = transliterate(input, 'ijmes_full');
      const issue = initialFull.reviewIssues[0];
      const requestFull = buildResolverRequest(initialFull, issue.id)!;

      const provider = new FakeAssistedResolverProvider();
      const resolution = {
        issueId: issue.id,
        candidates: [
          {
            id: 'sugg:1',
            kind: 'EXISTING_LEXICAL_READING' as const,
            alternativeId: requestFull.availableAlternatives[0].id,
            canonical: requestFull.availableAlternatives[0].canonical!,
            rank: 1,
            rationale: 'Good reading',
            basis: 'CONTEXTUAL_INFERENCE' as const,
            evidenceRefs: ['context:local-window']
          }
        ],
        provider: 'fake-provider',
        model: 'fake-model',
        promptVersion: requestFull.promptVersion,
        requestFingerprint: computeRequestFingerprint(requestFull, 'fake-provider', 'fake-model'),
        warnings: []
      };

      // Switch to ijmes_title -> produces different request fingerprint
      const initialTitle = transliterate(input, 'ijmes_title');
      const requestTitle = buildResolverRequest(initialTitle, issue.id)!;

      const applicability = validateAssistedApplicability(
        resolution.candidates[0],
        resolution,
        issue,
        requestTitle
      );
      expect(applicability.applicable).toBe(false);
      expect(applicability.reason).toBe('REQUEST_CHANGED');

      expect(() =>
        candidateToReviewDecision(resolution.candidates[0], resolution, issue, requestTitle)
      ).toThrow(/REQUEST_CHANGED/);
    });

    it('11B. invalidates resolution when review context changes on adjacent token', () => {
      const input = 'کرم کتاب';
      const initialA = transliterate(input, 'ijmes_full');
      const issueA = initialA.reviewIssues[0];
      const requestA = buildResolverRequest(initialA, issueA.id)!;

      const resolutionA: AssistedResolution = {
        issueId: issueA.id,
        candidates: [
          {
            id: 'sugg:kirm',
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: requestA.availableAlternatives[0].id,
            canonical: requestA.availableAlternatives[0].canonical!,
            rank: 1,
            rationale: 'Contextual reading',
            basis: 'CONTEXTUAL_INFERENCE',
            evidenceRefs: ['context:local-window']
          }
        ],
        provider: 'fake-provider',
        model: 'fake-model',
        promptVersion: requestA.promptVersion,
        requestFingerprint: computeRequestFingerprint(requestA, 'fake-provider', 'fake-model'),
        warnings: []
      };

      // State changes on input: "کرم دولت"
      const initialB = transliterate('کرم دولت', 'ijmes_full');
      const issueB = initialB.reviewIssues[0];
      const requestB = buildResolverRequest(initialB, issueB.id)!;

      const applicability = validateAssistedApplicability(
        resolutionA.candidates[0],
        resolutionA,
        issueB,
        requestB
      );
      expect(applicability.applicable).toBe(false);
    });

    it('11C. accepts suggestion when deterministic request fingerprint matches exactly', () => {
      const input = 'کرم';
      const initial = transliterate(input, 'ijmes_full');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const resolution: AssistedResolution = {
        issueId: issue.id,
        candidates: [
          {
            id: 'sugg:match',
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: request.availableAlternatives[0].id,
            canonical: request.availableAlternatives[0].canonical!,
            rank: 1,
            rationale: 'Matching suggestion',
            basis: 'CONTEXTUAL_INFERENCE',
            evidenceRefs: ['context:local-window']
          }
        ],
        provider: 'fake-p',
        model: 'fake-m',
        promptVersion: request.promptVersion,
        requestFingerprint: computeRequestFingerprint(request, 'fake-p', 'fake-m'),
        warnings: []
      };

      const applicability = validateAssistedApplicability(
        resolution.candidates[0],
        resolution,
        issue,
        request
      );
      expect(applicability.applicable).toBe(true);

      const decision = candidateToReviewDecision(resolution.candidates[0], resolution, issue, request);
      expect(decision.action).toBe('SELECT_LEXICAL_READING');
      expect(decision.assistance?.requestFingerprint).toBe(resolution.requestFingerprint);
    });

    it('11D. rejects candidate not in resolution payload', () => {
      const input = 'کرم';
      const initial = transliterate(input, 'ijmes_full');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const resolution: AssistedResolution = {
        issueId: issue.id,
        candidates: [
          {
            id: 'sugg:real',
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: request.availableAlternatives[0].id,
            canonical: request.availableAlternatives[0].canonical!,
            rank: 1,
            rationale: 'Real candidate',
            basis: 'CONTEXTUAL_INFERENCE',
            evidenceRefs: ['context:local-window']
          }
        ],
        provider: 'fake-p',
        model: 'fake-m',
        promptVersion: request.promptVersion,
        requestFingerprint: computeRequestFingerprint(request, 'fake-p', 'fake-m'),
        warnings: []
      };

      const fabricatedCandidate = {
        id: 'sugg:fake',
        kind: 'EXISTING_LEXICAL_READING' as const,
        alternativeId: 'other-id',
        canonical: 'other-canonical',
        rank: 2,
        rationale: 'Fabricated',
        basis: 'MODEL_INFERENCE' as const,
        evidenceRefs: []
      };

      const applicability = validateAssistedApplicability(
        fabricatedCandidate,
        resolution,
        issue,
        request
      );
      expect(applicability.applicable).toBe(false);
      expect(applicability.reason).toBe('CANDIDATE_NOT_IN_RESOLUTION');

      expect(() =>
        candidateToReviewDecision(fabricatedCandidate, resolution, issue, request)
      ).toThrow(/CANDIDATE_NOT_IN_RESOLUTION/);
    });

    it('11E. rejects spoofed lexical candidate payload that reuses valid id/rank but changes alternative/canonical', () => {
      const input = 'کرم';
      const initial = transliterate(input, 'ijmes_full');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const resolution: AssistedResolution = {
        issueId: issue.id,
        candidates: [
          {
            id: 'sugg:kirm',
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: 'reading:kirm',
            canonical: 'kirm',
            rank: 1,
            rationale: 'Validated suggestion for kirm',
            basis: 'CONTEXTUAL_INFERENCE',
            evidenceRefs: ['context:local-window']
          }
        ],
        provider: 'fake-p',
        model: 'fake-m',
        promptVersion: request.promptVersion,
        requestFingerprint: computeRequestFingerprint(request, 'fake-p', 'fake-m'),
        warnings: []
      };

      // Attacker reuses id, kind, rank but alters alternativeId/canonical to karam
      const spoofedCandidate = {
        id: 'sugg:kirm',
        kind: 'EXISTING_LEXICAL_READING' as const,
        alternativeId: 'reading:karam',
        canonical: 'karam',
        rank: 1,
        rationale: 'Spoofed payload for karam',
        basis: 'CONTEXTUAL_INFERENCE' as const,
        evidenceRefs: ['context:local-window']
      };

      const applicability = validateAssistedApplicability(spoofedCandidate, resolution, issue, request);
      expect(applicability.applicable).toBe(false);
      expect(applicability.reason).toBe('CANDIDATE_NOT_IN_RESOLUTION');

      expect(() =>
        candidateToReviewDecision(spoofedCandidate, resolution, issue, request)
      ).toThrow(/CANDIDATE_NOT_IN_RESOLUTION/);
    });

    it('11F. rejects spoofed manual canonical candidate that reuses valid id/rank but alters canonical', () => {
      const input = 'مشروطه‌خواهی';
      const initial = transliterate(input, 'ijmes_full');
      const issue = initial.reviewIssues[0] ?? {
        id: 'issue:unknown:0:0',
        type: 'UNKNOWN_TOKEN',
        surface: 'مشروطه‌خواهی',
        tokenIndexes: [0],
        allowedActions: ['MANUAL_CANONICAL_OVERRIDE'],
        alternatives: [],
        severity: 'ERROR',
        message: 'Unknown'
      };
      const request = buildResolverRequest(initial, issue.id) ?? {
        issueId: issue.id,
        issueType: issue.type,
        normalizedSurface: issue.surface,
        localContext: { before: [], target: issue.surface, after: [], fullWindow: issue.surface },
        availableAlternatives: [],
        allowedActions: issue.allowedActions,
        orthographicEvidence: { explicitVowels: [], unsupportedMarks: [], explicitIzafat: null, zwnjBoundaries: [] },
        evidenceCatalog: [],
        allowedEvidenceRefs: ['context:local-window'],
        lexicalSourceMetadata: [],
        profile: 'ijmes_full',
        promptVersion: 'v1'
      };

      const resolution: AssistedResolution = {
        issueId: issue.id,
        candidates: [
          {
            id: 'sugg:manual:1',
            kind: 'MANUAL_CANONICAL',
            canonical: 'mashrūṭa-khvāhī',
            rank: 1,
            rationale: 'Validated transliteration',
            basis: 'CONTEXTUAL_INFERENCE',
            evidenceRefs: ['context:local-window']
          }
        ],
        provider: 'fake-p',
        model: 'fake-m',
        promptVersion: request.promptVersion,
        requestFingerprint: computeRequestFingerprint(request, 'fake-p', 'fake-m'),
        warnings: []
      };

      // Attacker reuses id, kind, rank but alters canonical string
      const spoofedCandidate = {
        id: 'sugg:manual:1',
        kind: 'MANUAL_CANONICAL' as const,
        canonical: 'tampered-canonical',
        rank: 1,
        rationale: 'Validated transliteration',
        basis: 'CONTEXTUAL_INFERENCE' as const,
        evidenceRefs: ['context:local-window']
      };

      const applicability = validateAssistedApplicability(spoofedCandidate, resolution, issue, request);
      expect(applicability.applicable).toBe(false);
      expect(applicability.reason).toBe('CANDIDATE_NOT_IN_RESOLUTION');

      expect(() =>
        candidateToReviewDecision(spoofedCandidate, resolution, issue, request)
      ).toThrow(/CANDIDATE_NOT_IN_RESOLUTION/);
    });

    it('11G. rejects spoofed izafat decision that reuses valid id/rank but alters relationDecision', () => {
      const input = 'تاریخ ایران';
      const initial = transliterate(input, 'ijmes_full');
      const issue = initial.reviewIssues.find((i) => i.type === 'IZAFAT_CANDIDATE')!;
      const request = buildResolverRequest(initial, issue.id)!;

      const resolution: AssistedResolution = {
        issueId: issue.id,
        candidates: [
          {
            id: 'sugg:izafat:1',
            kind: 'IZAFAT_DECISION',
            relationDecision: 'ACCEPT_IZAFAT',
            rank: 1,
            rationale: 'Accept izafat construct',
            basis: 'MODEL_INFERENCE',
            evidenceRefs: []
          }
        ],
        provider: 'fake-p',
        model: 'fake-m',
        promptVersion: request.promptVersion,
        requestFingerprint: computeRequestFingerprint(request, 'fake-p', 'fake-m'),
        warnings: []
      };

      // Attacker tampers relationDecision to REJECT_IZAFAT
      const spoofedCandidate = {
        id: 'sugg:izafat:1',
        kind: 'IZAFAT_DECISION' as const,
        relationDecision: 'REJECT_IZAFAT' as const,
        rank: 1,
        rationale: 'Accept izafat construct',
        basis: 'MODEL_INFERENCE' as const,
        evidenceRefs: []
      };

      const applicability = validateAssistedApplicability(spoofedCandidate, resolution, issue, request);
      expect(applicability.applicable).toBe(false);
      expect(applicability.reason).toBe('CANDIDATE_NOT_IN_RESOLUTION');

      expect(() =>
        candidateToReviewDecision(spoofedCandidate, resolution, issue, request)
      ).toThrow(/CANDIDATE_NOT_IN_RESOLUTION/);
    });

    it('11H. stored resolution candidate succeeds when accepting by candidateId string', () => {
      const input = 'کرم';
      const initial = transliterate(input, 'ijmes_full');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const resolution: AssistedResolution = {
        issueId: issue.id,
        candidates: [
          {
            id: 'sugg:real:1',
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: request.availableAlternatives[0].id,
            canonical: request.availableAlternatives[0].canonical!,
            rank: 1,
            rationale: 'Stored candidate',
            basis: 'CONTEXTUAL_INFERENCE',
            evidenceRefs: ['context:local-window']
          }
        ],
        provider: 'fake-p',
        model: 'fake-m',
        promptVersion: request.promptVersion,
        requestFingerprint: computeRequestFingerprint(request, 'fake-p', 'fake-m'),
        warnings: []
      };

      const decision = candidateToReviewDecision(
        'sugg:real:1',
        resolution,
        issue,
        request
      );

      expect(decision.action).toBe('SELECT_LEXICAL_READING');
      expect(decision.selectedAlternativeId).toBe(request.availableAlternatives[0].id);
      expect(decision.manualCanonicalTransliteration).toBe(request.availableAlternatives[0].canonical);
      expect(decision.assistance?.suggestionId).toBe('sugg:real:1');
      expect(decision.assistance?.requestFingerprint).toBe(resolution.requestFingerprint);
    });
  });

  describe('Evidence Taxonomy & Semantic IDs (Sections 5, 6, 12)', () => {
    it('12A. ensures relation choices (ACCEPT_IZAFAT / REJECT_IZAFAT) are not classified as LEXICAL_SOURCE', () => {
      const input = 'تاریخ ایران';
      const result = transliterate(input);
      const issue = result.reviewIssues.find((i) => i.type === 'IZAFAT_CANDIDATE')!;
      expect(issue).toBeDefined();

      const request = buildResolverRequest(result, issue.id)!;
      expect(request).toBeDefined();

      // Check evidence catalog does not contain ACCEPT_IZAFAT or REJECT_IZAFAT as LEXICAL_SOURCE
      const lexicalSourceRefs = request.evidenceCatalog.filter((e) => e.kind === 'LEXICAL_SOURCE');
      expect(lexicalSourceRefs.some((e) => e.id === 'ACCEPT_IZAFAT')).toBe(false);
      expect(lexicalSourceRefs.some((e) => e.id === 'REJECT_IZAFAT')).toBe(false);
    });

    it('12B. ensures morphology branches (WHOLE_WORD / PRODUCTIVE_SEGMENTATION) are not classified as LEXICAL_SOURCE', () => {
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
      const result = transliterate('کتابها', 'ijmes_full', [], repo);
      const issue = result.reviewIssues[0];

      const request = buildResolverRequest(result, issue.id)!;
      const lexicalSourceRefs = request.evidenceCatalog.filter((e) => e.kind === 'LEXICAL_SOURCE');
      expect(lexicalSourceRefs.some((e) => e.id === 'WHOLE_WORD')).toBe(false);
      expect(lexicalSourceRefs.some((e) => e.id === 'PRODUCTIVE_SEGMENTATION')).toBe(false);
    });
  });

  describe('Basis & EvidenceRefs Consistency (Sections 7, 13)', () => {
    it('13A. rejects MODEL_INFERENCE candidate carrying evidence references', () => {
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const invalid = {
        issueId: request.issueId,
        candidates: [
          {
            kind: 'MANUAL_CANONICAL',
            canonical: 'kirm',
            rank: 1,
            rationale: 'General knowledge',
            basis: 'MODEL_INFERENCE',
            evidenceRefs: ['context:local-window'] // Invalid with MODEL_INFERENCE
          }
        ]
      };

      const val = validateProviderResolution(invalid, request, 'p', 'm');
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.includes('MODEL_INFERENCE must have empty evidenceRefs'))).toBe(true);
    });

    it('13B. rejects EXISTING_EVIDENCE candidate with empty evidence references', () => {
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const invalid = {
        issueId: request.issueId,
        candidates: [
          {
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: request.availableAlternatives[0].id,
            canonical: request.availableAlternatives[0].canonical,
            rank: 1,
            rationale: 'Claiming evidence with none',
            basis: 'EXISTING_EVIDENCE',
            evidenceRefs: [] // Invalid with EXISTING_EVIDENCE
          }
        ]
      };

      const val = validateProviderResolution(invalid, request, 'p', 'm');
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.includes('EXISTING_EVIDENCE" but specified no evidenceRefs'))).toBe(true);
    });

    it('13C. rejects CONTEXTUAL_INFERENCE candidate missing context:local-window', () => {
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const invalid = {
        issueId: request.issueId,
        candidates: [
          {
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: request.availableAlternatives[0].id,
            canonical: request.availableAlternatives[0].canonical,
            rank: 1,
            rationale: 'Contextual reasoning without window ref',
            basis: 'CONTEXTUAL_INFERENCE',
            evidenceRefs: [] // Missing context:local-window
          }
        ]
      };

      const val = validateProviderResolution(invalid, request, 'p', 'm');
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.includes('does not reference "context:local-window"'))).toBe(true);
    });
  });

  describe('Route-Level Sanitization Tests (Sections 9, 10)', () => {
    it('10A. returns 400 INVALID_REQUEST on malformed JSON body', async () => {
      const req = new NextRequest('http://localhost:3000/api/assist', {
        method: 'POST',
        body: 'invalid-json-{'
      });

      const res = await handleAssistRequest(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('INVALID_REQUEST');
      expect(json.message).toContain('not valid JSON');
    });

    it('10B. returns 400 STALE_ISSUE when requested issueId is not in transliteration state', async () => {
      const req = new NextRequest('http://localhost:3000/api/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: 'کرم',
          profile: 'ijmes_full',
          issueId: 'non-existent-issue-id'
        })
      });

      const res = await handleAssistRequest(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('STALE_ISSUE');
    });

    it('10C. returns 503 ASSISTANCE_UNAVAILABLE when OpenAI is not configured', async () => {
      const origKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const initial = transliterate('کرم');
        const issueId = initial.reviewIssues[0].id;

        const req = new NextRequest('http://localhost:3000/api/assist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: 'کرم',
            profile: 'ijmes_full',
            issueId
          })
        });

        const res = await handleAssistRequest(req);
        expect(res.status).toBe(503);
        const json = await res.json();
        expect(json.error).toBe('ASSISTANCE_UNAVAILABLE');
      } finally {
        if (origKey) process.env.OPENAI_API_KEY = origKey;
      }
    });

    it('10D. returns 502 ASSISTANCE_PROVIDER_ERROR without leaking upstream secrets or stack traces', async () => {
      const initial = transliterate('کرم');
      const issueId = initial.reviewIssues[0].id;

      // Mock provider that throws internal error containing sensitive information
      const mockProvider = new OpenAiAssistedResolverProvider('test-key', 'gpt-4o');
      (mockProvider as unknown as { client: { responses: { create: unknown } } }).client = {
        responses: {
          create: vi.fn().mockRejectedValue(new Error('Internal exception: sensitive key sk-proj-12345 leaked'))
        }
      };

      const req = new NextRequest('http://localhost:3000/api/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: 'کرم',
          profile: 'ijmes_full',
          issueId
        })
      });

      const res = await handleAssistRequest(req, mockProvider);
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.error).toBe('ASSISTANCE_PROVIDER_ERROR');
      expect(json.message).toBe('An error occurred during assisted candidate resolution.');
      // Secrets must never be present
      expect(JSON.stringify(json)).not.toContain('sk-proj-12345');
    });

    it('10E. returns 504 ASSISTANCE_TIMEOUT on request timeout', async () => {
      const initial = transliterate('کرم');
      const issueId = initial.reviewIssues[0].id;

      const mockProvider = new OpenAiAssistedResolverProvider('test-key', 'gpt-4o');
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      (mockProvider as unknown as { client: { responses: { create: unknown } } }).client = {
        responses: {
          create: vi.fn().mockRejectedValue(abortErr)
        }
      };

      const req = new NextRequest('http://localhost:3000/api/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: 'کرم',
          profile: 'ijmes_full',
          issueId
        })
      });

      const res = await handleAssistRequest(req, mockProvider);
      expect(res.status).toBe(504);
      const json = await res.json();
      expect(json.error).toBe('ASSISTANCE_TIMEOUT');
    });
  });

  describe('Focused Regression Suite (Section 21)', () => {
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
                      evidenceRefs: ['context:local-window']
                    }
                  ]
                })
              }
            ]
          }
        ]
      };

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

      expect(morphIssue.tokenIndexes[0]).toBe(2);

      const request = buildResolverRequest(result, morphIssue.id)!;
      expect(request).toBeDefined();
      expect(request.morphologyEvidence).toBeDefined();
      expect(request.morphologyEvidence?.isSegmented).toBe(true);
      expect(request.morphologyEvidence?.stem).toBe('کتاب');
    });

    it('4. includes explicit kasra and rule evidence in resolver orthographicEvidence payload', () => {
      const input = 'کِتاب';
      const result = transliterate(input);
      const analysis = result.analyses[0];
      expect(analysis.explicitVowels.length).toBeGreaterThan(0);
      expect(analysis.explicitVowels[0].mark).toBe('KASRA');

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
            canonical: 'karam',
            rank: 1,
            rationale: 'Conflicting candidate',
            basis: 'MODEL_INFERENCE',
            evidenceRefs: []
          }
        ]
      };

      const validation = validateProviderResolution(invalidPayload, request, 'prov', 'mod');
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('contradictory canonical'))).toBe(true);
    });

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
            basis: 'MODEL_INFERENCE',
            evidenceRefs: []
          },
          {
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: alt.id,
            canonical: alt.canonical,
            rank: 2,
            rationale: 'Duplicate semantic pick at rank 2',
            basis: 'MODEL_INFERENCE',
            evidenceRefs: []
          }
        ]
      };

      const validation = validateProviderResolution(invalidPayload, request, 'prov', 'mod');
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Duplicate semantic candidate detected'))).toBe(true);
    });

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
      const res = transliterate('کِرم', 'ijmes_full', [], repo);
      expect(res.status).toBe('AMBIGUOUS');
      const issue = res.reviewIssues[0];
      expect(issue).toBeDefined();
      expect(issue.alternatives.map((a) => a.canonical)).toEqual(['kirm', 'kerm']);

      const request = buildResolverRequest(res, issue.id)!;
      expect(request).toBeDefined();

      const invalidPayload = {
        issueId: request.issueId,
        candidates: [
          {
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: 'reading:karam',
            canonical: 'karam',
            rank: 1,
            rationale: 'Invalid excluded reading',
            basis: 'MODEL_INFERENCE',
            evidenceRefs: []
          }
        ]
      };

      const validation = validateProviderResolution(invalidPayload, request, 'prov', 'mod');
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('non-existent alternativeId'))).toBe(true);
    });

    it('10. aborts cleanly on timeout without mutating transliteration engine state', async () => {
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];
      const request = buildResolverRequest(initial, issue.id)!;

      const provider = new FakeAssistedResolverProvider();
      const controller = new AbortController();
      controller.abort();

      await expect(provider.resolve(request, controller.signal)).rejects.toThrow(/aborted/);

      const post = transliterate('کرم');
      expect(post.status).toBe('AMBIGUOUS');
      expect(post.copyable).toBe(false);
    });

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

    it('14. correctly maps each candidate kind to typed ReviewDecision and throws on invalid action', () => {
      const initial = transliterate('کرم');
      const issue = initial.reviewIssues[0];
      const currentRequest = buildResolverRequest(initial, issue.id)!;

      const resolution: AssistedResolution = {
        issueId: issue.id,
        candidates: [
          {
            id: 'sugg:1',
            kind: 'EXISTING_LEXICAL_READING',
            alternativeId: currentRequest.availableAlternatives[0].id,
            canonical: currentRequest.availableAlternatives[0].canonical!,
            rank: 1,
            rationale: 'context',
            basis: 'CONTEXTUAL_INFERENCE',
            evidenceRefs: ['context:local-window']
          }
        ],
        provider: 'mock-p',
        model: 'mock-m',
        promptVersion: currentRequest.promptVersion,
        requestFingerprint: computeRequestFingerprint(currentRequest, 'mock-p', 'mock-m'),
        warnings: []
      };

      const lexicalCandidate = resolution.candidates[0];
      const decision = candidateToReviewDecision(lexicalCandidate, resolution, issue, currentRequest);
      expect(decision.action).toBe('SELECT_LEXICAL_READING');
      expect(decision.selectedAlternativeId).toBe(currentRequest.availableAlternatives[0].id);
      expect(decision.assistance?.suggestionId).toBe('sugg:1');
      expect(decision.assistance?.requestFingerprint).toBe(resolution.requestFingerprint);

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

      const resolutionIzafat = {
        ...resolution,
        candidates: [izafatCandidate]
      };

      expect(() => candidateToReviewDecision(izafatCandidate, resolutionIzafat, issue, currentRequest)).toThrow(
        /ACTION_NOT_ALLOWED/
      );
    });

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
