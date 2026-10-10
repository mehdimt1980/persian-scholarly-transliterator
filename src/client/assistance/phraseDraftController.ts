/**
 * Phase 8A: request lifecycle for automatic AI phrase drafts.
 *
 * Identity model:
 *   - `cacheId` is a CLIENT-side V2 reading identity derived from source, semantic
 *     context, deterministic evidence, issues, and decisions; rendering is excluded.
 *   - The server's `requestFingerprint` (includes provider + model) remains the sole
 *     authority for acceptance and is NOT used for client dedupe.
 *
 * Guarantees:
 *   - At most one in-flight request per cacheId.
 *   - A completed (cached) draft never triggers another automatic request.
 *   - A failed/attempted cacheId is never auto-retried (no retry loops); manual regenerate only.
 *   - Responses for a cacheId that is no longer current are aborted/ignored.
 *   - Loading is derived: true only while the CURRENT cacheId has an in-flight request.
 */

import type { PhraseResolution } from '../../domain/assistance/phraseTypes';

export interface DraftRequestPayload {
  input: string;
  profile: string;
  contextKind: 'BOOK_OR_ARTICLE_TITLE' | 'GENERAL_SCHOLARLY_TEXT';
  reviewDecisions: unknown[];
}

export interface DraftRequestContext {
  cacheId: string;
  eligible: boolean;
  payload: DraftRequestPayload;
}

export type DraftFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface DraftError {
  kind: 'error' | 'unavailable';
  message: string;
}

export interface DraftControllerSnapshot {
  currentId: string | null;
  eligible: boolean;
  autoEnabled: boolean;
  configured: boolean | null;
  drafts: Readonly<Record<string, PhraseResolution>>;
  errors: Readonly<Record<string, DraftError>>;
  inflight: readonly string[];
  rejected: readonly string[];
}

export type DraftStatus = 'idle' | 'loading' | 'available' | 'error' | 'unavailable' | 'rejected';

export interface DraftView {
  draft: PhraseResolution | null;
  status: DraftStatus;
  /** True while any request for the current identity is running (including regenerate). */
  requestInFlight: boolean;
  error: string | null;
}

export function deriveDraftView(snapshot: DraftControllerSnapshot): DraftView {
  const id = snapshot.currentId;
  if (!id) return { draft: null, status: 'idle', requestInFlight: false, error: null };
  const draft = snapshot.drafts[id] ?? null;
  const requestInFlight = snapshot.inflight.includes(id);
  const err = snapshot.errors[id] ?? null;
  if (snapshot.rejected.includes(id) && !requestInFlight) {
    return { draft: null, status: 'rejected', requestInFlight, error: null };
  }
  if (draft) {
    return { draft, status: requestInFlight ? 'loading' : 'available', requestInFlight, error: err?.message ?? null };
  }
  if (requestInFlight) return { draft: null, status: 'loading', requestInFlight, error: null };
  if (err) return { draft: null, status: err.kind, requestInFlight, error: err.message };
  return { draft: null, status: 'idle', requestInFlight, error: null };
}

