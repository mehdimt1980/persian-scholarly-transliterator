import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { databaseIdentityFingerprint } from '../evidence-store/guard';
import { assertAuthorityManifest } from './manifest';
import { authorizePublication, assertVerifiedPublicationAuthorization, rollbackAuthority, withdrawAuthority,
  type AuthorityPublicationPreview, type VerifiedPublicationAuthorization } from './authorityPublication';
import type { PublishedAuthoritySnapshot } from '../../domain/authority/types';
import type { VerifiedReviewSource } from './sourceVerification';

type Row=Record<string,unknown>;
const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[];
const s=(value:unknown)=>String(value??'');
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
export interface AuthorityDatabaseEnvironment {
  namespace:string; expectedHost:string; expectedDatabaseFingerprint:string; administrator:boolean;
  allowWrites:boolean; isolation:'ISOLATED_NEON_BRANCH'|'ISOLATED_SCHEMA';
  expectedAuthorizationSha256:string; expectedAdministratorRef:string;
}

/** Durable publication ledger. No browser/runtime import may depend on this server-only module. */
export class NeonAuthorityRepository {
  private readonly sql:ReturnType<typeof neon>; private readonly host:string;
  constructor(connectionString:string,private readonly environment:AuthorityDatabaseEnvironment){
    if(!connectionString)throw new Error('PHASE8R_AUTHORITY_DATABASE_URL is required');
    this.host=new URL(connectionString).hostname.toLowerCase();this.sql=neon(connectionString);
  }
  private async preflight(requireWrite=true):Promise<{fingerprint:string;targetSha256:string}>{
    if(!['ISOLATED_NEON_BRANCH','ISOLATED_SCHEMA'].includes(this.environment.isolation))
      throw new Error('AUTHORITY_DATABASE_WRITE_NOT_AUTHORIZED');
    if(requireWrite&&(!this.environment.allowWrites||!this.environment.administrator))
      throw new Error('AUTHORITY_DATABASE_WRITE_NOT_AUTHORIZED');
    if(this.host!==this.environment.expectedHost.toLowerCase())throw new Error('AUTHORITY_DATABASE_HOST_MISMATCH');
    const identity=rows(await this.sql.query('SELECT current_database() AS database,current_user AS user,current_schema() AS schema'))[0];
    if(!identity)throw new Error('AUTHORITY_DATABASE_IDENTITY_UNAVAILABLE');
    const fingerprint=databaseIdentityFingerprint({host:this.host,database:s(identity.database),user:s(identity.user),schema:s(identity.schema)});
    if(fingerprint!==this.environment.expectedDatabaseFingerprint)throw new Error('AUTHORITY_DATABASE_IDENTITY_MISMATCH');
    const binding=rows(await this.sql.query('SELECT namespace,database_fingerprint,writes_enabled,isolation FROM phase8r_authority_environment_binding WHERE singleton=true'))[0];
    if(!binding||s(binding.namespace)!==this.environment.namespace||s(binding.database_fingerprint)!==fingerprint||
      (requireWrite&&binding.writes_enabled!==true)||s(binding.isolation)!==this.environment.isolation)
      throw new Error('AUTHORITY_DATABASE_BINDING_MISMATCH');
    const migration=rows(await this.sql.query(`SELECT to_regclass('phase8r_authority_entry') AS entry,
      to_regclass('phase8r_publication_event') AS event,to_regclass('phase8r_authority_snapshot') AS snapshot,
      to_regclass('phase8r_snapshot_entry') AS membership,
      EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='phase8r_publication_event_immutable' AND tgenabled<>'D') AS immutable_events,
      EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='phase8r_authority_entry_protected' AND tgenabled<>'D') AS protected_entries,
      EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='phase8r_authority_snapshot_protected' AND tgenabled<>'D') AS protected_snapshots`))[0];
    if(!migration?.entry||!migration.event||!migration.snapshot||!migration.membership||migration.immutable_events!==true||
      migration.protected_entries!==true||migration.protected_snapshots!==true)
      throw new Error('AUTHORITY_MIGRATION_INCOMPLETE');
    return {fingerprint,targetSha256:createHash('sha256').update([this.host,s(identity.database),s(identity.schema)].join('\n')).digest('hex')};
  }
  async readActiveSnapshot():Promise<PublishedAuthoritySnapshot>{
    await this.preflight(false);
    const result=rows(await this.sql.query(`SELECT sn.manifest_json FROM phase8r_active_authority_snapshot a
      JOIN phase8r_authority_snapshot sn ON sn.snapshot_id=a.snapshot_id WHERE a.singleton=true AND sn.status='ACTIVE'`));
    if(result.length!==1)throw new Error('ACTIVE_AUTHORITY_SNAPSHOT_MISSING');
    const snapshot=result[0].manifest_json as PublishedAuthoritySnapshot;assertAuthorityManifest(snapshot);return snapshot;
  }
  async publish(preview:AuthorityPublicationPreview,authorization:VerifiedPublicationAuthorization,
    verifiedSource:VerifiedReviewSource,publishedAt:string):Promise<PublishedAuthoritySnapshot>{
    const {fingerprint,targetSha256}=await this.preflight();assertVerifiedPublicationAuthorization(authorization);
    if(authorization.verification.sha256!==this.environment.expectedAuthorizationSha256||
      authorization.administratorRef!==this.environment.expectedAdministratorRef)
      throw new Error('PUBLICATION_AUTHORIZATION_BINDING_MISMATCH');
    if(verifiedSource.verification.databaseTargetSha256!==targetSha256)throw new Error('SOURCE_AND_AUTHORITY_DATABASE_TARGET_MISMATCH');
    const previous=await this.readActiveSnapshot();
    const result=authorizePublication(preview,authorization,publishedAt,previous);
    if(!result.event)return previous;
    const e=result.entry,p=e.provenance,event=result.event,snapshot=result.snapshot;
    const q=[
      this.sql`SELECT pg_advisory_xact_lock(hashtext('phase8r-authority-publication'))`,
      this.sql`SELECT pg_advisory_xact_lock(hashtext('phase8g-evidence-publication'))`,
      this.sql`SELECT 1/count(*)::int AS environment_guard FROM phase8r_authority_environment_binding
        WHERE singleton=true AND namespace=${this.environment.namespace} AND database_fingerprint=${fingerprint}
        AND writes_enabled=true AND isolation=${this.environment.isolation}`,
      this.sql`SELECT 1/count(*)::int AS active_guard FROM phase8r_active_authority_snapshot a
        JOIN phase8r_authority_snapshot sn ON sn.snapshot_id=a.snapshot_id
        WHERE a.singleton=true AND a.snapshot_id=${previous.snapshotId} AND sn.manifest_sha256=${previous.manifestSha256}`,
      // Revalidate source currentness after the publication lock and immediately before mutations.
      this.sql`SELECT 1/count(*)::int AS source_guard FROM phase8o_review_event review
        JOIN evidence_active_snapshot active ON active.singleton=true AND active.snapshot_id=review.active_snapshot_id
        JOIN evidence_snapshot source_snapshot ON source_snapshot.snapshot_id=active.snapshot_id
        JOIN evidence_candidate_projection candidate ON candidate.snapshot_id=active.snapshot_id AND candidate.candidate_id=review.candidate_id
        WHERE review.event_id=${p.reviewEventId}::uuid AND review.decision_kind='ACCEPT'
          AND review.review_basis_sha256=${p.reviewBasisSha256} AND candidate.source_version_id=${p.sourceVersionId}
          AND candidate.content_hash=${verifiedSource.candidateContentHash}
          AND source_snapshot.manifest_checksum=${verifiedSource.verification.activeManifestChecksum}
          AND review.decision_json->>'eventId'=${p.reviewEventId}
          AND review.decision_json->>'basisSha256'=${p.reviewBasisSha256}
          AND review.decision_json->>'kind'='ACCEPT'
          AND NOT EXISTS(SELECT 1 FROM phase8o_review_event later WHERE later.candidate_id=review.candidate_id
            AND (later.decided_at>review.decided_at OR (later.decided_at=review.decided_at AND later.event_id>review.event_id)))`,
      this.sql`SELECT 1/count(*)::int AS conflict_guard FROM (SELECT 1) ok WHERE NOT EXISTS(
        SELECT 1 FROM phase8r_authority_entry WHERE normalized_persian=${e.normalizedPersian} AND profile=${e.profile}
        AND authority_context=${e.context} AND status='ACTIVE' AND canonical<>${e.canonical})`,
      this.sql`SELECT 1/count(*)::int AS review_reuse_guard FROM (SELECT 1) ok WHERE NOT EXISTS(
        SELECT 1 FROM phase8r_authority_entry WHERE review_event_id=${p.reviewEventId}::uuid)`,
      this.sql`INSERT INTO phase8r_authority_entry(entry_id,normalized_persian,persian_surface,canonical,profile,
        authority_context,version,status,review_event_id,candidate_id,source_snapshot_id,source_version_id,
        review_basis_sha256,reviewer_ref,reviewed_at,created_at)
        VALUES(${e.entryId},${e.normalizedPersian},${e.persianSurface},${e.canonical},${e.profile},${e.context},${e.version},
        'ACTIVE',${p.reviewEventId}::uuid,${p.candidateId},${p.sourceSnapshotId},${p.sourceVersionId},${p.reviewBasisSha256},
        ${p.reviewerRef},${p.reviewedAt},${p.publishedAt}) ON CONFLICT(entry_id) DO NOTHING`,
      this.sql`INSERT INTO phase8r_publication_event(event_id,event_kind,entry_id,review_event_id,preview_sha256,
        administrator_ref,authorization_version,reason,event_json,occurred_at)
        VALUES(${event.eventId},'PUBLISH',${e.entryId},${p.reviewEventId}::uuid,${sha(JSON.stringify(preview))},
        ${authorization.administratorRef},${authorization.authorizationVersion},${event.reason},${JSON.stringify(event)}::jsonb,
        ${event.occurredAt}) ON CONFLICT(event_id) DO NOTHING`,
      this.sql`INSERT INTO phase8r_authority_snapshot(snapshot_id,version,manifest_sha256,manifest_json,status,created_at,activated_at)
        VALUES(${snapshot.snapshotId},${snapshot.version},${snapshot.manifestSha256},${JSON.stringify(snapshot)}::jsonb,
        'DRAFT',${snapshot.generatedAt},NULL)`,
      ...snapshot.entries.map(entry=>this.sql`INSERT INTO phase8r_snapshot_entry(snapshot_id,entry_id) VALUES(${snapshot.snapshotId},${entry.entryId})`),
      this.sql`SELECT 1/count(*)::int AS manifest_guard FROM phase8r_authority_snapshot sn WHERE sn.snapshot_id=${snapshot.snapshotId}
        AND sn.manifest_sha256=${snapshot.manifestSha256} AND (SELECT count(*) FROM phase8r_snapshot_entry se WHERE se.snapshot_id=sn.snapshot_id)=${snapshot.entries.length}`,
      this.sql`UPDATE phase8r_authority_snapshot SET status='RETIRED' WHERE snapshot_id=${previous.snapshotId} AND status='ACTIVE'`,
      this.sql`UPDATE phase8r_authority_snapshot SET status='ACTIVE',activated_at=${publishedAt} WHERE snapshot_id=${snapshot.snapshotId} AND status='DRAFT'`,
      this.sql`UPDATE phase8r_active_authority_snapshot SET snapshot_id=${snapshot.snapshotId} WHERE singleton=true AND snapshot_id=${previous.snapshotId}`,
    ];
    try{await this.sql.transaction(q,{isolationLevel:'Serializable'});}catch(error){
      const concurrent=await this.readActiveSnapshot().catch(()=>null);
      if(concurrent?.entries.some(entry=>entry.entryId===e.entryId))return concurrent;
      throw error;
    }
    const active=await this.readActiveSnapshot();
    if(active.snapshotId!==snapshot.snapshotId)throw new Error('AUTHORITY_PUBLICATION_READBACK_FAILED');return active;
  }
  async withdraw(entryId:string,authorization:VerifiedPublicationAuthorization,at:string,reason:string):Promise<PublishedAuthoritySnapshot>{
    const {fingerprint}=await this.preflight();assertVerifiedPublicationAuthorization(authorization);
    if(authorization.verification.sha256!==this.environment.expectedAuthorizationSha256||authorization.administratorRef!==this.environment.expectedAdministratorRef)
      throw new Error('PUBLICATION_AUTHORIZATION_BINDING_MISMATCH');
    const current=await this.readActiveSnapshot(),result=withdrawAuthority(current,entryId,authorization,at,reason);
    const {snapshot,event}=result;
    await this.sql.transaction([
      this.sql`SELECT pg_advisory_xact_lock(hashtext('phase8r-authority-publication'))`,
      this.sql`SELECT 1/count(*)::int FROM phase8r_authority_environment_binding WHERE singleton=true
        AND namespace=${this.environment.namespace} AND database_fingerprint=${fingerprint} AND writes_enabled=true`,
      this.sql`SELECT 1/count(*)::int FROM phase8r_active_authority_snapshot WHERE singleton=true AND snapshot_id=${current.snapshotId}`,
      this.sql`UPDATE phase8r_authority_entry SET status='WITHDRAWN' WHERE entry_id=${entryId} AND status='ACTIVE'`,
      this.sql`INSERT INTO phase8r_publication_event(event_id,event_kind,entry_id,review_event_id,preview_sha256,
        administrator_ref,authorization_version,reason,event_json,occurred_at)
        VALUES(${event.eventId},'WITHDRAW',${entryId},NULL,${sha(JSON.stringify(result))},${authorization.administratorRef},
        ${authorization.authorizationVersion},${reason},${JSON.stringify(event)}::jsonb,${at})`,
      this.sql`INSERT INTO phase8r_authority_snapshot(snapshot_id,version,manifest_sha256,manifest_json,status,created_at)
        VALUES(${snapshot.snapshotId},${snapshot.version},${snapshot.manifestSha256},${JSON.stringify(snapshot)}::jsonb,'DRAFT',${at})`,
      ...snapshot.entries.map(entry=>this.sql`INSERT INTO phase8r_snapshot_entry(snapshot_id,entry_id) VALUES(${snapshot.snapshotId},${entry.entryId})`),
      this.sql`UPDATE phase8r_authority_snapshot SET status='RETIRED' WHERE snapshot_id=${current.snapshotId} AND status='ACTIVE'`,
      this.sql`UPDATE phase8r_authority_snapshot SET status='ACTIVE',activated_at=${at} WHERE snapshot_id=${snapshot.snapshotId}`,
      this.sql`UPDATE phase8r_active_authority_snapshot SET snapshot_id=${snapshot.snapshotId} WHERE singleton=true AND snapshot_id=${current.snapshotId}`,
    ],{isolationLevel:'Serializable'});
    return this.readActiveSnapshot();
  }
  async rollback(targetSnapshotId:string,authorization:VerifiedPublicationAuthorization,at:string,reason:string):Promise<PublishedAuthoritySnapshot>{
    const {fingerprint}=await this.preflight();assertVerifiedPublicationAuthorization(authorization);
    if(authorization.verification.sha256!==this.environment.expectedAuthorizationSha256||authorization.administratorRef!==this.environment.expectedAdministratorRef)
      throw new Error('PUBLICATION_AUTHORIZATION_BINDING_MISMATCH');
    const current=await this.readActiveSnapshot();
    const targetRows=rows(await this.sql.query('SELECT manifest_json FROM phase8r_authority_snapshot WHERE snapshot_id=$1',[targetSnapshotId]));
    if(targetRows.length!==1)throw new Error('AUTHORITY_ROLLBACK_SNAPSHOT_MISSING');
    const target=targetRows[0].manifest_json as PublishedAuthoritySnapshot;assertAuthorityManifest(target);
    const result=rollbackAuthority(current,target,authorization,at,reason),{snapshot,event}=result;
    await this.sql.transaction([
      this.sql`SELECT pg_advisory_xact_lock(hashtext('phase8r-authority-publication'))`,
      this.sql`SELECT 1/count(*)::int FROM phase8r_authority_environment_binding WHERE singleton=true
        AND namespace=${this.environment.namespace} AND database_fingerprint=${fingerprint} AND writes_enabled=true`,
      this.sql`SELECT 1/count(*)::int FROM phase8r_active_authority_snapshot WHERE singleton=true AND snapshot_id=${current.snapshotId}`,
      this.sql`UPDATE phase8r_authority_entry SET status='WITHDRAWN' WHERE status='ACTIVE'`,
      ...snapshot.entries.map(entry=>this.sql`UPDATE phase8r_authority_entry SET status='ACTIVE' WHERE entry_id=${entry.entryId}`),
      this.sql`INSERT INTO phase8r_publication_event(event_id,event_kind,entry_id,review_event_id,preview_sha256,
        administrator_ref,authorization_version,reason,event_json,occurred_at)
        VALUES(${event.eventId},'ROLLBACK',NULL,NULL,${sha(JSON.stringify(result))},${authorization.administratorRef},
        ${authorization.authorizationVersion},${reason},${JSON.stringify(event)}::jsonb,${at})`,
      this.sql`INSERT INTO phase8r_authority_snapshot(snapshot_id,version,manifest_sha256,manifest_json,status,created_at)
        VALUES(${snapshot.snapshotId},${snapshot.version},${snapshot.manifestSha256},${JSON.stringify(snapshot)}::jsonb,'DRAFT',${at})`,
      ...snapshot.entries.map(entry=>this.sql`INSERT INTO phase8r_snapshot_entry(snapshot_id,entry_id) VALUES(${snapshot.snapshotId},${entry.entryId})`),
      this.sql`UPDATE phase8r_authority_snapshot SET status='RETIRED' WHERE snapshot_id=${current.snapshotId} AND status='ACTIVE'`,
      this.sql`UPDATE phase8r_authority_snapshot SET status='ACTIVE',activated_at=${at} WHERE snapshot_id=${snapshot.snapshotId}`,
      this.sql`UPDATE phase8r_active_authority_snapshot SET snapshot_id=${snapshot.snapshotId} WHERE singleton=true AND snapshot_id=${current.snapshotId}`,
    ],{isolationLevel:'Serializable'});
    return this.readActiveSnapshot();
  }
}
