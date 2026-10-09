import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { transliterate } from '../engine';
import {
  INITIAL_TOKEN_EDITOR_STATE,
  PhraseResolution,
  alignTokenReadings,
  applyTokenReadingEdits,
  buildAiExplanation,
  buildPhraseResolverRequest,
  computeEditedCanonical,
  computePhraseReadingFingerprintV3,
  computePhraseRequestFingerprint,
  createAcceptedPhraseDecision,
  resolveUnifiedOutput,
  tokenEditorReducer
} from './index';
import {
  DraftFetch,
  DraftRequestContext,
  PhraseDraftController,
  deriveDraftView
} from '../../client/assistance/phraseDraftController';

function makeDraft(
  result: ReturnType<typeof transliterate>,
  overrides: Partial<PhraseResolution> = {}
): PhraseResolution {
  const request = buildPhraseResolverRequest(result);
  const persian = request.tokenEvidence.filter((t) => t.tokenType === 'persian-word');
  return {
    disposition: 'PROPOSED',
    scholarlyCanonical: persian.map((_, i) => `alpha${i + 1}`).join(' '),
    renderedOutput: persian.map((_, i) => `Alpha${i + 1}`).join(' '),
    confidence: 0.7,
    basis: 'MODEL_INFERENCE',
    rationale: 'Synthetic rationale.',
    assumptions: ['Synthetic assumption.'],
    tokenReadings: persian.map((t, i) => ({
      tokenIndex: t.index,
      surface: t.surface,
      canonical: t.canonicalTransliteration ?? `alpha${i + 1}`,
      note: 'Synthetic note.'
    })),
    warnings: [],
    provider: 'mock',
    model: 'mock-model',
    promptVersion: request.promptVersion,
    requestFingerprint: computePhraseRequestFingerprint(request, 'mock', 'mock-model'),
    readingFingerprint: computePhraseReadingFingerprintV3(request, 'mock', 'mock-model'),
    readingIdentityVersion: '3',
    ...overrides
  };
}

function ctxFor(
  input: string,
  profile: 'ijmes_citation_title' | 'ijmes_full' = 'ijmes_citation_title',
  contextKind = profile === 'ijmes_citation_title' ? 'BOOK_OR_ARTICLE_TITLE' as const : 'GENERAL_SCHOLARLY_TEXT' as const
): {
  ctx: DraftRequestContext;
  result: ReturnType<typeof transliterate>;
} {
  const result = transliterate(input, profile);
  const request = buildPhraseResolverRequest(result, undefined, contextKind);
  const cacheId = computePhraseReadingFingerprintV3(request, 'client-draft-cache', 'v3');
  return {
    result,
    ctx: {
      cacheId,
      eligible: !result.copyable && result.reviewIssues.length > 0,
      payload: {
        input: result.originalInput,
        profile,
        contextKind,
        reviewDecisions: []
      }
    }
  };
}

interface Pending {
  input: string;
  signal: AbortSignal;
  resolve: (resolution: PhraseResolution) => void;
  fail: (status: number, message: string) => void;
}

