import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CiniiPilotArtifact } from '../acquisition/cinii/types';
import { extractLexicalCandidates } from './extractor';
import { LexicalEvidenceIndex } from './index';
import { defaultLivePlans, runLivePilot } from './livePilot';
import { lexicalEvidenceArtifactSchema } from './schema';
import { LEXICAL_EVIDENCE_VERSION, type LexicalEvidenceArtifact } from './types';

const OFFLINE_TIME = '2026-10-09T00:00:00.000Z';
export interface Phase8eCliDependencies { cwd?: string; args?: string[]; env?: NodeJS.ProcessEnv; now?: () => Date; fetchImpl?: typeof fetch; }
function option(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function write(file: string, value: unknown): void { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }

export async function runPhase8eCli(dependencies: Phase8eCliDependencies = {}): Promise<{ liveStatus: LexicalEvidenceArtifact['liveStatus']; candidateCount: number; output: string }> {
  const cwd = dependencies.cwd ?? process.cwd(); const args = dependencies.args ?? process.argv.slice(2); const env = dependencies.env ?? process.env; const live = args.includes('--live');
  const outputDirectory = path.join(cwd, 'validation', 'lexical-evidence'); let records: CiniiPilotArtifact['records']; let generatedAt = OFFLINE_TIME; let sourceMode: LexicalEvidenceArtifact['sourceMode'] = 'OFFLINE_PHASE8D_FIXTURE'; let liveStatus: LexicalEvidenceArtifact['liveStatus'] = 'LIVE_NOT_RUN_MISSING_AUTHORIZATION';
  if (live) {
    const term = option(args, '--query') ?? ''; if (!term) throw new Error('Live Phase 8E requires --query.');
    const result = await runLivePilot({ authorized: args.includes('--confirm-live'), appId: env.CINII_APP_ID, plans: defaultLivePlans(term), maxRecords: 75, maxRequests: 4, delayMs: 1000, retrievedAt: (dependencies.now ?? (() => new Date()))().toISOString(), fetchImpl: dependencies.fetchImpl });
    if (result.status !== 'LIVE_RUN_AUTHORIZED') throw new Error('LIVE_NOT_RUN_MISSING_AUTHORIZATION');
    records = result.records; generatedAt = (dependencies.now ?? (() => new Date()))().toISOString(); sourceMode = 'LIVE_CINII'; liveStatus = result.status;
    write(path.join(outputDirectory, `live-pilot-${generatedAt.replace(/[:.]/gu, '-')}.json`), result);
  } else {
    const artifact = JSON.parse(fs.readFileSync(path.join(cwd, 'validation', 'acquisition', 'cinii', 'offline-pilot.v1.json'), 'utf8')) as CiniiPilotArtifact; records = artifact.records;
  }
  const candidates = extractLexicalCandidates(records); const artifact = lexicalEvidenceArtifactSchema.parse({ schemaVersion: 'phase8e-lexical-artifact-v1', datasetVersion: LEXICAL_EVIDENCE_VERSION, generatedAt, sourceMode, liveStatus, candidates });
  const output = path.join(outputDirectory, sourceMode === 'LIVE_CINII' ? `live-evidence-${generatedAt.replace(/[:.]/gu, '-')}.json` : 'offline-evidence.v1.json'); write(output, artifact);
  const index = new LexicalEvidenceIndex(candidates); const examples = { schemaVersion: 'phase8e-retrieval-demo-v1', examples: [index.search('تاریخ ایران', { category: 'WORK_TITLE' }), index.search('شاهنامه پژوهی'), index.search('اندیشه ترقی و حکومت قانون')] }; write(path.join(outputDirectory, 'retrieval-demo.v1.json'), examples);
  write(path.join(outputDirectory, 'live-status.v1.json'), { status: liveStatus, reason: liveStatus === 'LIVE_NOT_RUN_MISSING_AUTHORIZATION' ? 'No explicit authorized credential was available; no network request was made.' : null, generatedAt });
  return { liveStatus, candidateCount: candidates.length, output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runPhase8eCli().then((result) => console.log(JSON.stringify(result))).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
