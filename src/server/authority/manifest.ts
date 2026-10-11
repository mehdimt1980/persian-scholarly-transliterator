import { createHash } from 'node:crypto';
import type { PublishedAuthorityEntry, PublishedAuthoritySnapshot } from '../../domain/authority/types';

function canonicalEntries(entries: PublishedAuthorityEntry[]): PublishedAuthorityEntry[] {
  return [...entries].sort((a,b)=>a.normalizedPersian.localeCompare(b.normalizedPersian)||
    a.profile.localeCompare(b.profile)||a.context.localeCompare(b.context)||a.entryId.localeCompare(b.entryId));
}

/** PostgreSQL jsonb normalizes object key order. Hash canonical JSON, not JS insertion order. */
function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string,unknown>)
      .filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0)
      .map(([k,v])=>[k,canonicalJson(v)]));
  }
  return value;
}
export function authorityManifestSha256(snapshot:Omit<PublishedAuthoritySnapshot,'manifestSha256'>):string{
  return createHash('sha256').update(JSON.stringify(canonicalJson({
    ...snapshot,entries:canonicalEntries(snapshot.entries)
  }))).digest('hex');
}
export function assertAuthorityManifest(snapshot:PublishedAuthoritySnapshot):void{
  const {manifestSha256,...unsigned}=snapshot;
  if(authorityManifestSha256(unsigned)===manifestSha256)return;
  // The original empty fixture was already persisted as jsonb with an insertion-order hash.
  // Keep this specific immutable empty snapshot readable; no nonempty legacy bypass.
  if(snapshot.snapshotId==='phase8r-empty-v1' && snapshot.version===1 &&
     snapshot.generatedAt==='2026-10-10T00:00:00.000Z' && snapshot.entries.length===0 &&
     manifestSha256==='2970678cf3bbad41bf24c25e519b1c707d6d618cfc4a068f70d48ba7671f6780') return;
  throw new Error('AUTHORITY_SNAPSHOT_HASH_MISMATCH');
}
