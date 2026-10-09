/** First explicitly approved, incremental BSB frozen import into isolated Neon Staging only.
 * A separate Actions job opens/closes a narrowly bounded Staging write window.
 */
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { verifyFrozenReviewPackage, PREVIOUS_RECORD_IDS } from './bsbFrozenPackage';
import { databaseIdentityFingerprint, type WriteEnvironment } from './guard';
import { NeonSnapshotPublisher } from './neon';
import { VercelPrivateBlobArchive } from './vercelBlob';
import { importBsbEvidencePersistent } from './persistent';
import { parseMarcCollection } from '../../validation/acquisition/bsb/marcxml';
import { adaptBsbRecord } from '../../validation/acquisition/bsb/adapter';

const branchId='br-noisy-field-b2m5q1zb';
const hostname='ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const fingerprint='721280eed36907f5da9a76e5937c2bda28c70bc9cc01e695d4c6072f80fbeae2';
const originalSnapshot='snapshot-7946161b2af2652b776a6bd4';
const hash=(str:string)=>createHash('sha256').update(str,'utf8').digest('hex');
const rows=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?v as Record<string,unknown>[]:[];
const str=(v:unknown)=>String(v??'');
function requireConfig(name:string):string{const value=process.env[name];if(!value)throw new Error('Missing required config: '+name);return value;}
function readBundle(){
  const dir=path.resolve('artifacts/phase8l-frozen');
  if(!fs.existsSync(dir))throw new Error('Frozen Phase 8L artifact missing');
  const files:Record<string,string>={};
  function collect(sub:string){
    const folder=path.join(dir,sub);
    for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
      if(entry.isSymbolicLink())throw new Error('Frozen artifact symlink rejected');
      const rel=path.posix.join(sub,entry.name),target=path.join(dir,rel);
      if(entry.isDirectory())collect(rel);
      else if(entry.isFile()&&fs.statSync(target).size<=5_000_000)files[rel]=fs.readFileSync(target,'utf8');
      else throw new Error('Invalid frozen artifact file');
    }
  }
  collect('');
  return {files,seal:verifyFrozenReviewPackage(files)};
}
async function main(){
  const mode=process.argv[2];
  if(!['verify','import','audit'].includes(mode??''))throw new Error('Expected verify, import or audit mode');
  const url=requireConfig('PHASE8G_STAGING_DATABASE_URL');
  const storeId=requireConfig('PHASE8G_STAGING_BLOB_STORE_ID');
  if(requireConfig('PHASE8G_STAGING_DATABASE_FINGERPRINT')!==fingerprint
    ||new URL(url).hostname.toLowerCase()!==hostname)throw new Error('Wrong Staging connection/fingerprint');
  const sql=neon(url);
  const identity=rows(await sql.query("SELECT current_setting('neon.branch_id',true) AS branch_id,current_database() AS db,current_user AS username,current_schema() AS schema"))[0];
  if(!identity||identity.branch_id!==branchId||databaseIdentityFingerprint({host:hostname,database:str(identity.db),user:str(identity.username),schema:str(identity.schema)})!==fingerprint)
    throw new Error('Wrong Neon Staging identity');
  const binding=rows(await sql.query('SELECT namespace,runtime,isolation,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true'))[0];
  if(!binding||binding.namespace!=='phase8g_staging'||binding.runtime!=='preview'
    ||binding.isolation!=='ISOLATED_NEON_BRANCH'||binding.database_fingerprint!==fingerprint)
    throw new Error('Unexpected evidence storage binding');
  const pre=rows(await sql.query(`SELECT s.snapshot_id,s.manifest_checksum,s.status,s.candidate_count,
    s.manifest_checksum=evidence_manifest_checksum(s.schema_version,s.extraction_version,s.source_version_ids,s.manifest_json->'candidates') AS valid_manifest
    FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id WHERE a.singleton=true`))[0];
  if(!pre||pre.valid_manifest!==true)throw new Error('Active snapshot manifest corrupted');
  const {files,seal}=readBundle();
  if(seal.baselineSnapshot!==originalSnapshot||seal.frozenRecordCount!==48||seal.frozenCandidateCount!==72)
    throw new Error('Unexpected frozen BSB seal');

  const retained=rows(await sql.query(`
    SELECT v.source_record_id,v.record_checksum,p.candidate_id,p.content_hash
    FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id
    CROSS JOIN LATERAL jsonb_array_elements_text(s.source_version_ids) vers(id)
    JOIN evidence_record_version v ON v.version_id=vers.id
    LEFT JOIN evidence_candidate_projection p ON p.snapshot_id=a.snapshot_id AND p.source_version_id=v.version_id
    WHERE a.singleton=true AND v.provider='BSB_SRU_MARCXML' ORDER BY v.source_record_id,p.candidate_id
  `));
  function guardOriginal(){
    const originalIds=[...new Set(retained.map(r=>str(r.source_record_id)))].sort();
    if(JSON.stringify(originalIds)!==JSON.stringify([...PREVIOUS_RECORD_IDS].sort())
      ||retained.filter(r=>r.candidate_id!==null).length!==3)
      throw new Error('Baseline frozen legacy records/candidates are not exactly the preserved original');
  }
  if(mode!=='audit'){
    if(pre.snapshot_id!==originalSnapshot||str(pre.manifest_checksum).trim()!==seal.baselineManifestChecksum
      ||Number(pre.candidate_count)!==3)throw new Error('Frozen package baseline is not the active verified snapshot');
    if(binding.writes_enabled!==(mode==='import'))throw new Error('Incorrect Staging write-window status');
    guardOriginal();
    const known=rows(await sql.query('SELECT source_record_id,record_checksum FROM evidence_record_version WHERE provider=$1',['BSB_SRU_MARCXML']));
    const oldSet=new Set(known.map(v=>str(v.source_record_id)));
    if(seal.incomingRecords.some(record=>oldSet.has(record.recordId)))
      throw new Error('A frozen record already exists in Staging: refusing version overwrite');
  }else{
    if(binding.writes_enabled!==false)throw new Error('Staging writes remain enabled after import');
    if(Number(pre.candidate_count)!==75)throw new Error('Expected 75 non-authoritative candidates after incremental import');
    const ids=rows(await sql.query(`
      SELECT v.source_record_id FROM evidence_active_snapshot a
      JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id
      CROSS JOIN LATERAL jsonb_array_elements_text(s.source_version_ids) version(id)
      JOIN evidence_record_version v ON v.version_id=version.id WHERE a.singleton=true AND v.provider='BSB_SRU_MARCXML'`));
    if(ids.length!==50||seal.incomingRecords.some(r=>!ids.some(row=>row.source_record_id===r.recordId)))
      throw new Error('Imported frozen record identities missing from active Staging snapshot');
    console.log(JSON.stringify({status:'PHASE8M_STAGING_IMPORT_AUDIT_OK',activeSnapshot:pre.snapshot_id,
      activeRecords:ids.length,activeCandidates:Number(pre.candidate_count),writesEnabled:false}));
    return;
  }

  const xml=files['frozen-new-records.marcxml'];
  const parsed=parseMarcCollection(xml);
  if(parsed.length!==48||parsed.flatMap(adaptBsbRecord).length!==72
    ||hash(xml)!==seal.filesSha256['frozen-new-records.marcxml'])throw new Error('Frozen MARC/candidates checksum mismatch');
  if(mode==='verify'){
    console.log(JSON.stringify({status:'PHASE8M_FROZEN_STAGING_PREIMPORT_READY',
      snapshot:pre.snapshot_id,priorCandidates:pre.candidate_count,frozenRecords:48,
      frozenCandidates:72,writesEnabled:false,changesMade:false}));
    return;
  }

  if(requireConfig('PHASE8M_STAGING_IMPORT_APPROVED')!=='IMPORT_FROZEN_BSB_48_STAGING')
    throw new Error('No explicit authorization for the frozen 48-record Staging import');
  requireConfig('BLOB_READ_WRITE_TOKEN');
  const environment:WriteEnvironment={runtime:'preview',namespace:'phase8g_staging',
    isolation:'ISOLATED_NEON_BRANCH',allowWrites:true,administrator:true,
    productionApproval:false,expectedDatabaseFingerprint:fingerprint,expectedBlobStoreId:storeId};
  const publisher=new NeonSnapshotPublisher(url,environment);
  await publisher.verifyMigration();
  const archive=new VercelPrivateBlobArchive(environment,storeId);

  // Immutable raw SRU responses are retained separately for full acquisition provenance.
  const pages=seal.filesSha256;
  for(let n=1;n<=5;n++){
    const relative='source/page-'+String(n).padStart(3,'0')+'.xml';
    const raw=files[relative];
    if(!raw||hash(raw)!==pages[relative])throw new Error('Missing/tampered raw SRU page');
    const bytes=new TextEncoder().encode(raw),checksum=hash(raw);
    const name='evidence/phase8g_staging/raw/sha256/'+checksum+'.marcxml';
    await archive.putImmutable(name,bytes,checksum);
    await archive.readVerified(name,checksum);
  }
  let resultingSnapshot:string|null=null;
  try{
    const outcome=await importBsbEvidencePersistent({
      xml,archive,publisher,environment,now:new Date().toISOString(),mode:'INCREMENTAL',
      expectedBaseline:{snapshotId:originalSnapshot,manifestChecksum:seal.baselineManifestChecksum},
      requestBudget:5,recordBudget:48,
      queryPlan:{mode:'FROZEN_PHASE8L_AUDITED_ARTIFACT',sourceRun:seal.sourceActionRun,
        sourceArtifact:seal.sourceArtifact,collectionSha256:seal.filesSha256['frozen-new-records.marcxml'],
        baselineSnapshotId:seal.baselineSnapshot,rawPages:seal.filesSha256,
        sourceLicense:'CC0_1.0',reviewStatus:'UNREVIEWED',
        snapshotUpdateMode:'INCREMENTAL'},
    });
    resultingSnapshot=outcome.snapshotId;
    if(outcome.previousSnapshotId!==originalSnapshot
      ||outcome.recordsObserved!==48||outcome.recordVersionCount!==50
      ||outcome.candidateCount!==75)throw new Error('Unexpected transactional incremental publication counts');
    const previous=rows(await sql.query('SELECT status,candidate_count FROM evidence_snapshot WHERE snapshot_id=$1',[originalSnapshot]))[0];
    if(!previous||previous.status!=='RETIRED'||Number(previous.candidate_count)!==3)
      throw new Error('Original snapshot was not preserved as retrievable rollback target');
    const oldRows=rows(await sql.query(`
      SELECT p.candidate_id,p.content_hash,v.source_record_id FROM evidence_candidate_projection p
      JOIN evidence_record_version v ON v.version_id=p.source_version_id WHERE p.snapshot_id=$1 AND v.source_record_id=ANY($2)
    `,[outcome.snapshotId,[...PREVIOUS_RECORD_IDS]]));
    if(oldRows.length!==3 || oldRows.some(old=>!retained.some(preRow=>preRow.candidate_id===old.candidate_id&&str(preRow.content_hash).trim()===str(old.content_hash).trim())))
      throw new Error('Old candidate hashes not faithfully retained in active snapshot');
    console.log(JSON.stringify({status:'PHASE8M_FROZEN_STAGING_IMPORT_VERIFIED',
      previousSnapshot:originalSnapshot,newSnapshot:outcome.snapshotId,
      recordsAdded:48,candidatesAdded:72,activeRecordVersions:outcome.recordVersionCount,
      activeCandidates:outcome.candidateCount,oldCandidateHashesPreserved:true,
      rollbackSnapshotRetained:true,authorityPromoted:false}));
  }catch(error){
    if(resultingSnapshot){
      const state=rows(await sql.query('SELECT snapshot_id FROM evidence_active_snapshot WHERE singleton=true'))[0];
      if(state?.snapshot_id===resultingSnapshot){
        await publisher.restore(originalSnapshot,new Date().toISOString());
        await publisher.verifySnapshot(originalSnapshot);
        console.error('Post-import failure: previous snapshot restored');
      }
    }
    throw error;
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Frozen BSB staging import failed');process.exitCode=1;});
