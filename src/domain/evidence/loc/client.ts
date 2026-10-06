import { RawSourceRecord } from '../connector';

export interface LocClientOptions {
  baseUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchFn?: typeof fetch;
}

export class LocClientError extends Error {
  public readonly status?: number;
  public readonly url?: string;

  constructor(message: string, status?: number, url?: string) {
    super(`[LoC Client] ${message}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'LocClientError';
    this.status = status;
    this.url = url;
  }
}

export class LocRateLimitError extends LocClientError {
  public readonly retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number, url?: string) {
    super(`Rate limit exceeded: ${message}`, 429, url);
    this.name = 'LocRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const DEFAULT_BASE_URL = 'http://lx2.loc.gov:210/LCDB';
const DEFAULT_USER_AGENT = 'PersianScholarlyTransliterator/0.2.0 (research pilot; mailto:mehdi.mt@gmail.com)';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 2;

/**
 * Client for official Library of Congress machine-readable catalog services (SRU & MARCXML).
 *
 * Designed with conservative rate limits, bounded queries, and fail-closed error handling.
 */
export class LocClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: typeof fetch;

  constructor(options?: LocClientOptions) {
    this.baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchFn = options?.fetchFn ?? fetch;
  }

  /**
   * Fetch a single MARCXML record by LCCN.
   */
  public async fetchLccn(lccn: string): Promise<RawSourceRecord<string>> {
    const cleanLccn = lccn.trim().replace(/\s+/g, '');
    if (!cleanLccn) {
      throw new LocClientError('LCCN must be a non-empty string.');
    }

    const cql = `bath.lccn="${cleanLccn}"`;
    const records = await this.searchSru(cql, { startRecord: 1, maximumRecords: 1 });

    if (records.length === 0) {
      throw new LocClientError(`No record found for LCCN "${cleanLccn}".`, 404);
    }

    return {
      ...records[0],
      rawIdentifier: cleanLccn
    };
  }

  /**
   * Perform a bounded SRU query against the Library of Congress catalog.
   */
  public async searchSru(
    cql: string,
    options?: { startRecord?: number; maximumRecords?: number }
  ): Promise<RawSourceRecord<string>[]> {
    const startRecord = Math.max(1, options?.startRecord ?? 1);
    // Enforce safety cap on maximumRecords for pilot (max 20 records per request)
    const maximumRecords = Math.min(20, Math.max(1, options?.maximumRecords ?? 1));

    const params = new URLSearchParams({
      version: '1.1',
      operation: 'searchRetrieve',
      query: cql,
      startRecord: String(startRecord),
      maximumRecords: String(maximumRecords),
      recordPacking: 'xml',
      recordSchema: 'marcxml'
    });

    const url = `${this.baseUrl}?${params.toString()}`;
    const xmlPayload = await this.executeWithRetry(url);

    return [
      {
        sourceId: 'LOC',
        payload: xmlPayload,
        fetchedAt: new Date().toISOString()
      }
    ];
  }

  private async executeWithRetry(url: string, attempt = 0): Promise<string> {
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/xml, text/xml, */*'
        },
        signal: controller.signal
      });

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
        throw new LocRateLimitError('HTTP 429 Too Many Requests from LoC endpoint.', retryAfterSec, url);
      }

      if (!response.ok) {
        throw new LocClientError(
          `LoC SRU request failed with status ${response.status} ${response.statusText}`,
          response.status,
          url
        );
      }

      const text = await response.text();
      if (!text || text.trim() === '') {
        throw new LocClientError('Received empty response from LoC endpoint.', response.status, url);
      }

      return text;
    } catch (err: any) {
      if (err instanceof LocRateLimitError) {
        throw err;
      }
      if (err.name === 'AbortError') {
        throw new LocClientError(`Request timed out after ${this.timeoutMs}ms.`, 408, url);
      }
      if (attempt < this.maxRetries && !(err instanceof LocClientError && err.status && err.status < 500)) {
        // Backoff and retry on transient network errors
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        return this.executeWithRetry(url, attempt + 1);
      }
      if (err instanceof LocClientError) {
        throw err;
      }
      throw new LocClientError(`Network transport error: ${err.message}`, undefined, url);
    } finally {
      clearTimeout(timeoutTimer);
    }
  }
}
