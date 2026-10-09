/** Read-only live Staging scholarly queue export and OFFLINE review decision validation. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { databaseIdentityFingerprint } from './guard';
import { lexicalCandidateSchema } from '../../validation/lexical-evidence/schema';
import {
  buildBsbScholarlyReviewPacket,makePendingDecisionTemplate,renderBsbReviewCsv,
  validateBsbHumanReviewDecisions,verifyBsbScholarlyReviewPacket,
  type ScholarlyReviewPacket,type ScholarlyReviewDecisionFile,
} from './bsbScholarlyReview';

const branch='br-noisy-field-b2m5q1zb';
const host='ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const fingerprint='721280eed36907f5da9a76e5937c2bda28c70bc9cc01e695d4c6072f80fbeae2';
const snapshot='snapshot-f76feb36ca85541c8faafb42';
const hash=(body:string)=>createHash('sha256').update(body,'utf8').digest('hex');
const rows=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value as Record<string,unknown>[]:[];
const text=(value:unknown):string=>String(value??'');
const JSONline=(value:unknown)=>JSON.stringify(value,null,2)+'\n';
const outputDir=path.resolve('artifacts/phase8n-bsb-scholarly-review');

async function exportQueue():Promise<void>{
  const connection=process.env.PHASE8G_STAGING_DATABASE_URL;
  if(!connection||new URL(connection).hostname.toLowerCase()!==host
    ||process.env.PHASE8G_STAGING_DATABASE_FINGERPRINT!==fingerprint)
    throw new Error('Wrong Staging connection/fingerprint');
  const sql=neon(connection);
  const identity=rows(await sql.query("SELECT current_setting('neon.branch_id',true) AS branch_id,current_database() AS db,current_user AS username,current_schema() AS schema"))[0];
  if(!identity||identity.branch_id!==branch
    ||databaseIdentityFingerprint({host,database:text(identity.db),user:text(identity.username),schema:text(identity.schema)})!==fingerprint)
    throw new Error('Unexpected Neon database identity');
  const binding=rows(await sql.query('SELECT namespace,runtime,isolation,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true'))[0];
  if(!binding||binding.namespace!=='phase8g_staging'||binding.runtime!=='preview'
    ||binding.isolation!=='ISOLATED_NEON_BRANCH'||binding.database_fingerprint!==fingerprint
    ||binding.writes_enabled!==false)throw new Error('Review requires isolated Staging with writes disabled');

  const active=rows(await sql.query(`
    SELECT s.snapshot_id,s.manifest_checksum,s.status,s.candidate_count,
      s.manifest_checksum=evidence_manifest_checksum(s.schema_version,s.extraction_version,s.source_version_ids,s.manifest_json->'candidates') AS hash_ok
    FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id WHERE a.singleton=true
  `))[0];
  if(!active||active.snapshot_id!==snapshot||active.status!=='ACTIVE'
    ||active.hash_ok!==true||Number(active.candidate_count)!==75)throw new Error('Unexpected active snapshot or integrity');
  const projections=rows(await sql.query(`
    SELECT p.candidate_id,p.content_hash,p.source_version_id,p.candidate_json
    FROM evidence_active_snapshot a JOIN evidence_candidate_projection p ON p.snapshot_id=a.snapshot_id
    JOIN evidence_record_version v ON v.version_id=p.source_version_id
    WHERE a.singleton=true AND p.provider='BSB_SRU_MARCXML' AND v.provider='BSB_SRU_MARCXML'
      AND p.review_status='UNREVIEWED' AND p.authority_status='NON_AUTHORITATIVE_CANDIDATE'
    ORDER BY p.candidate_id
  `));
  if(projections.length!==75)throw new Error('Not exactly 75 unreviewed BSB candidates');
  const packet=buildBsbScholarlyReviewPacket({
    snapshotId:snapshot,manifestChecksum:text(active.manifest_checksum).trim(),
    rows:projections.map(row=>{
      const candidate=lexicalCandidateSchema.parse(row.candidate_json);
      if(candidate.candidateId!==row.candidate_id || candidate.contentHash!==text(row.content_hash).trim())
        throw new Error('Candidate projection JSON/hash disagreement');
      return {sourceVersionId:text(row.source_version_id),candidate};
    }),
  });
  const template=makePendingDecisionTemplate(packet);
  const summary=validateBsbHumanReviewDecisions(packet,template);
  if(summary.counts.PENDING!==75||summary.counts.ACCEPT!==0)
    throw new Error('Review template unexpectedly approved a candidate');

  // Guard against a changed active snapshot between reading and writing review files.
  const after=rows(await sql.query(`
    SELECT a.snapshot_id,s.manifest_checksum,b.writes_enabled
    FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id
    CROSS JOIN evidence_environment_binding b WHERE a.singleton=true AND b.singleton=true
  `))[0];
  if(!after||after.snapshot_id!==snapshot||text(after.manifest_checksum).trim()!==packet.manifestChecksum
    ||after.writes_enabled!==false)throw new Error('Staging changed during review export');

  if(fs.existsSync(outputDir))throw new Error('Output already exists; do not overwrite review evidence');
  fs.mkdirSync(outputDir,{recursive:true});
  const files:Record<string,string>={
    'review-packet.json':JSONline(packet),
    'human-decisions.template.json':JSONline(template),
    'human-review.csv':renderBsbReviewCsv(packet),
    'validation-preview.json':JSONline(summary),
  };
  const checksums=Object.fromEntries(Object.entries(files).map(([name,body])=>[name,hash(body)]));
  files['file-checksums.json']=JSONline({
    schemaVersion:'phase8n-bsb-review-artifact-seal-v1',activeSnapshotId:snapshot,
    packetSha256:packet.packetSha256,filesSha256:checksums,
    decisionsMade:0,promotionAuthorized:false,databaseWrites:false,
  });
  for(const [name,body] of Object.entries(files))
    fs.writeFileSync(path.join(outputDir,name),body,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({
    status:'BSB_SCHOLARLY_REVIEW_QUEUE_READY',candidateCount:packet.candidateCount,
    pending:summary.counts.PENDING,accepted:0,rejected:0,deferred:0,
    sourceSnapshot:snapshot,packetSha256:packet.packetSha256,
    files:Object.keys(files),databaseWrites:false,promotionAuthorized:false,
  }));
}
function validateOffline(packetFile:string,decisionsFile:string):void{
  const packet=JSON.parse(fs.readFileSync(path.resolve(packetFile),'utf8')) as ScholarlyReviewPacket;
  verifyBsbScholarlyReviewPacket(packet);
  const decisions=JSON.parse(fs.readFileSync(path.resolve(decisionsFile),'utf8')) as ScholarlyReviewDecisionFile;
  const result=validateBsbHumanReviewDecisions(packet,decisions);
  // Validation never mutates the Neon evidence snapshot or lexicon.
  console.log(JSONline(result));
}
async function main(){
  const [mode,first,second]=process.argv.slice(2);
  if(mode==='export')await exportQueue();
  else if(mode==='validate'&&first&&second)validateOffline(first,second);
  else throw new Error('Usage: review export | review validate <review-packet.json> <human-decisions.json>');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Review workflow failed');process.exitCode=1;});
