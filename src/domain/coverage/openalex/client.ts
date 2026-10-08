/**
 * OpenAlex Works API client for Persian scholarly metadata acquisition.
 *
 * Source: OpenAlex Works endpoint (CC0).
 * Filter: language=fa (acquisition prefilter only).
 */

import type { RawOpenAlexRecord } from './selection';

export interface OpenAlexFetchOptions {
  maxRecordsToScan?: number;
  perPage?: number;
  onProgress?: (scanned: number, poolCount: number) => void;
  filterLanguage?: string;
  userAgent?: string;
}

export interface OpenAlexPageResponse {
  meta?: {
    count?: number;
    db_response_time_ms?: number;
    page?: number;
    per_page?: number;
    next_cursor?: string;
  };
  results?: RawOpenAlexRecord[];
}

export class OpenAlexWorksClient {
  private readonly baseUrl = 'https://api.openalex.org/works';
  private readonly defaultUserAgent =
    'PersianScholarlyTransliterator-Phase7F/1.0 (mailto:persian-transliterator@example.org)';

  public async *streamPersianWorks(
    options: OpenAlexFetchOptions = {}
  ): AsyncGenerator<RawOpenAlexRecord, void, unknown> {
    const perPage = options.perPage ?? 200;
    const maxToScan = options.maxRecordsToScan ?? 15000;
    const lang = options.filterLanguage ?? 'fa';
    let cursor = '*';
    let totalScanned = 0;

    while (cursor && totalScanned < maxToScan) {
      const url = new URL(this.baseUrl);
      url.searchParams.set('filter', `language:${lang}`);
      url.searchParams.set('per-page', String(perPage));
      url.searchParams.set(
        'select',
        'id,title,language,type,publication_year,doi,updated_date'
      );
      url.searchParams.set('cursor', cursor);

      let response: Response;
      try {
        response = await fetch(url.toString(), {
          headers: {
            'User-Agent': options.userAgent ?? this.defaultUserAgent,
            Accept: 'application/json'
          }
        });
      } catch {
        // Retry once after short wait
        await new Promise((r) => setTimeout(r, 1500));
        response = await fetch(url.toString(), {
          headers: {
            'User-Agent': options.userAgent ?? this.defaultUserAgent,
            Accept: 'application/json'
          }
        });
      }

      if (!response.ok) {
        throw new Error(
          `OpenAlex API error ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as OpenAlexPageResponse;
      const results = data.results ?? [];
      if (results.length === 0) {
        break;
      }

      for (const record of results) {
        totalScanned += 1;
        yield record;
        if (totalScanned >= maxToScan) break;
      }

      cursor = data.meta?.next_cursor ?? '';
      if (!cursor) break;

      // Gentle politeness pause
      await new Promise((r) => setTimeout(r, 80));
    }
  }
}
