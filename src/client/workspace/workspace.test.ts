import { describe, expect, it } from 'vitest';
import {
  parseTransliterationWorkspace,
  parseBibliographyWorkspace,
  validateAndMigrateTransliterationWorkspace,
  validateAndMigrateBibliographyWorkspace,
  toPersistedAcceptedPhraseDecision,
  fromPersistedAcceptedPhraseDecision
} from './validation';
import {
  createDefaultTransliterationWorkspace,
  createDefaultBibliographyWorkspace
} from './defaults';
import { transliterate } from '../../domain/engine';
import {
  resolveSelectedTransliteration,
  buildPhraseResolverRequest,
  computePhraseRequestFingerprint
} from '../../domain/assistance';
import { processBibliographyBatch } from '../../domain/bibliography/processBatch';
import type { ReviewDecision } from '../../domain/types';
import type { AcceptedPhraseDecision } from '../../domain/assistance/phraseTypes';
import type { BibliographyRecord } from '../../domain/bibliography/types';
import type { PersistedAcceptedPhraseDecisionV1 } from './types';

describe('Local Research Workspace Persistence', () => {
  describe('Schema Validation and Safe Migration', () => {
    it('validates and round-trips a valid TransliterationWorkspaceV1', () => {
      const original = {
        schemaVersion: 1 as const,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'تاریخ بیداری ایرانیان',
        profile: 'ijmes_citation_title' as const,
        reviewDecisions: [
          {
            issueId: 'issue-1',
            action: 'SELECT_LEXICAL_READING' as const,
            selectedAlternativeId: 'alt-1'
          }
        ],
        acceptedPhraseDecision: null
      };

      const validated = validateAndMigrateTransliterationWorkspace(original);
      expect(validated).toEqual(original);
    });

    it('migrates legacy ijmes_title in stored workspace to ijmes_citation_title', () => {
      const legacy = {
        schemaVersion: 1,
        updatedAt: '2026-10-05T12:00:00.000Z',
        input: 'سیاست‌نامه',
        profile: 'ijmes_title',
        reviewDecisions: [],
        acceptedPhraseDecision: null
      };

      const validated = validateAndMigrateTransliterationWorkspace(legacy);
      expect(validated.profile).toBe('ijmes_citation_title');
    });

    it('falls back safely to default profile when an unknown profile is encountered', () => {
      const invalid = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'ایران',
        profile: 'unknown_custom_profile',
        reviewDecisions: [],
        acceptedPhraseDecision: null
      };

      const validated = validateAndMigrateTransliterationWorkspace(invalid);
      expect(validated.profile).toBe('ijmes_citation_title');
    });

    it('does NOT coerce unknown future schemaVersion to V1 (returns UNSUPPORTED_SCHEMA)', () => {
      const futureWorkspace = {
        schemaVersion: 2,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'متن پیشرفته در نگارش ۲',
        profile: 'ijmes_full',
        futureField: 'special_metadata'
      };

      const parseRes = parseTransliterationWorkspace(futureWorkspace);
      expect(parseRes.success).toBe(false);
      if (!parseRes.success) {
        expect(parseRes.reason).toBe('UNSUPPORTED_SCHEMA');
        expect(parseRes.rawVersion).toBe(2);
      }

      const futureBib = {
        schemaVersion: 999,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: 'something'
      };

      const bibParseRes = parseBibliographyWorkspace(futureBib);
      expect(bibParseRes.success).toBe(false);
      if (!bibParseRes.success) {
        expect(bibParseRes.reason).toBe('UNSUPPORTED_SCHEMA');
        expect(bibParseRes.rawVersion).toBe(999);
      }
    });

    it('returns default transliteration workspace on null or corrupted input', () => {
      const def = createDefaultTransliterationWorkspace();
      expect(validateAndMigrateTransliterationWorkspace(null).input).toBe(def.input);
      expect(validateAndMigrateTransliterationWorkspace('corrupted-string').profile).toBe('ijmes_citation_title');
      expect(validateAndMigrateTransliterationWorkspace({}).input).toBe(def.input);
    });
  });

  describe('Accepted Phrase Decision Provenance and Invariants', () => {
    it('persists AcceptedPhraseDecision without renderedOutput and recomputes rendering on hydration', () => {
      const runtimeDecision: AcceptedPhraseDecision = {
        source: 'AI_ASSISTED_PHRASE',
        acceptance: 'HUMAN_ACCEPTED_AI_SUGGESTION',
        originalInput: 'شبهای تیره در فراموشخانه اشباح',
        normalizedInput: 'شبهای تیره در فراموشخانه اشباح',
        profile: 'ijmes_citation_title',
        scholarlyCanonical: 'shabhā-yi tīra dar farāmūshkhāna-yi ashbāḥ',
        renderedOutput: 'OLD_STALE_CACHED_RENDERING_DO_NOT_PERSIST',
        provider: 'openai',
        model: 'gpt-4o',
        promptVersion: 'v1',
        requestFingerprint: 'fp-12345',
        modelConfidence: 0.95,
        acceptedAt: '2026-10-06T12:00:00.000Z'
      };

      const persisted = toPersistedAcceptedPhraseDecision(runtimeDecision);
      expect((persisted as any).renderedOutput).toBeUndefined();
      expect(persisted.scholarlyCanonical).toBe('shabhā-yi tīra dar farāmūshkhāna-yi ashbāḥ');

      // Hydration for ijmes_citation_title re-derives fresh citation-title rendering
      const hydratedCitation = fromPersistedAcceptedPhraseDecision(persisted, 'ijmes_citation_title');
      expect(hydratedCitation.renderedOutput).toBe('Shabhā-yi Tīra Dar Farāmūshkhāna-yi Ashbāḥ');
      expect(hydratedCitation.renderedOutput).not.toBe('OLD_STALE_CACHED_RENDERING_DO_NOT_PERSIST');

      // Hydration for ijmes_full re-derives full canonical rendering
      const hydratedFull = fromPersistedAcceptedPhraseDecision(persisted, 'ijmes_full');
      expect(hydratedFull.renderedOutput).toBe('shabhā-yi tīra dar farāmūshkhāna-yi ashbāḥ');
    });

    it('rejects accepted phrase decision when provenance is missing (never fabricates AI provenance)', () => {
      const missingProvider = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'ایران',
        profile: 'ijmes_citation_title',
        reviewDecisions: [],
        acceptedPhraseDecision: {
          source: 'AI_ASSISTED_PHRASE',
          acceptance: 'HUMAN_ACCEPTED_AI_SUGGESTION',
          originalInput: 'ایران',
          normalizedInput: 'ایران',
          profile: 'ijmes_citation_title',
          scholarlyCanonical: 'īrān',
          // provider missing!
          model: 'gpt-4o',
          promptVersion: 'v1',
          requestFingerprint: 'fp-123',
          acceptedAt: '2026-10-06T12:00:00.000Z'
        }
      };

      const validated = validateAndMigrateTransliterationWorkspace(missingProvider);
      expect(validated.acceptedPhraseDecision).toBeNull();
    });

    it('rejects accepted phrase decision with invalid modelConfidence or missing fingerprint', () => {
      const invalidConfidence = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'ایران',
        profile: 'ijmes_citation_title',
        reviewDecisions: [],
        acceptedPhraseDecision: {
          source: 'AI_ASSISTED_PHRASE',
          acceptance: 'HUMAN_ACCEPTED_AI_SUGGESTION',
          originalInput: 'ایران',
          normalizedInput: 'ایران',
          profile: 'ijmes_citation_title',
          scholarlyCanonical: 'īrān',
          provider: 'openai',
          model: 'gpt-4o',
          promptVersion: 'v1',
          requestFingerprint: 'fp-123',
          modelConfidence: 1.5, // Invalid > 1
          acceptedAt: '2026-10-06T12:00:00.000Z'
        }
      };

      const validated = validateAndMigrateTransliterationWorkspace(invalidConfidence);
      expect(validated.acceptedPhraseDecision).toBeNull();
    });

    it('accepts valid null modelConfidence without fabricating a value', () => {
      const validNullConf: PersistedAcceptedPhraseDecisionV1 = {
        source: 'AI_ASSISTED_PHRASE',
        acceptance: 'HUMAN_ACCEPTED_AI_SUGGESTION',
        originalInput: 'ایران',
        normalizedInput: 'ایران',
        profile: 'ijmes_citation_title',
        scholarlyCanonical: 'īrān',
        provider: 'openai',
        model: 'gpt-4o',
        promptVersion: 'v1',
        requestFingerprint: 'fp-123',
        modelConfidence: null,
        acceptedAt: '2026-10-06T12:00:00.000Z'
      };

      const workspace = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'ایران',
        profile: 'ijmes_citation_title' as const,
        reviewDecisions: [],
        acceptedPhraseDecision: validNullConf
      };

      const validated = validateAndMigrateTransliterationWorkspace(workspace);
      expect(validated.acceptedPhraseDecision).not.toBeNull();
      expect(validated.acceptedPhraseDecision?.modelConfidence).toBeNull();
    });
  });

  describe('Review Decisions Strict Validation', () => {
    it('strictly validates transliteration review decisions', () => {
      const workspace = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input: 'مهر',
        profile: 'ijmes_full' as const,
        reviewDecisions: [
          {
            issueId: 'valid-lex',
            action: 'SELECT_LEXICAL_READING',
            selectedAlternativeId: 'alt-1'
          },
          {
            issueId: 'invalid-lex-missing-alt',
            action: 'SELECT_LEXICAL_READING'
            // missing selectedAlternativeId
          },
          {
            issueId: 'valid-manual',
            action: 'MANUAL_CANONICAL_OVERRIDE',
            manualCanonicalTransliteration: 'mihr'
          },
          {
            issueId: 'invalid-manual-persian',
            action: 'MANUAL_CANONICAL_OVERRIDE',
            manualCanonicalTransliteration: 'مهر' // Persian script rejected
          },
          {
            issueId: 'invalid-action',
            action: 'UNKNOWN_HACK_ACTION'
          }
        ],
        acceptedPhraseDecision: null
      };

      const validated = validateAndMigrateTransliterationWorkspace(workspace);
      expect(validated.reviewDecisions).toHaveLength(2);
      expect(validated.reviewDecisions.map((d) => d.issueId)).toEqual(['valid-lex', 'valid-manual']);
    });
  });

  describe('Bibliography Workspace Strict Validation', () => {
    it('validates and round-trips a valid BibliographyWorkspaceV1', () => {
      const sampleRecords: BibliographyRecord[] = [
        {
          id: 'rec_101',
          type: 'BOOK',
          title: 'زوال اندیشه سیاسی در ایران',
          authors: [{ literal: 'سید جواد طباطبایی' }],
          editors: [],
          translators: [],
          sourceRowIndex: 1,
          sourceColumns: [{ header: 'title', value: 'زوال اندیشه سیاسی در ایران' }],
          passthrough: {}
        }
      ];

      const original = {
        schemaVersion: 1 as const,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: 'id,type,title\nrec_101,BOOK,زوال اندیشه سیاسی در ایران',
        records: sampleRecords,
        reviewDecisions: [],
        selectedRecordId: 'rec_101',
        filter: 'ALL' as const,
        exportMode: 'STRICT_ALL' as const
      };

      const validated = validateAndMigrateBibliographyWorkspace(original);
      expect(validated).toEqual(original);
    });

    it('rejects malformed bibliography records having only id/type (cannot reach processBibliographyBatch)', () => {
      const malformedRecords = [
        {
          id: 'rec_malformed_001',
          type: 'BOOK'
          // missing title, authors, editors, translators, sourceRowIndex, sourceColumns, passthrough
        }
      ];

      const workspace = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: 'bad,csv',
        records: malformedRecords,
        reviewDecisions: [],
        selectedRecordId: 'rec_malformed_001',
        filter: 'ALL',
        exportMode: 'STRICT_ALL'
      };

      const validated = validateAndMigrateBibliographyWorkspace(workspace);
      // Malformed record was dropped during strict validation
      expect(validated.records).toHaveLength(0);
      expect(validated.selectedRecordId).toBeNull();

      // Ensure processBibliographyBatch executes safely without crashing
      const batchResult = processBibliographyBatch(validated.records, validated.reviewDecisions);
      expect(batchResult.records).toHaveLength(0);
      expect(batchResult.summary.total).toBe(0);
    });

    it('falls back safely on invalid bibliography filter or export mode', () => {
      const invalid = {
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: '',
        records: [],
        reviewDecisions: [],
        selectedRecordId: null,
        filter: 'INVALID_UNKNOWN_FILTER',
        exportMode: 'NON_EXISTENT_MODE'
      };

      const validated = validateAndMigrateBibliographyWorkspace(invalid);
      expect(validated.filter).toBe('ALL');
      expect(validated.exportMode).toBe('STRICT_ALL');
    });

    it('repairs missing or non-existent selectedRecordId to the first record or null', () => {
      const records: BibliographyRecord[] = [
        {
          id: 'rec_first',
          type: 'BOOK',
          title: 'کتاب اول',
          authors: [],
          editors: [],
          translators: [],
          sourceRowIndex: 1,
          sourceColumns: [],
          passthrough: {}
        },
        {
          id: 'rec_second',
          type: 'BOOK',
          title: 'کتاب دوم',
          authors: [],
          editors: [],
          translators: [],
          sourceRowIndex: 2,
          sourceColumns: [],
          passthrough: {}
        }
      ];

      const withBrokenId = validateAndMigrateBibliographyWorkspace({
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        csvText: '',
        records,
        reviewDecisions: [],
        selectedRecordId: 'rec_non_existent',
        filter: 'ALL',
        exportMode: 'STRICT_ALL'
      });
      expect(withBrokenId.selectedRecordId).toBe('rec_first');
    });
  });

  describe('Human Review Decision & Accepted Phrase Re-evaluation', () => {
    it('re-evaluates restored ReviewDecisions through the current deterministic engine', () => {
      const input = 'مهر';
      const initialResult = transliterate(input, 'ijmes_full');
      expect(initialResult.status).toBe('AMBIGUOUS');
      expect(initialResult.reviewIssues).toHaveLength(1);

      const issue = initialResult.reviewIssues[0];
      const decision: ReviewDecision = {
        issueId: issue.id,
        action: 'SELECT_LEXICAL_READING',
        selectedAlternativeId: issue.alternatives[0].id
      };

      const persistedWorkspace = validateAndMigrateTransliterationWorkspace({
        schemaVersion: 1,
        updatedAt: '2026-10-06T12:00:00.000Z',
        input,
        profile: 'ijmes_full',
        reviewDecisions: [decision],
        acceptedPhraseDecision: null
      });

      const restoredResult = transliterate(
        persistedWorkspace.input,
        persistedWorkspace.profile,
        persistedWorkspace.reviewDecisions
      );

      expect(restoredResult.status).toBe('USER_OVERRIDE');
      expect(restoredResult.copyable).toBe(true);
      expect(restoredResult.output).toBe(issue.alternatives[0].canonical);
    });

    it('restored AcceptedPhraseDecision is active when matching current input/fingerprint but fails closed when input changes', () => {
      const input = 'تأملی درباره ایران: مکتب تبریز و مبانی تجددخواهی';
      const result = transliterate(input, 'ijmes_citation_title');
      expect(result.copyable).toBe(false);

      const request = buildPhraseResolverRequest(result, 'v1');
      const requestFingerprint = computePhraseRequestFingerprint(request, 'openai', 'gpt-4o');

      const persistedDecision: PersistedAcceptedPhraseDecisionV1 = {
        source: 'AI_ASSISTED_PHRASE',
        acceptance: 'HUMAN_ACCEPTED_AI_SUGGESTION',
        originalInput: input,
        normalizedInput: result.normalizedInput,
        profile: 'ijmes_citation_title',
        scholarlyCanonical: 'taʾammulī darbārah-i īrān: maktab-i tabrīz va mabānī-yi tajaddudkhvāhī',
        provider: 'openai',
        model: 'gpt-4o',
        promptVersion: 'v1',
        requestFingerprint,
        modelConfidence: 0.95,
        acceptedAt: '2026-10-06T12:00:00.000Z'
      };

      // Hydrate into runtime decision with derived rendering
      const runtimeDecision = fromPersistedAcceptedPhraseDecision(persistedDecision, 'ijmes_citation_title');
      expect(runtimeDecision.renderedOutput).toBe('Taʾammulī Darbārah-i Īrān: Maktab-i Tabrīz Va Mabānī-yi Tajaddudkhvāhī');

      // 1. Same input: accepted decision is applicable and active
      const restoredActive = resolveSelectedTransliteration(result, runtimeDecision);
      expect(restoredActive.activePhraseDecision).not.toBeNull();
      expect(restoredActive.primary).toBe('Taʾammulī Darbārah-i Īrān: Maktab-i Tabrīz Va Mabānī-yi Tajaddudkhvāhī');
      expect(restoredActive.status).toBe('USER_OVERRIDE');

      // 2. Changed input: accepted decision is stale and fails closed
      const changedInputResult = transliterate('متن کاملا متفاوت دیگر', 'ijmes_citation_title');
      const restoredStale = resolveSelectedTransliteration(changedInputResult, runtimeDecision);
      expect(restoredStale.activePhraseDecision).toBeNull();
      expect(restoredStale.primary).toBe(changedInputResult.output);
    });
  });

  describe('Non-Persistence of Derived Results (No Stale Authority)', () => {
    it('ensures TransliterationWorkspace does not store derived TransliterationResult fields or renderedOutput', () => {
      const workspace = createDefaultTransliterationWorkspace();
      const keys = Object.keys(workspace);

      expect(keys).not.toContain('output');
      expect(keys).not.toContain('copyable');
      expect(keys).not.toContain('status');
      expect(keys).not.toContain('tokens');
      expect(keys).not.toContain('reviewIssues');
      expect(keys).not.toContain('analyses');
      expect(keys).not.toContain('morphology');
      expect(keys).not.toContain('relations');
    });

    it('ensures BibliographyWorkspace does not store processedBatch or export reports', () => {
      const workspace = createDefaultBibliographyWorkspace();
      const keys = Object.keys(workspace);

      expect(keys).not.toContain('processedBatch');
      expect(keys).not.toContain('exportReport');
      expect(keys).not.toContain('downloadUrl');
    });
  });

  describe('Operation Queue and Write Serialization', () => {
    it('guarantees sequential commit order when Save A is delayed and Save B is enqueued', async () => {
      class TestQueue {
        private currentPromise: Promise<unknown> = Promise.resolve();
        enqueue<R>(op: () => Promise<R>): Promise<R> {
          const nextPromise = this.currentPromise.then(
            () => op(),
            () => op()
          );
          this.currentPromise = nextPromise.catch(() => {});
          return nextPromise;
        }
      }

      const queue = new TestQueue();
      const committed: string[] = [];

      // Save A is slow (50ms)
      const saveA = queue.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 50));
        committed.push('STATE_A');
      });

      // Save B is enqueued immediately after Save A
      const saveB = queue.enqueue(async () => {
        committed.push('STATE_B');
      });

      await Promise.all([saveA, saveB]);

      // State B must commit AFTER State A, guaranteeing B wins
      expect(committed).toEqual(['STATE_A', 'STATE_B']);
    });

    it('guarantees Clear Workspace wins over an in-flight delayed save', async () => {
      class TestQueue {
        private currentPromise: Promise<unknown> = Promise.resolve();
        enqueue<R>(op: () => Promise<R>): Promise<R> {
          const nextPromise = this.currentPromise.then(
            () => op(),
            () => op()
          );
          this.currentPromise = nextPromise.catch(() => {});
          return nextPromise;
        }
      }

      const queue = new TestQueue();
      let durableState: string | null = null;

      // In-flight save of old work (delayed)
      const slowSave = queue.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 40));
        durableState = 'SAVED_WORK';
      });

      // User clicks Clear Workspace while save is pending
      const clearOp = queue.enqueue(async () => {
        durableState = null;
      });

      await Promise.all([slowSave, clearOp]);

      // Final durable state must be cleared
      expect(durableState).toBeNull();
    });
  });
});
