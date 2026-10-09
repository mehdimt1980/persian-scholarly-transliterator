import { ciniiQuerySchema, ciniiResponseSchema } from './schema';
import type { CiniiQueryConfig } from './types';

export const CINII_BOOKS_ENDPOINT = 'https://cir.nii.ac.jp/opensearch/v2/books';
export interface CiniiClientOptions { appId: string; maxRecords: number; maxRequests: number; delayMs: number; timeoutMs?: number; retries?: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; }

export function buildCiniiQueryUrl(queryInput: CiniiQueryConfig, appId: string, start = 1): URL {
  const query = ciniiQuerySchema.parse(queryInput);
  if (!appId.trim()) throw new Error('CiNii application ID is required.');
  if (!Number.isInteger(start) || start < 1 || start > 10000) throw new Error('CiNii start must be an integer from 1 to 10000.');
  const url = new URL(CINII_BOOKS_ENDPOINT);
  const set = (key: string, value: string | undefined) => { if (value) url.searchParams.set(key, value); };
  set('q', query.q); set('title', query.title); set('languageType', query.languageType?.join(',')); set('dataSourceType', query.dataSourceType?.join(',')); set('resourceType', query.resourceType?.join(',')); set('from', query.from); set('until', query.until);
  url.searchParams.set('sortorder', String(query.sortorder)); url.searchParams.set('count', String(query.count)); url.searchParams.set('start', String(start)); url.searchParams.set('format', 'json'); url.searchParams.set('lang', 'en'); url.searchParams.set('appid', appId);
  return url;
}

export function safeRequestUrl(url: URL): string { const safe = new URL(url); safe.searchParams.delete('appid'); return safe.toString(); }
export function retryAfterMs(value: string | null, now = Date.now()): number | null { if (!value) return null; const seconds = Number(value); if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000; const date = Date.parse(value); return Number.isFinite(date) ? Math.max(0, date - now) : null; }

export class CiniiResearchClient {
  constructor(private readonly options: CiniiClientOptions) {
    if (!options.appId.trim()) throw new Error('CINII_APP_ID is required.');
    if (!Number.isInteger(options.maxRecords) || options.maxRecords < 1 || options.maxRecords > 100) throw new Error('maxRecords must be between 1 and 100.');
    if (!Number.isInteger(options.maxRequests) || options.maxRequests < 1) throw new Error('maxRequests must be positive.');
    if (options.delayMs < 250) throw new Error('delayMs must be at least 250 ms (a conservative client default, not a documented NII rate limit).');
    if ((options.retries ?? 1) > 2) throw new Error('retries cannot exceed 2.');
  }

  async fetchPilot(query: CiniiQueryConfig): Promise<{ items: unknown[]; totalResults: number; requests: number; requestUrls: string[] }> {
    ciniiQuerySchema.parse(query);
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const sleep = this.options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const timeoutMs = this.options.timeoutMs ?? 15000; const retries = this.options.retries ?? 1;
    const items: unknown[] = []; const requestUrls: string[] = []; let start = 1; let requests = 0; let totalResults = 0;
    while (items.length < this.options.maxRecords && requests < this.options.maxRequests) {
      const pageCount = Math.min(query.count, this.options.maxRecords - items.length);
      const url = buildCiniiQueryUrl({ ...query, count: pageCount }, this.options.appId, start);
      requestUrls.push(safeRequestUrl(url));
      let response: Response | null = null; let lastError: unknown;
      for (let attempt = 0; attempt <= retries && requests < this.options.maxRequests; attempt += 1) {
        requests += 1;
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
        try { response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: controller.signal }); }
        catch (error) { lastError = error; }
        finally { clearTimeout(timer); }
        if (response?.ok) break;
        if (response && response.status !== 429 && response.status < 500) throw new Error(`CiNii API error ${response.status}: ${response.statusText}`);
        if (attempt < retries && requests < this.options.maxRequests) await sleep(response?.status === 429 ? (retryAfterMs(response.headers.get('retry-after')) ?? this.options.delayMs) : this.options.delayMs);
      }
      if (!response?.ok) throw new Error(`CiNii request failed after bounded retries: ${lastError instanceof Error ? lastError.message : response?.statusText ?? 'unknown error'}`);
      const parsed = ciniiResponseSchema.parse(await response.json());
      totalResults = Number(parsed['opensearch:totalResults']);
      items.push(...parsed.items.slice(0, this.options.maxRecords - items.length));
      const pageItems = Number(parsed['opensearch:itemsPerPage']);
      if (parsed.items.length === 0 || start + pageItems > totalResults) break;
      start += pageItems;
      if (items.length < this.options.maxRecords && requests < this.options.maxRequests) await sleep(this.options.delayMs);
    }
    return { items, totalResults, requests, requestUrls };
  }
}
