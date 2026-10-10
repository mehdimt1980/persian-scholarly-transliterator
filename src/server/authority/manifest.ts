import { createHash } from 'node:crypto';
import type { PublishedAuthorityEntry, PublishedAuthoritySnapshot } from '../../domain/authority/types';

function canonicalEntries(entries: PublishedAuthorityEntry[]): PublishedAuthorityEntry[] {
  return [...entries].sort((a,b)=>a.normalizedPersian.localeCompare(b.normalizedPersian)||
    a.profile.localeCompare(b.profile)||a.context.localeCompare(b.context)||a.entryId.localeCompare(b.entryId));
}
export function authorityManifestSha256(snapshot:Omit<PublishedAuthoritySnapshot,'manifestSha256'>):string{
  return createHash('sha256').update(JSON.stringify({...snapshot,entries:canonicalEntries(snapshot.entries)})).digest('hex');
}
export function assertAuthorityManifest(snapshot:PublishedAuthoritySnapshot):void{
  const {manifestSha256,...unsigned}=snapshot;
  if(authorityManifestSha256(unsigned)!==manifestSha256)throw new Error('AUTHORITY_SNAPSHOT_HASH_MISMATCH');
}
