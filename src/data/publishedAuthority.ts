import type { PublishedAuthoritySnapshot } from '../domain/authority/types';
import { validatePublishedAuthoritySnapshot } from '../domain/authority/snapshot';

const base = {
  schemaVersion: 'phase8r-authority-snapshot-v1' as const,
  snapshotId: 'phase8r-empty-v1',
  version: 1,
  generatedAt: '2026-10-10T00:00:00.000Z',
  entries: []
};

export const PUBLISHED_AUTHORITY_SNAPSHOT: PublishedAuthoritySnapshot = Object.freeze({
  ...base,
  manifestSha256: '2970678cf3bbad41bf24c25e519b1c707d6d618cfc4a068f70d48ba7671f6780'
});

validatePublishedAuthoritySnapshot(PUBLISHED_AUTHORITY_SNAPSHOT);
