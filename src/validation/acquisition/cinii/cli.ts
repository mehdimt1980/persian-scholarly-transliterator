import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CiniiResearchClient } from './client';
import { toPhase8cReviewCandidates } from './converter';
import { parseCiniiItems } from './parser';
import { buildArtifact } from './pipeline';
import type { CiniiQueryConfig } from './types';

const FIXED_OFFLINE_TIMESTAMP = '2026-10-09T00:00:00.000Z';
const OFFLINE_QUERY: CiniiQueryConfig = { queryId: 'phase8d-offline-fixture-v1', q: 'fixture', sortorder: 0, count: 100 };

export interface CliDependencies { cwd?: string; env?: NodeJS.ProcessEnv; args?: string[]; now?: () => Date; fetchImpl?: typeof fetch; }

function option(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function positiveInteger(value: string | undefined, fallback: number, name: string): number { const parsed = value === undefined ? fallback : Number(value); if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`); return parsed; }
function writeJson(file: string, value: unknown): void { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }

export async function runCiniiCli(dependencies: CliDependencies = {}): Promise<{ mode: 'OFFLINE_MOCKED' | 'LIVE_CINII'; recordCount: number; output: string }> {
  const cwd = dependencies.cwd ?? process.cwd(); const env = dependencies.env ?? process.env; const args = dependencies.args ?? process.argv.slice(2);
  const live = args.includes('--live'); const outputDirectory = path.join(cwd, 'validation', 'acquisition', 'cinii');
  if (!live) {
    const fixture = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'mock-response.v1.json'), 'utf8')) as unknown;
    const records = parseCiniiItems(fixture, OFFLINE_QUERY, FIXED_OFFLINE_TIMESTAMP);
    const artifact = buildArtifact(records, OFFLINE_QUERY, FIXED_OFFLINE_TIMESTAMP, 'OFFLINE_MOCKED');
    const output = path.join(outputDirectory, 'offline-pilot.v1.json');
    writeJson(output, artifact); writeJson(path.join(outputDirectory, 'phase8c-review-candidates.v1.json'), { schemaVersion: 'phase8d-phase8c-candidate-export-v1', generatedAt: FIXED_OFFLINE_TIMESTAMP, authority: 'REVIEW_ONLY_NO_GOLD_PROMOTION', candidates: toPhase8cReviewCandidates(artifact.records) });
    return { mode: 'OFFLINE_MOCKED', recordCount: artifact.records.length, output };
  }
  if (!args.includes('--confirm-live')) throw new Error('Live acquisition requires --confirm-live explicit authorization.');
  const appId = env.CINII_APP_ID?.trim(); if (!appId) throw new Error('CINII_APP_ID is required for live acquisition.');
  const q = option(args, '--query'); const title = option(args, '--title'); const queryId = option(args, '--query-id');
  if (!queryId || (!q && !title)) throw new Error('Live acquisition requires --query-id and either --query or --title.');
  const maxRecords = positiveInteger(option(args, '--max-records'), 100, 'max-records'); const maxRequests = positiveInteger(option(args, '--max-requests'), 3, 'max-requests'); const delayMs = positiveInteger(option(args, '--delay-ms'), 1000, 'delay-ms');
  const query: CiniiQueryConfig = { queryId, q, title, sortorder: 0, count: Math.min(maxRecords, 100) };
  const client = new CiniiResearchClient({ appId, maxRecords, maxRequests, delayMs, fetchImpl: dependencies.fetchImpl });
  const response = await client.fetchPilot(query); const retrievedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const records = parseCiniiItems({ 'opensearch:totalResults': response.totalResults, 'opensearch:startIndex': 1, 'opensearch:itemsPerPage': response.items.length, items: response.items }, query, retrievedAt);
  const artifact = buildArtifact(records, query, retrievedAt, 'LIVE_CINII'); const output = path.join(outputDirectory, `live-pilot-${retrievedAt.replace(/[:.]/gu, '-')}.json`);
  writeJson(output, artifact); return { mode: 'LIVE_CINII', recordCount: artifact.records.length, output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCiniiCli().then((result) => console.log(JSON.stringify(result))).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
