import { RawSourceRecord } from '../connector';
import { SruDiagnostic } from './types';
import { parseSruResponse } from './xmlParser';

export interface LocClientOptions {
  baseUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  maxRetries?: number;
  allowInsecureHttp?: boolean;
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

export class LocSruDiagnosticError extends LocClientError {
  public readonly diagnostics: SruDiagnostic[];

  constructor(diagnostics: SruDiagnostic[], url?: string) {
    const summary = diagnostics
      .map((d) => d.message + (d.details ? ` (${d.details})` : ''))
      .join('; ');
    super(`SRU diagnostic error: ${summary}`, 400, url);
    this.name = 'LocSruDiagnosticError';
    this.diagnostics = diagnostics;
  }
}

export const OFFICIAL_LOC_HTTPS_SRU_URL = 'https://lx2.loc.gov/sru/lcdb';
const DEFAULT_USER_AGENT = 'PersianScholarlyTransliterator/0.2.0 (research pilot; mailto:mehdi.mt@gmail.com)';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 2;

/**
 * Client for official Library of Congress machine-readable catalog services (SRU & MARCXML).
 *
 * Operational invariants:
 *   1. Production requests use the official HTTPS SRU endpoint (https://lx2.loc.gov/sru/lcdb).
 *   2. Bounded queries (maximumRecords <= 20) with timeout abort controller (10s).
 *   3. Explicit HTTP 429 rate-limit handling with Retry-After inspection.
 *   4. Exponential backoff on transient 5xx server or network transport errors.
 *   5. Strict SRU envelope inspection distinguishing diagnostics, valid zero-results, and malformed XML.
 */
export class LocClient {
  public readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: typeof fetch;

  constructor(options?: LocClientOptions) {
    this.baseUrl = (options?.baseUrl ?? OFFICIAL_LOC_HTTPS_SRU_URL).replace(/\/+$/, '');
    this.userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchFn = options?.fetchFn ?? fetch;

    // Enforce HTTPS for remote endpoints unless explicitly exempted for test mocks or localhost
    const isMock = options?.fetchFn !== undefined;
    const isLocal = this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1');
    if (!options?.allowInsecureHttp && !isMock && !isLocal && this.baseUrl.startsWith('http://')) {
      throw new LocClientError(
        'Insecure HTTP is prohibited for Library of Congress production requests. Use https://lx2.loc.gov/sru/lcdb.',
        400,
        this.baseUrl
      );
    }
  }

  /**
   * Fetch a single MARCXML record by LCCN.
   *
   * Invariants:
   *   - Validates response envelope for SRU diagnostics.
   *   - Fails with 404 if record is not found.
   *   - Validates that returned record's LCCN matches requested LCCN.
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

    const record = records[0];

    // Validate that returned record's LCCN matches requested query
    const normRequested = cleanLccn.replace(/\s+/g, '');
    const normReturned = (record.rawIdentifier ?? '').replace(/\s+/g, '');
    if (
      normReturned &&
      normReturned !== normRequested &&
      !normReturned.endsWith(normRequested) &&
      !normRequested.endsWith(normReturned)
    ) {
      throw new LocClientError(
        `LCCN mismatch in LoC response: requested "${cleanLccn}", but returned record has LCCN "${record.rawIdentifier}".`,
        409
      );
    }

    return record;
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

    // Validate SRU response envelope
    const sruResponse = parseSruResponse(xmlPayload);

    // Check for server-side SRU diagnostics
    if (sruResponse.diagnostics.length > 0) {
      throw new LocSruDiagnosticError(sruResponse.diagnostics, url);
    }

    // Valid zero-result response
    if (sruResponse.numberOfRecords === 0 || sruResponse.records.length === 0) {
      return [];
    }

    const fetchedAt = new Date().toISOString();
    const results: RawSourceRecord<string>[] = [];

    for (let i = 0; i < sruResponse.records.length; i++) {
      const rec = sruResponse.records[i];
      const rawXml = sruResponse.rawRecords[i] ?? xmlPayload;
      results.push({
        sourceId: 'LOC',
        rawIdentifier: rec.lccn,
        payload: rawXml,
        fetchedAt
      });
    }

    return results;
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
