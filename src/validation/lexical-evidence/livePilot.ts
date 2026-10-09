import { CiniiResearchClient } from '../acquisition/cinii/client';
import { parseCiniiItems } from '../acquisition/cinii/parser';
import { assignBibliographicRelationships, summarize } from '../acquisition/cinii/pipeline';
import type { CiniiEvidenceRecord, CiniiQueryConfig, CiniiQualitySummary } from '../acquisition/cinii/types';

export interface LiveQueryPlan { query: CiniiQueryConfig; maxRecords: number; purpose: 'PERSIAN_LANGUAGE_FILTER' | 'UNFILTERED_COMPARISON'; }
export type LiveQueryExecutionStatus = 'NOT_RUN_NOT_AUTHORIZED' | 'NOT_RUN_BUDGET_EXHAUSTED' | 'NOT_RUN_AFTER_FAILURE' | 'PARTIAL_BUDGET_EXHAUSTED' | 'COMPLETE' | 'FAILED';
export interface LivePilotResult { authorizationStatus: 'NOT_AUTHORIZED' | 'AUTHORIZED'; executionStatus: 'NOT_RUN' | 'COMPLETE' | 'PARTIAL_BUDGET_EXHAUSTED' | 'FAILED'; comparisonStatus: 'NOT_AVAILABLE' | 'COMPLETE'; requestsAttempted: number; records: CiniiEvidenceRecord[]; quality: CiniiQualitySummary | null; queryResults: Array<{ queryId: string; purpose: LiveQueryPlan['purpose']; executionStatus: LiveQueryExecutionStatus; complete: boolean; requests: number; received: number; totalResults: number | null; error: string | null }>; }
export interface LivePilotOptions { authorized: boolean; appId?: string; plans: LiveQueryPlan[]; maxRecords: number; maxRequests: number; delayMs: number; retrievedAt: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; }

export function defaultLivePlans(term: string): LiveQueryPlan[] { return [
  { query: { queryId: 'phase8e-fa-filter-v1', q: term, languageType: ['fa'], sortorder: 0, count: 50 }, maxRecords: 50, purpose: 'PERSIAN_LANGUAGE_FILTER' },
  { query: { queryId: 'phase8e-unfiltered-comparison-v1', q: term, sortorder: 0, count: 25 }, maxRecords: 25, purpose: 'UNFILTERED_COMPARISON' }
]; }

export async function runLivePilot(options: LivePilotOptions): Promise<LivePilotResult> {
  if (!options.authorized || !options.appId?.trim()) return { authorizationStatus: 'NOT_AUTHORIZED', executionStatus: 'NOT_RUN', comparisonStatus: 'NOT_AVAILABLE', requestsAttempted: 0, records: [], quality: null, queryResults: options.plans.map((plan) => ({ queryId: plan.query.queryId, purpose: plan.purpose, executionStatus: 'NOT_RUN_NOT_AUTHORIZED', complete: false, requests: 0, received: 0, totalResults: null, error: 'Explicit authorization and CINII_APP_ID are required.' })) };
  if (!Number.isInteger(options.maxRecords) || options.maxRecords < 1 || options.maxRecords > 100) throw new Error('Shared live maxRecords must be between 1 and 100.');
  if (!Number.isInteger(options.maxRequests) || options.maxRequests < 1) throw new Error('Shared live maxRequests must be positive.');
  if (options.plans.length < 2 || !options.plans.some((plan) => plan.purpose === 'PERSIAN_LANGUAGE_FILTER') || !options.plans.some((plan) => plan.purpose === 'UNFILTERED_COMPARISON')) throw new Error('Live pilot requires Persian-filtered and unfiltered comparison plans.');
  if (options.plans.reduce((sum, plan) => sum + plan.maxRecords, 0) > options.maxRecords) throw new Error('Declared query allocations exceed the shared record budget.');
  const records: CiniiEvidenceRecord[] = []; const queryResults: LivePilotResult['queryResults'] = []; let requestsAttempted = 0; let failed = false; const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let planIndex = 0; planIndex < options.plans.length; planIndex += 1) {
    const plan = options.plans[planIndex];
    const remainingRecords = options.maxRecords - records.length; const remainingRequests = options.maxRequests - requestsAttempted;
    if (remainingRecords === 0 || remainingRequests === 0) { queryResults.push({ queryId: plan.query.queryId, purpose: plan.purpose, executionStatus: 'NOT_RUN_BUDGET_EXHAUSTED', complete: false, requests: 0, received: 0, totalResults: null, error: 'Shared acquisition budget exhausted before this query.' }); continue; }
    if (planIndex > 0) await sleep(options.delayMs);
    const allocation = Math.min(plan.maxRecords, remainingRecords); const query = { ...plan.query, count: Math.min(plan.query.count, allocation) };
    let queryRequests = 0; const providerFetch = options.fetchImpl ?? fetch; const countingFetch: typeof fetch = async (input, init) => { queryRequests += 1; return providerFetch(input, init); };
    const client = new CiniiResearchClient({ appId: options.appId, maxRecords: allocation, maxRequests: remainingRequests, delayMs: options.delayMs, fetchImpl: countingFetch, sleep });
    try {
      const response = await client.fetchPilot(query); requestsAttempted += queryRequests;
      const parsed = parseCiniiItems({ 'opensearch:totalResults': response.totalResults, 'opensearch:startIndex': 1, 'opensearch:itemsPerPage': response.items.length, items: response.items }, query, options.retrievedAt);
      const queryComplete = parsed.length >= Math.min(allocation, response.totalResults);
      records.push(...parsed); queryResults.push({ queryId: query.queryId, purpose: plan.purpose, executionStatus: queryComplete ? 'COMPLETE' : 'PARTIAL_BUDGET_EXHAUSTED', complete: queryComplete, requests: queryRequests, received: parsed.length, totalResults: response.totalResults, error: queryComplete ? null : 'Shared request budget was exhausted before this query reached its declared record allocation.' });
    } catch (error) {
      requestsAttempted += queryRequests; failed = true; queryResults.push({ queryId: query.queryId, purpose: plan.purpose, executionStatus: 'FAILED', complete: false, requests: queryRequests, received: 0, totalResults: null, error: error instanceof Error ? error.message : 'Unknown query failure.' });
      for (const remaining of options.plans.slice(planIndex + 1)) queryResults.push({ queryId: remaining.query.queryId, purpose: remaining.purpose, executionStatus: 'NOT_RUN_AFTER_FAILURE', complete: false, requests: 0, received: 0, totalResults: null, error: 'Not run after an earlier query failure.' });
      break;
    }
  }
  const related = assignBibliographicRelationships(records);
  const comparisonComplete = ['PERSIAN_LANGUAGE_FILTER', 'UNFILTERED_COMPARISON'].every((purpose) => queryResults.some((result) => result.purpose === purpose && result.complete));
  const executionStatus: LivePilotResult['executionStatus'] = failed ? 'FAILED' : queryResults.every((result) => result.complete) ? 'COMPLETE' : 'PARTIAL_BUDGET_EXHAUSTED';
  return { authorizationStatus: 'AUTHORIZED', executionStatus, comparisonStatus: comparisonComplete ? 'COMPLETE' : 'NOT_AVAILABLE', requestsAttempted, records: related, quality: summarize(related, related.length, failed ? 1 : 0), queryResults };
}
