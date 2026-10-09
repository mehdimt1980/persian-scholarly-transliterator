import crypto from 'node:crypto';

function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)])); return value; }
export function stableJson(value: unknown): string { return JSON.stringify(stable(value)); }
export function sha256(value: unknown): string { return crypto.createHash('sha256').update(stableJson(value), 'utf8').digest('hex'); }
export function recordId(sourceRecordId: string): string { return `cinii-${sha256(sourceRecordId).slice(0, 16)}`; }
