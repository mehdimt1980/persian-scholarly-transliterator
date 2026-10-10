/** One-time Staging-only migration for a separate append-only review ledger. */
import { neon } from '@neondatabase/serverless';
import {databaseIdentityFingerprint} from '../evidence-store/guard';
const HOST='ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const BRANCH='br-noisy-field-b2m5q1zb';
const FINGERPRINT='721280eed36907f5da9a76e5937c2bda28c70bc9cc01e695d4c6072f80fbeae2';
const rows=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?v as Record<string,unknown>[]:[];
const s=(v:unknown)=>String(v??'');
async function run(){
  const mode=process.argv[2];
  if(mode!=='migrate'&&mode!=='verify')throw new Error('Usage: phase8o review migrate|verify');
  const connection=process.env.PHASE8G_STAGING_DATABASE_URL;
  if(!connection||new URL(connection).hostname.toLowerCase()!==HOST||process.env.PHASE8G_STAGING_DATABASE_FINGERPRINT!==FINGERPRINT)
    throw new Error('Configured database is not the authorized permanent Neon Staging branch');
  const sql=neon(connection);
  const identity=rows(await sql.query("SELECT current_setting('neon.branch_id',true) AS branch_id,current_database() AS db,current_user AS username,current_schema() AS schema"))[0];
  if(!identity||identity.branch_id!==BRANCH||databaseIdentityFingerprint({
    host:HOST,database:s(identity.db),user:s(identity.username),schema:s(identity.schema),
  })!==FINGERPRINT)throw new Error('Review migration database fingerprint mismatch');
  const b=rows(await sql.query("SELECT namespace,runtime,isolation,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true"))[0];
  if(!b||b.namespace!=='phase8g_staging'||b.runtime!=='preview'
    ||b.isolation!=='ISOLATED_NEON_BRANCH'||b.database_fingerprint!==FINGERPRINT
    ||b.writes_enabled!==false)throw new Error('Staging evidence write window must be closed');
  const active=rows(await sql.query("SELECT a.snapshot_id,s.candidate_count FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id WHERE a.singleton=true"))[0];
  if(!active||active.snapshot_id!=='snapshot-f76feb36ca85541c8faafb42'||Number(active.candidate_count)!==75)
    throw new Error('Unexpected active evidence snapshot');
  if(mode==='migrate'){
    if(process.env.PHASE8O_REVIEW_MIGRATION_APPROVAL!=='CREATE_APPEND_ONLY_REVIEW_LEDGER_STAGING')
      throw new Error('Explicit review ledger migration approval absent');
    // Creates ONLY a separate Phase 8O table, index and an immutability trigger.
    await sql.query(`CREATE TABLE IF NOT EXISTS phase8o_review_event (
      event_id UUID PRIMARY KEY,
      active_snapshot_id TEXT NOT NULL REFERENCES evidence_snapshot(snapshot_id),
      candidate_id TEXT NOT NULL,
      review_basis_sha256 TEXT NOT NULL CHECK (review_basis_sha256 ~ '^[a-f0-9]{64}$'),
      decision_kind TEXT NOT NULL CHECK (decision_kind IN ('DRAFT','ACCEPT','REJECT','DEFER')),
      reviewer_ref TEXT,
      decision_json JSONB NOT NULL,
      decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (jsonb_typeof(decision_json) = 'object')
    )`);
    await sql.query('CREATE INDEX IF NOT EXISTS phase8o_review_event_recent ON phase8o_review_event(active_snapshot_id,candidate_id,decided_at DESC,event_id DESC)');
    await sql.query(`CREATE OR REPLACE FUNCTION phase8o_block_event_mutation() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Phase 8O audit entries are append-only'; END; $$`);
    await sql.query('DROP TRIGGER IF EXISTS phase8o_event_immutable ON phase8o_review_event');
    await sql.query('CREATE TRIGGER phase8o_event_immutable BEFORE UPDATE OR DELETE ON phase8o_review_event FOR EACH ROW EXECUTE FUNCTION phase8o_block_event_mutation()');
  }
  const table=rows(await sql.query(`SELECT to_regclass('phase8o_review_event') AS table_name,
    (SELECT count(*)::int FROM information_schema.triggers
      WHERE event_object_table='phase8o_review_event' AND trigger_name='phase8o_event_immutable') AS trigger_count`))[0];
  if(!table?.table_name||Number(table.trigger_count)<1)throw new Error('Review ledger migration validation failed');
  const count=rows(await sql.query('SELECT count(*)::int AS n FROM phase8o_review_event'))[0];
  const after=rows(await sql.query('SELECT a.snapshot_id,b.writes_enabled FROM evidence_active_snapshot a CROSS JOIN evidence_environment_binding b WHERE a.singleton=true AND b.singleton=true'))[0];
  if(after?.snapshot_id!==active.snapshot_id||after?.writes_enabled!==false)throw new Error('Migration changed evidence snapshot or write window');
  console.log(JSON.stringify({status:mode==='migrate'?'REVIEW_LEDGER_CREATED':'REVIEW_LEDGER_VERIFIED',
    branchId:BRANCH,activeEvidenceSnapshot:active.snapshot_id,
    reviewEventCount:Number(count?.n??0),appendOnlyTrigger:true,
    evidenceWritesEnabled:false,evidenceDataChanged:false,promotionAuthorized:false}));
}
run().catch(e=>{console.error(e instanceof Error?e.message:'Phase 8O migration failed');process.exitCode=1;});
