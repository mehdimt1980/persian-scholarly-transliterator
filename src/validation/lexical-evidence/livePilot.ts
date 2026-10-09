import { CiniiResearchClient } from '../acquisition/cinii/client';
import { parseCiniiItems } from '../acquisition/cinii/parser';
import { assignBibliographicRelationships, summarize } from '../acquisition/cinii/pipeline';
import type { CiniiEvidenceRecord, CiniiQueryConfig, CiniiQualitySummary } from '../acquisition/cinii/types';

export interface LiveQueryPlan { query: CiniiQueryConfig; maxRecords: number; purpose: 'PERSIAN_LANGUAGE_FILTER' | 'UNFILTERED_COMPARISON'; }
export interface LivePilotResult { status: 'LIVE_NOT_RUN_MISSING_AUTHORIZATION' | 'LIVE_RUN_AUTHORIZED'; requestsAttempted: number; records: CiniiEvidenceRecord[]; quality: CiniiQualitySummary | null; queryResults: Array<{ queryId: string; purpose: LiveQueryPlan['purpose']; requests: number; received: number; totalResults: number }>; }
export interface LivePilotOptions { authorized: boolean; appId?: string; plans: LiveQueryPlan[]; maxRecords: number; maxRequests: number; delayMs: number; retrievedAt: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; }

export function defaultLivePlans(term: string): LiveQueryPlan[] { return [
  { query: { queryId: 'phase8e-fa-filter-v1', q: term, languageType: ['fa'], sortorder: 0, count: 50 }, maxRecords: 50, purpose: 'PERSIAN_LANGUAGE_FILTER' },
  { query: { queryId: 'phase8e-unfiltered-comparison-v1', q: term, sortorder: 0, count: 25 }, maxRecords: 25, purpose: 'UNFILTERED_COMPARISON' }
]; }

export async function runLivePilot(options: LivePilotOptions): Promise<LivePilotResult> {
  if (!options.authorized || !options.appId?.trim()) return { status: 'LIVE_NOT_RUN_MISSING_AUTHORIZATION', requestsAttempted: 0, records: [], quality: null, queryResults: [] };
  if (!Number.isInteger(options.maxRecords) || options.maxRecords < 1 || options.maxRecords > 100) throw new Error('Shared live maxRecords must be between 1 and 100.');
  if (!Number.isInteger(options.maxRequests) || options.maxRequests < 1) throw new Error('Shared live maxRequests must be positive.');
  if (options.plans.length < 2 || !options.plans.some((plan) => plan.purpose === 'PERSIAN_LANGUAGE_FILTER') || !options.plans.some((plan) => plan.purpose === 'UNFILTERED_COMPARISON')) throw new Error('Live pilot requires Persian-filtered and unfiltered comparison plans.');
  if (options.plans.reduce((sum, plan) => sum + plan.maxRecords, 0) > options.maxRecords) throw new Error('Declared query allocations exceed the shared record budget.');
  const records: CiniiEvidenceRecord[] = []; const queryResults: LivePilotResult['queryResults'] = []; let requestsAttempted = 0;
  for (const plan of options.plans) {
    const remainingRecords = options.maxRecords - records.length; const remainingRequests = options.maxRequests - requestsAttempted;
    if (remainingRecords === 0 || remainingRequests === 0) break;
    const allocation = Math.min(plan.maxRecords, remainingRecords); const query = { ...plan.query, count: Math.min(plan.query.count, allocation) };
    const client = new CiniiResearchClient({ appId: options.appId, maxRecords: allocation, maxRequests: remainingRequests, delayMs: options.delayMs, fetchImpl: options.fetchImpl, sleep: options.sleep });
    const response = await client.fetchPilot(query); requestsAttempted += response.requests;
    const parsed = parseCiniiItems({ 'opensearch:totalResults': response.totalResults, 'opensearch:startIndex': 1, 'opensearch:itemsPerPage': response.items.length, items: response.items }, query, options.retrievedAt);
    records.push(...parsed); queryResults.push({ queryId: query.queryId, purpose: plan.purpose, requests: response.requests, received: parsed.length, totalResults: response.totalResults });
  }
  const related = assignBibliographicRelationships(records);
  return { status: 'LIVE_RUN_AUTHORIZED', requestsAttempted, records: related, quality: summarize(related, related.length, 0), queryResults };
}