function mockFetch() {
  const pending: Pending[] = [];
  const calls: string[] = [];
  const fetchImpl: DraftFetch = (_url, init) =>
    new Promise((resolve) => {
      const body = JSON.parse(init.body) as { input: string; profile: 'ijmes_citation_title' | 'ijmes_full' };
      calls.push(body.input);
      pending.push({
        input: body.input,
        signal: init.signal,
        resolve: (resolution) => resolve({ ok: true, status: 200, json: async () => ({ resolution }) }),
        fail: (status, message) => resolve({ ok: false, status, json: async () => ({ message }) })
      });
    });
  return { fetchImpl, pending, calls };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const MULTI = 'واژه دیگر';
const SINGLE = 'واژه';

describe('Phase 8A refinement: request lifecycle controller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not request while the user is still typing; one request after 900 ms stable input', async () => {
    const { fetchImpl, calls } = mockFetch();
    const c = new PhraseDraftController({ fetchImpl });
    c.setConfigured(true);
    c.setContext(ctxFor('واژ').ctx);
    vi.advanceTimersByTime(500);
    c.setContext(ctxFor('واژه').ctx);
    vi.advanceTimersByTime(500);
    c.setContext(ctxFor(MULTI).ctx);
    vi.advanceTimersByTime(899);
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(2);
    await flush();
    expect(calls).toEqual([MULTI]);
  });

  it('requests for unresolved single words as well as multiword titles', async () => {
    const { fetchImpl, calls } = mockFetch();
    const c = new PhraseDraftController({ fetchImpl });
    c.setConfigured(true);
    c.setContext(ctxFor(SINGLE).ctx);
    vi.advanceTimersByTime(901);
    await flush();
    expect(calls).toEqual([SINGLE]);
  });

  it('never requests for reviewed/copyable input or when AI is unconfigured or switched off', async () => {
    const { fetchImpl, calls } = mockFetch();
    const c = new PhraseDraftController({ fetchImpl });
    c.setConfigured(true);
    c.setContext(ctxFor('کتاب', 'ijmes_full').ctx);
    vi.advanceTimersByTime(2000);
    c.setContext(ctxFor(MULTI).ctx);
    c.setAutoEnabled(false);
    vi.advanceTimersByTime(2000);
    c.setAutoEnabled(true);
    c.setConfigured(false);
    vi.advanceTimersByTime(2000);
    await flush();
    expect(calls).toHaveLength(0);
  });

  it('caches a completed draft: status changes and re-renders never trigger another request', async () => {
    const { fetchImpl, pending, calls } = mockFetch();
    const c = new PhraseDraftController({ fetchImpl });
    const { ctx, result } = ctxFor(MULTI);
    c.setConfigured(true);
    c.setContext(ctx);
    vi.advanceTimersByTime(901);
    await flush();
    pending[0].resolve(makeDraft(result));
    await flush();
    expect(deriveDraftView(c.getSnapshot()).status).toBe('available');

    c.setContext({ ...ctx });
    c.setAutoEnabled(false);
    c.setAutoEnabled(true);
    c.setConfigured(true);
    vi.advanceTimersByTime(5000);
    await flush();
    expect(calls).toHaveLength(1);
  });

  it('reuses a cached reading across a real rendering-only profile transition with zero provider calls', async () => {
    const { fetchImpl, pending, calls } = mockFetch();
    const c = new PhraseDraftController({ fetchImpl });
    const title = ctxFor(MULTI, 'ijmes_citation_title');
    const renderingOnly = ctxFor(MULTI, 'ijmes_full', 'BOOK_OR_ARTICLE_TITLE');
    expect(renderingOnly.ctx.cacheId).toBe(title.ctx.cacheId);

    c.setConfigured(true);
    c.setContext(title.ctx);
    vi.advanceTimersByTime(901);
    await flush();
    pending[0].resolve(makeDraft(title.result));
    await flush();

    c.setContext(renderingOnly.ctx);
    vi.advanceTimersByTime(2000);
    await flush();
    expect(calls).toHaveLength(1);
    expect(deriveDraftView(c.getSnapshot()).draft).not.toBeNull();
  });

  it('deduplicates by identity: switching away and back reuses the cached draft', async () => {
    const { fetchImpl, pending, calls } = mockFetch();
    const c = new PhraseDraftController({ fetchImpl });
    const a = ctxFor(MULTI);
    c.setConfigured(true);
    c.setContext(a.ctx);
    vi.advanceTimersByTime(901);
    await flush();
    pending[0].resolve(makeDraft(a.result));
    await flush();

    c.setContext(ctxFor(SINGLE).ctx);
    c.setContext(a.ctx);
    vi.advanceTimersByTime(3000);
    await flush();
    expect(calls).toEqual([MULTI]);
    expect(deriveDraftView(c.getSnapshot()).draft).not.toBeNull();
  });

  it('loading is derived: not reported as loading-without-result when a current draft exists (regenerate)', async () => {
    const { fetchImpl, pending } = mockFetch();
    const c = new PhraseDraftController({ fetchImpl });
    const { ctx, result } = ctxFor(MULTI);
    c.setConfigured(true);
    c.setContext(ctx);
    expect(deriveDraftView(c.getSnapshot()).requestInFlight).toBe(false);
    vi.advanceTimersByTime(901);
    await flush();
    let view = deriveDraftView(c.getSnapshot());
    expect(view.requestInFlight).toBe(true);
    expect(view.draft).toBeNull();

    pending[0].resolve(makeDraft(result));
    await flush();
    c.regenerate();
    await flush();
    view = deriveDraftView(c.getSnapshot());
    expect(view.requestInFlight).toBe(true);
    expect(view.draft).not.toBeNull(); // current draft stays available while regenerating
  });

  it('manual regenerate explicitly requests a new result and replaces the draft', async () => {
    const { fetchImpl, pending, calls } = mockFetch();
    const c = new PhraseDraftController({ fetchImpl });
    const { ctx, result } = ctxFor(MULTI);
    c.setConfigured(true);
    c.setContext(ctx);
    vi.advanceTimersByTime(901);
    await flush();
    pending[0].resolve(makeDraft(result, { rationale: 'first' }));
    await flush();
    c.regenerate();
    c.regenerate(); // duplicate manual clicks while in flight are deduplicated
    await flush();
    expect(calls).toHaveLength(2);
    pending[1].resolve(makeDraft(result, { rationale: 'second' }));
    await flush();
    expect(deriveDraftView(c.getSnapshot()).draft?.rationale).toBe('second');
  });

  it('out-of-order responses cannot overwrite newer output; stale requests are aborted', async () => {
    const { fetchImpl, pending } = mockFetch();
    const c = new PhraseDraftController({ fetchImpl });
    const first = ctxFor(MULTI);
    const second = ctxFor(SINGLE);
    c.setConfigured(true);
    c.setContext(first.ctx);
    vi.advanceTimersByTime(901);
    await flush();
    c.setContext(second.ctx);
    expect(pending[0].signal.aborted).toBe(true);
    vi.advanceTimersByTime(901);
    await flush();

    pending[1].resolve(makeDraft(second.result, { rationale: 'newer' }));
    await flush();
    pending[0].resolve(makeDraft(first.result, { rationale: 'older' }));
    await flush();

    const view = deriveDraftView(c.getSnapshot());
    expect(view.draft?.rationale).toBe('newer');
    expect(Object.values(c.getSnapshot().drafts).map((d) => d.rationale)).not.toContain('older');
  });

  it('failure does not auto-retry (no loops), leaves deterministic data usable, and 503 marks unconfigured', async () => {
    const { fetchImpl, pending, calls } = mockFetch();
    const c = new PhraseDraftController({ fetchImpl });
    const { ctx, result } = ctxFor(MULTI);
    c.setConfigured(true);
    c.setContext(ctx);
    vi.advanceTimersByTime(901);
    await flush();
    pending[0].fail(502, 'provider down');
    await flush();
    expect(deriveDraftView(c.getSnapshot())).toMatchObject({ status: 'error', error: 'provider down' });
    vi.advanceTimersByTime(10000);
    c.setContext({ ...ctx });
    vi.advanceTimersByTime(10000);
    await flush();
    expect(calls).toHaveLength(1);
    // deterministic analysis unaffected
    expect(resolveUnifiedOutput(result, null, null).presentation).toBe('UNRESOLVED_NO_DRAFT');

    c.regenerate();
    await flush();
    pending[1].fail(503, 'no key');
    await flush();
    expect(c.getSnapshot().configured).toBe(false);
  });

  it('rejecting a draft is not retried automatically but can be regenerated', async () => {
    const { fetchImpl, pending, calls } = mockFetch();
    const c = new PhraseDraftController({ fetchImpl });
    const { ctx, result } = ctxFor(MULTI);
    c.setConfigured(true);
    c.setContext(ctx);
    vi.advanceTimersByTime(901);
    await flush();
    pending[0].resolve(makeDraft(result));
    await flush();
    c.reject();
    vi.advanceTimersByTime(5000);
    await flush();
    expect(calls).toHaveLength(1);
    expect(deriveDraftView(c.getSnapshot()).status).toBe('rejected');
    c.regenerate();
    await flush();
    expect(calls).toHaveLength(2);
  });
});

