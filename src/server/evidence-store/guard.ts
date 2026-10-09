import { createHash } from 'node:crypto';

export type EvidenceRuntime = 'test' | 'development' | 'preview' | 'production';
export type DatabaseIsolation = 'HERMETIC' | 'ISOLATED_NEON_BRANCH' | 'ISOLATED_SCHEMA' | 'SHARED_OR_UNKNOWN';
export interface WriteEnvironment {
  runtime: EvidenceRuntime;
  allowWrites: boolean;
  namespace: string;
  isolation: DatabaseIsolation;
  productionApproval: boolean;
  administrator: boolean;
  expectedDatabaseFingerprint?: string;
  expectedBlobStoreId?: string;
}
export interface DatabaseIdentity { host: string; database: string; user: string; schema: string; fingerprint: string; }
export interface DatabaseBinding { namespace: string; runtime: EvidenceRuntime; isolation: DatabaseIsolation; databaseFingerprint: string; writesEnabled: boolean; }

export const databaseIdentityFingerprint = (identity: Omit<DatabaseIdentity, 'fingerprint'>): string => createHash('sha256').update([identity.host, identity.database, identity.user, identity.schema].join('\n')).digest('hex');

export function assertSafeEvidenceWrite(environment: WriteEnvironment): void {
  if (!environment.allowWrites) throw new Error('Evidence writes are disabled');
  if (!/^[a-z0-9][a-z0-9_-]{2,62}$/u.test(environment.namespace) || environment.namespace.includes('prod')) throw new Error('Unsafe evidence namespace');
  if (environment.runtime === 'production' && !environment.productionApproval) throw new Error('Production evidence writes require explicit owner approval');
  if (!['HERMETIC', 'ISOLATED_NEON_BRANCH', 'ISOLATED_SCHEMA'].includes(environment.isolation)) throw new Error('Evidence database isolation is unknown or shared');
  if (environment.runtime === 'preview' && environment.isolation === 'HERMETIC') throw new Error('Preview requires an isolated Neon branch or schema');
  if (environment.isolation !== 'HERMETIC' && !/^[0-9a-f]{64}$/u.test(environment.expectedDatabaseFingerprint ?? '')) throw new Error('A verified database identity fingerprint is required');
  if (environment.isolation !== 'HERMETIC' && !environment.expectedBlobStoreId) throw new Error('A verified private Blob store identity is required');
}

export function assertDatabaseBinding(environment: WriteEnvironment, identity: DatabaseIdentity, binding: DatabaseBinding): void {
  assertSafeEvidenceWrite(environment);
  if (identity.fingerprint !== environment.expectedDatabaseFingerprint) throw new Error('Database identity does not match the approved target');
  if (!binding.writesEnabled || binding.namespace !== environment.namespace || binding.runtime !== environment.runtime || binding.isolation !== environment.isolation || binding.databaseFingerprint !== identity.fingerprint) throw new Error('Database-resident evidence environment binding does not authorize this target');
}

export function assertAdministrator(environment: WriteEnvironment): void {
  assertSafeEvidenceWrite(environment);
  if (!environment.administrator) throw new Error('Evidence administration requires explicit administrator mode');
}

export function assertConfiguredBlobStoreIdentity(environment: WriteEnvironment, configuredStoreId: string | undefined): void {
  assertSafeEvidenceWrite(environment);
  if (!configuredStoreId || configuredStoreId !== environment.expectedBlobStoreId) throw new Error('Configured private Blob store identity does not match the approved target');
}

export function environmentFromProcess(env: Readonly<Record<string, string | undefined>>): WriteEnvironment {
  return {
    runtime: env.VERCEL_ENV === 'production' ? 'production' : env.VERCEL_ENV === 'preview' ? 'preview' : env.NODE_ENV === 'test' ? 'test' : 'development',
    allowWrites: env.EVIDENCE_ALLOW_WRITES === 'true', namespace: env.EVIDENCE_STORAGE_NAMESPACE ?? '',
    isolation: (env.EVIDENCE_DATABASE_ISOLATION as DatabaseIsolation) ?? 'SHARED_OR_UNKNOWN',
    productionApproval: env.EVIDENCE_PRODUCTION_WRITE_APPROVED === 'true', administrator: env.EVIDENCE_ADMIN_MODE === 'true',
    expectedDatabaseFingerprint: env.EVIDENCE_DATABASE_FINGERPRINT, expectedBlobStoreId: env.EVIDENCE_BLOB_STORE_ID,
  };
}