export interface PhraseDraftControllerOptions {
  fetchImpl: DraftFetch;
  debounceMs?: number;
  endpoint?: string;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class PhraseDraftController {
  private readonly fetchImpl: DraftFetch;
  private readonly debounceMs: number;
  private readonly endpoint: string;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  private ctx: DraftRequestContext | null = null;
  private timer: unknown = null;
  private readonly attempted = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();
  private listeners = new Set<() => void>();
  private snapshot: DraftControllerSnapshot = {
    currentId: null,
    eligible: false,
    autoEnabled: false,
    configured: null,
    drafts: {},
    errors: {},
    inflight: [],
    rejected: []
  };

  constructor(options: PhraseDraftControllerOptions) {
    this.fetchImpl = options.fetchImpl;
    this.debounceMs = options.debounceMs ?? 900;
    this.endpoint = options.endpoint ?? '/api/assist/phrase';
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): DraftControllerSnapshot => this.snapshot;

  private update(patch: Partial<DraftControllerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  setAutoEnabled(enabled: boolean): void {
    if (this.snapshot.autoEnabled === enabled) return;
    this.update({ autoEnabled: enabled });
    this.schedule();
  }

  setConfigured(configured: boolean | null): void {
    if (this.snapshot.configured === configured) return;
    this.update({ configured });
    this.schedule();
  }

  setContext(next: DraftRequestContext | null): void {
    const nextId = next?.cacheId ?? null;
    const changed = nextId !== this.snapshot.currentId;
    this.ctx = next;

    if (changed) {
      // Abort anything that is no longer the current identity (stale).
      for (const [id, controller] of [...this.controllers]) {
        if (id !== nextId) this.abortRequest(id, controller);
      }
      this.update({
        currentId: nextId,
        eligible: Boolean(next?.eligible),
        inflight: this.snapshot.inflight.filter((id) => id === nextId)
      });
    } else if (Boolean(next?.eligible) !== this.snapshot.eligible) {
      this.update({ eligible: Boolean(next?.eligible) });
    }
    this.schedule();
  }

  /** Explicit user action: always requests a fresh result for the current identity. */
  regenerate(): void {
    const ctx = this.ctx;
    if (!ctx || !ctx.eligible) return;
    if (this.snapshot.configured === false) return;
    this.cancelTimer();
    this.update({ rejected: this.snapshot.rejected.filter((id) => id !== ctx.cacheId) });
    void this.run(ctx, true);
  }

  /** Discard the current draft (user rejection). Never retried automatically. */
  reject(): void {
    const id = this.snapshot.currentId;
    if (!id) return;
    const drafts = { ...this.snapshot.drafts };
    delete drafts[id];
    this.update({
      drafts,
      rejected: this.snapshot.rejected.includes(id) ? this.snapshot.rejected : [...this.snapshot.rejected, id]
    });
  }

  destroy(): void {
    this.cancelTimer();
    for (const [id, controller] of [...this.controllers]) this.abortRequest(id, controller);
    if (this.snapshot.inflight.length > 0) this.update({ inflight: [] });
  }

  /** Aborted requests never completed, so they must remain eligible for a later automatic attempt. */
  private abortRequest(id: string, controller: AbortController): void {
    controller.abort();
    this.controllers.delete(id);
    this.attempted.delete(id);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    this.cancelTimer();
    const ctx = this.ctx;
    const s = this.snapshot;
    if (!ctx || !ctx.eligible || !s.autoEnabled || s.configured !== true) return;
    const id = ctx.cacheId;
    if (s.drafts[id] || this.attempted.has(id) || s.inflight.includes(id) || s.rejected.includes(id)) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.run(ctx, false);
    }, this.debounceMs);
  }

  private async run(ctx: DraftRequestContext, manual: boolean): Promise<void> {
    const id = ctx.cacheId;
    if (this.ctx?.cacheId !== id) return;
    if (this.snapshot.inflight.includes(id)) return;
    if (!manual && (this.snapshot.drafts[id] || this.attempted.has(id))) return;

    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.attempted.add(id);
    const errors = { ...this.snapshot.errors };
    delete errors[id];
    this.update({ inflight: [...this.snapshot.inflight, id], errors });

    const finish = (patch: Partial<DraftControllerSnapshot>) => {
      if (this.controllers.get(id) === controller) this.controllers.delete(id);
      this.update({ ...patch, inflight: this.snapshot.inflight.filter((x) => x !== id) });
    };

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ctx.payload),
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      const data = (await response.json()) as { resolution?: PhraseResolution; message?: string; error?: string };
      if (controller.signal.aborted) return;

      if (!response.ok) {
        if (response.status === 409) {
          finish({});
          return;
        }
        const kind = response.status === 503 ? 'unavailable' : 'error';
        finish({
          configured: response.status === 503 ? false : this.snapshot.configured,
          errors: {
            ...this.snapshot.errors,
            [id]: { kind, message: data.message || data.error || 'Phrase assistance request failed.' }
          }
        });
        return;
      }

      if (!data.resolution) {
        finish({ errors: { ...this.snapshot.errors, [id]: { kind: 'error', message: 'Malformed assistance response.' } } });
        return;
      }
      finish({ drafts: { ...this.snapshot.drafts, [id]: data.resolution } });
    } catch (err) {
      if (controller.signal.aborted) return;
      finish({
        errors: {
          ...this.snapshot.errors,
          [id]: { kind: 'error', message: err instanceof Error ? err.message : 'Network error during phrase resolution.' }
        }
      });
    }
  }
}