describe('Phase 8A refinement: single source of truth and token editing', () => {
  it('default workspace page no longer renders the duplicate full-size phrase panel', () => {
    const page = fs.readFileSync(path.resolve(process.cwd(), 'src/app/page.tsx'), 'utf8');
    expect(page).not.toContain('PhraseAssistantPanel');
    expect(page).toContain('TokenReadingEditor');
    expect(page).toContain('explanation={explanation}');
  });

  it('editor and explanation details are collapsed by default', () => {
    expect(INITIAL_TOKEN_EDITOR_STATE.open).toBe(false);
    const why = fs.readFileSync(path.resolve(process.cwd(), 'src/app/components/WhyThisReading.tsx'), 'utf8');
    expect(why).not.toMatch(/<details[^>]*\bopen\b/);
    expect(why).toContain('AI-assisted interpretation (provisional)');
    expect(why).toContain('separately retrieved external authority evidence');
    expect(why).toContain('deterministic lexical source');
    expect(why).toContain('AI-proposed reading');
  });

  it('AI explanation carries rationale, token notes, assumptions, uncertainty and provenance', () => {
    const result = transliterate(MULTI, 'ijmes_citation_title');
    const draft = makeDraft(result, { disposition: 'REVIEW_REQUIRED', warnings: ['Two readings plausible.'] });
    const e = buildAiExplanation(result, draft)!;
    expect(e.rationale).toBe('Synthetic rationale.');
    expect(e.tokens.length).toBeGreaterThan(0);
    expect(e.assumptions).toEqual(['Synthetic assumption.']);
    expect(e.warnings).toEqual(['Two readings plausible.']);
    expect(e.provenance).toMatchObject({ provider: 'mock', model: 'mock-model', modelEstimate: 0.7 });
    expect(buildAiExplanation(result, null)).toBeNull();
  });

  it('token edits are applied positionally, preserve alignment, and recompute rendering through acceptance', () => {
    const result = transliterate(MULTI, 'ijmes_citation_title');
    const draft = makeDraft(result);
    const readings = draft.tokenReadings;
    expect(readings.length).toBeGreaterThanOrEqual(2);
    const target = readings[readings.length - 1];

    let state = tokenEditorReducer(INITIAL_TOKEN_EDITOR_STATE, { type: 'OPEN' });
    state = tokenEditorReducer(state, { type: 'EDIT_TOKEN', tokenIndex: target.tokenIndex, value: 'betaᵃ'.replace('ᵃ', '') });
    const edited = computeEditedCanonical(draft, state);
    expect(edited.unlocated).toEqual([]);
    expect(edited.canonical).toContain('beta');
    expect(edited.canonical.startsWith(readings[0].canonical)).toBe(true);

    const decision = createAcceptedPhraseDecision(draft, result, edited.canonical);
    expect(decision.acceptance).toBe('HUMAN_EDITED_AI_SUGGESTION');
    expect(decision.renderedOutput.toLowerCase()).toContain('beta');
    expect(decision.provider).toBe('mock');
  });

  it('repeated identical readings are edited by position, not first match', () => {
    const out = applyTokenReadingEdits(
      'x y x',
      [
        { tokenIndex: 0, surface: 'a', canonical: 'x', note: 'n' },
        { tokenIndex: 1, surface: 'b', canonical: 'y', note: 'n' },
        { tokenIndex: 2, surface: 'c', canonical: 'x', note: 'n' }
      ],
      { 2: 'z' }
    );
    expect(out.canonical).toBe('x y z');
    expect(out.unlocated).toEqual([]);
    expect(out.alignment.status).toBe('ALIGNED');
  });

  it('fails closed when repetition permits more than one global alignment', () => {
    const readings = [
      { tokenIndex: 0, surface: 'الف', canonical: 'x', note: 'n' },
      { tokenIndex: 1, surface: 'ب', canonical: 'y', note: 'n' }
    ];
    const out = applyTokenReadingEdits('x-y-y', readings, { 1: 'z' });
    expect(out.canonical).toBe('x-y-y');
    expect(out.unlocated).toEqual([1]);
    expect(out.alignment.status).toBe('AMBIGUOUS');
  });

  it('does not align a reading inside a different lexical word', () => {
    const alignment = alignTokenReadings(
      'darbār',
      [{ tokenIndex: 0, surface: 'در', canonical: 'bar', note: 'n' }]
    );
    expect(alignment.status).toBe('UNALIGNED');
  });

  it('aligns joined morphology and izafat without consuming their structural segments', () => {
    const morphology = applyTokenReadingEdits(
      'kitāb-am',
      [{ tokenIndex: 4, surface: 'کتابم', canonical: 'kitāb', note: 'stem' }],
      { 4: 'daftar' }
    );
    expect(morphology).toMatchObject({ canonical: 'daftar-am', unlocated: [], alignment: { status: 'ALIGNED' } });

    const izafat = applyTokenReadingEdits(
      'ṣadā-yi bārān',
      [
        { tokenIndex: 0, surface: 'صدای', canonical: 'ṣadā', note: 'host' },
        { tokenIndex: 2, surface: 'باران', canonical: 'bārān', note: 'complement' }
      ],
      { 2: 'bādhā' }
    );
    expect(izafat).toMatchObject({ canonical: 'ṣadā-yi bādhā', unlocated: [], alignment: { status: 'ALIGNED' } });
  });

  it('aligns through punctuation and capitalization differences', () => {
    const out = applyTokenReadingEdits(
      'Ṣadā, Bārān!',
      [
        { tokenIndex: 0, surface: 'صدا', canonical: 'ṣadā', note: 'n' },
        { tokenIndex: 2, surface: 'باران', canonical: 'bārān', note: 'n' }
      ],
      { 2: 'Bādhā' }
    );
    expect(out).toMatchObject({ canonical: 'Ṣadā, Bādhā!', unlocated: [], alignment: { status: 'ALIGNED' } });
  });

  it('unalignable token edits are reported rather than silently dropped', () => {
    const out = applyTokenReadingEdits(
      'only phrase',
      [{ tokenIndex: 0, surface: 'a', canonical: 'missing', note: 'n' }],
      { 0: 'new' }
    );
    expect(out.unlocated).toEqual([0]);
    expect(out.alignment.status).toBe('UNALIGNED');
  });

  it('full-phrase review bypasses failed token alignment without losing provenance', () => {
    const result = transliterate(MULTI, 'ijmes_citation_title');
    const draft = makeDraft(result, {
      scholarlyCanonical: 'phrase differs',
      tokenReadings: [{ tokenIndex: 0, surface: 'واژه', canonical: 'missing', note: 'AI-proposed' }]
    });
    let state = tokenEditorReducer(INITIAL_TOKEN_EDITOR_STATE, { type: 'EDIT_TOKEN', tokenIndex: 0, value: 'edited' });
    expect(computeEditedCanonical(draft, state).unlocated).toEqual([0]);
    state = tokenEditorReducer(state, { type: 'EDIT_PHRASE', value: 'explicitly reviewed phrase' });
    const edited = computeEditedCanonical(draft, state);
    expect(edited).toMatchObject({ canonical: 'explicitly reviewed phrase', unlocated: [], alignment: { status: 'ALIGNED' } });
    expect(createAcceptedPhraseDecision(draft, result, edited.canonical).acceptance)
      .toBe('HUMAN_EDITED_AI_SUGGESTION');
  });

  it('phrase-level override supersedes token edits; reset keeps editor open; close discards edits', () => {
    let s = tokenEditorReducer(INITIAL_TOKEN_EDITOR_STATE, { type: 'OPEN' });
    s = tokenEditorReducer(s, { type: 'EDIT_TOKEN', tokenIndex: 1, value: 'q' });
    s = tokenEditorReducer(s, { type: 'EDIT_PHRASE', value: 'whole phrase' });
    expect(s.tokenEdits).toEqual({});
    expect(s.phraseOverride).toBe('whole phrase');
    s = tokenEditorReducer(s, { type: 'RESET' });
    expect(s).toMatchObject({ open: true, phraseOverride: null });
    expect(tokenEditorReducer(s, { type: 'CLOSE' })).toEqual(INITIAL_TOKEN_EDITOR_STATE);
  });

  it('copy semantics distinguish provisional, human-accepted, scholarly authority, and final export', () => {
    const result = transliterate(MULTI, 'ijmes_citation_title');
    const draft = makeDraft(result);
    const view = resolveUnifiedOutput(result, null, draft);
    expect(view).toMatchObject({ presentation: 'AI_DRAFT', isCopyableDraft: true, isVerifiedCopyable: false });

    const decision = createAcceptedPhraseDecision(draft, result, draft.scholarlyCanonical!);
    expect(resolveUnifiedOutput(result, decision, draft)).toMatchObject({
      presentation: 'HUMAN_ACCEPTED',
      isHumanAcceptedCopyable: true,
      isVerifiedCopyable: false,
      isScholarlyAuthority: false,
      isFinalExportEligible: false
    });

    const other = transliterate(SINGLE, 'ijmes_citation_title');
    expect(resolveUnifiedOutput(other, decision, null).presentation).toBe('UNRESOLVED_NO_DRAFT');
  });
});
