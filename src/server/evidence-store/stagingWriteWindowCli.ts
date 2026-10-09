import { neon } from '@neondatabase/serverless';
import { databaseIdentityFingerprint } from './guard';

const expectedBranch = 'br-noisy-field-b2m5q1zb';
const expectedHost = 'ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const expectedFingerprint = '721280eed36907f5da9a76e5937c2bda28c70bc9cc01e695d4c6072f80fbeae2';

async function main() {
  const action = process.argv[2];
  if (action !== 'enable' && action !== 'disable' && action !== 'status') throw new Error('Expected enable, disable, or status');
  const connection = process.env.PHASE8G_STAGING_DATABASE_URL;
  if (!connection || new URL(connection).hostname.toLowerCase() !== expectedHost) throw new Error('Wrong staging database URL');
  if (process.env.PHASE8G_STAGING_DATABASE_FINGERPRINT !== expectedFingerprint) throw new Error('Wrong staging fingerprint configuration');
  const sql = neon(connection);
  const identity = await sql.query("SELECT current_setting('neon.branch_id', true) AS branch_id,current_database() AS db,current_user AS username,current_schema() AS schema");
  const row = Array.isArray(identity) ? identity[0] : undefined;
  if (!row || row.branch_id !== expectedBranch) throw new Error('Wrong staging branch');
  if (databaseIdentityFingerprint({host:expectedHost,database:String(row.db),user:String(row.username),schema:String(row.schema)}) !== expectedFingerprint) throw new Error('Wrong database identity');
  const binding = await sql.query('SELECT namespace,runtime,isolation,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true');
  const record = Array.isArray(binding) ? binding[0] : undefined;
  if (!record || record.namespace !== 'phase8g_staging' || record.runtime !== 'preview'
      || record.isolation !== 'ISOLATED_NEON_BRANCH' || record.database_fingerprint !== expectedFingerprint)
    throw new Error('Wrong staging binding');
  if (action !== 'status') {
    if (process.env.PHASE8G_STAGING_IMPORT_APPROVED !== 'IMPORT_AUTHENTIC_BSB_STAGING') throw new Error('Missing explicit operator approval');
    const enabled = action === 'enable';
    if (enabled && record.writes_enabled !== false) throw new Error('Staging writes were already enabled');
    const changed = await sql.query(
      'UPDATE evidence_environment_binding SET writes_enabled=$1 WHERE singleton=true AND namespace=$2 AND runtime=$3 AND isolation=$4 AND database_fingerprint=$5 RETURNING writes_enabled',
      [enabled,'phase8g_staging','preview','ISOLATED_NEON_BRANCH',expectedFingerprint]
    );
    if (!Array.isArray(changed) || changed.length !== 1 || changed[0]?.writes_enabled !== enabled) throw new Error('Binding update failed');
  }
  console.log(JSON.stringify({status:'STAGING_BINDING_CHECKED',action,branchId:expectedBranch,writesEnabled:action==='status'?record.writes_enabled:action==='enable'}));
}
main().catch((e:unknown)=>{console.error(e instanceof Error?e.message:'Staging write-window failed');process.exitCode=1;});
