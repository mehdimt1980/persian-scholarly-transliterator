/** Phase 8P-C: independently verified, bounded batch import from immutable prior Actions SRU artifact. */
import fs from 'node:fs';
import path from 'node:path';
import {neon} from '@neondatabase/serverless';
import {buildSruUrl} from '../../validation/acquisition/bsb/client';
import {parseMarcCollection,parseSruMarcXml} from '../../validation/acquisition/bsb/marcxml';
import {adaptBsbRecord} from '../../validation/acquisition/bsb/adapter';
import {databaseIdentityFingerprint,type WriteEnvironment} from './guard';
import {VercelPrivateBlobArchive} from './vercelBlob';
import {NeonSnapshotPublisher} from './neon';
import {importBsbEvidencePersistent} from './persistent';
import {
 BASELINE_SNAPSHOT,TARGET_TOTAL_CANDIDATES,MAX_PAGES,PAGE_SIZE,
 validateScaleSeals,sha,type ScaleRecordSeal
} from './bsbScaleSelection';

const HOST='ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const BRANCH='br-noisy-field-b2m5q1zb';
const FINGERPRINT='721280eed36907f5da9a76e5937c2bda28c70bc9cc01e695d4c6072f80fbeae2';
const SOURCE_RUN=38039056666;
const SOURCE_ARTIFACT='phase8p-bsb-750-source-frozen';
const artifactDir=path.resolve('artifacts/phase8p-bsb-750-freeze');
const rows=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?v as Record<string,unknown>[]:[];
const str=(v:unknown)=>String(v??'');
function fail(message:string):never{throw new Error('Phase8P frozen import rejected: '+message);}
function required(key:string):string{const v=process.env[key];if(!v)fail('Missing '+key);return v;}
type ScaleSeal={
 schemaVersion:string;provider:string;sourceLicense:string;
 baselineSnapshot:string;baselineManifestChecksum:string;baselineRecordCount:number;baselineCandidateCount:number;
 targetCandidateCount:number;totalAfterImport:number;frozenNewRecords:number;frozenNewCandidates:number;
 skippedExisting:number;maxRequests:number;requestsMade:number;pageSize:number;
 pages:Array<{file:string;startRecord:number;recordsReceived:number;totalReported:number;sourceUrl:string;sha256:string;nextPosition:number|null}>;
 records:ScaleRecordSeal[];
 batches:Array<{file:string;records:number}>;
 filesSha256:Record<string,string>;
 reviewStatus:string;authorityStatus:string;approvedForImport:boolean;approvedForGold:boolean;
};
type TrustedBundle={seal:ScaleSeal;sourcePages:Array<{file:string;content:string;hash:string}>;
 batches:Array<{name:string;xml:string;count:number;newCandidates:number}>};
function readAndVerifyBundle():TrustedBundle{
 if(!fs.existsSync(artifactDir)||!fs.statSync(artifactDir).isDirectory())fail('Pinned artifact missing');
 const fileSet=new Set<string>();
 function inspect(relative:string){
   const abs=path.resolve(artifactDir,relative);
   if(!abs.startsWith(artifactDir+path.sep))fail('Artifact path escape');
   const stat=fs.lstatSync(abs);
   if(stat.isSymbolicLink()||!stat.isFile()||stat.size>5_000_000)fail('Invalid archive file '+relative);
   fileSet.add(relative);
   return fs.readFileSync(abs,'utf8');
 }
 const seal=JSON.parse(inspect('scale-seal.json')) as ScaleSeal;
 if(!seal||seal.schemaVersion!=='phase8p-bsb-scale-750-freeze-v1'
   ||seal.provider!=='BSB_SRU_MARCXML'
   ||seal.sourceLicense!=='CC0_1.0_BIBLIOGRAPHIC_METADATA_ONLY'
   ||seal.baselineSnapshot!==BASELINE_SNAPSHOT||!/^[a-f0-9]{64}$/u.test(seal.baselineManifestChecksum)
   ||seal.baselineRecordCount!==50||seal.baselineCandidateCount!==75
   ||seal.targetCandidateCount!==TARGET_TOTAL_CANDIDATES||seal.totalAfterImport!==750
   ||seal.frozenNewCandidates!==675||seal.frozenNewRecords!==311
   ||seal.approvedForImport!==false||seal.approvedForGold!==false
   ||seal.reviewStatus!=='UNREVIEWED'||seal.authorityStatus!=='NON_AUTHORITATIVE_CANDIDATE'
   ||seal.maxRequests!==MAX_PAGES||seal.pageSize!==PAGE_SIZE
   ||seal.requestsMade!==8||seal.pages?.length!==8||seal.records?.length!==311
   ||seal.batches?.length!==8)
   fail('Frozen acquisition seal identity/count/authority mismatch');
 const expectedPaths=new Set(['scale-seal.json']);
 const pages=seal.pages.map((p,index)=>{
   if(p.file!=='source-page-'+String(index+1).padStart(3,'0')+'.xml'
     ||p.startRecord!==index*50+1||p.recordsReceived!==50
     ||p.sourceUrl!==buildSruUrl({index:'all_for_ui',relation:'all',term:'فارسی'},p.startRecord,50).toString())
     fail('Unexpected frozen source page cursor or URL');
   const relative='source/'+p.file;
   expectedPaths.add(relative);
   const raw=inspect(relative);
   if(sha(raw)!==p.sha256||seal.filesSha256[relative]!==p.sha256)
     fail('Raw BSB source page was modified');
   const parsed=parseSruMarcXml(raw);
   if(parsed.records.length!==p.recordsReceived||parsed.numberOfRecords!==p.totalReported
     ||parsed.recordPositions[0]!==p.startRecord)
     fail('Original raw SRU page cannot be independently replayed');
   return {file:relative,content:raw,hash:p.sha256,records:parsed.records};
 });
 const rawIndex=new Map<string,string>();
 for(const page of pages)for(const record of page.records){
   const id=record.controlfields.find(x=>x.tag==='001')?.value;
   if(!id||rawIndex.has(id))fail('Duplicate source MARC 001 in source pages');
   rawIndex.set(id,sha(record.rawXml));
 }
 let offset=0;
 const batches=seal.batches.map((b,index)=>{
   if(b.file!=='selected/selected-batch-'+String(index+1).padStart(3,'0')+'.marcxml'
     ||b.records<1||b.records>40)fail('Invalid selected batch shape');
   expectedPaths.add(b.file);
   const xml=inspect(b.file);
   if(sha(xml)!==seal.filesSha256[b.file])fail('Selected batch hash mismatch');
   const records=parseMarcCollection(xml),seals=seal.records.slice(offset,offset+records.length);
   if(records.length!==b.records||records.length!==seals.length)fail('Selected batch MARC count mismatch');
   const candidateCount=validateScaleSeals(records,seals);
   for(const r of records){
     const id=r.controlfields.find(x=>x.tag==='001')?.value;
     if(!id||rawIndex.get(id)!==sha(r.rawXml))fail('Selected MARC is absent from the archived original SRU pages');
   }
   offset+=records.length;
   return {name:b.file,xml,count:b.records,newCandidates:candidateCount};
 });
 if(offset!==311||batches.reduce((sum,x)=>sum+x.newCandidates,0)!==675
   ||Object.keys(seal.filesSha256).length!==expectedPaths.size-1)
   fail('Frozen record/candidate counts not exactly replayable');
 // Reject silently injected files, even if unused by importer.
 function scan(dir:string,relative=''){
   for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
     const pathRel=relative?relative+'/'+entry.name:entry.name;
     if(entry.isSymbolicLink())fail('Symlink in artifact');
     if(entry.isDirectory())scan(path.join(dir,entry.name),pathRel);
     else if(!entry.isFile()||!expectedPaths.has(pathRel)||!fileSet.has(pathRel))
       fail('Unexpected artifact file '+pathRel);
   }
 }
 scan(artifactDir);
 if(fileSet.size!==expectedPaths.size)fail('Frozen source files missing');
 return {seal,sourcePages:pages.map(({file,content,hash})=>({file,content,hash})),batches};
}
async function main(){
 const mode=process.argv[2];
 if(!['verify','import','audit'].includes(mode??''))fail('Expected verify|import|audit');
 const connection=required('PHASE8G_STAGING_DATABASE_URL'),storeId=required('PHASE8G_STAGING_BLOB_STORE_ID');
 if(new URL(connection).hostname.toLowerCase()!==HOST
   ||required('PHASE8G_STAGING_DATABASE_FINGERPRINT')!==FINGERPRINT)fail('Wrong Staging connection');
 const sql=neon(connection);
 const identity=rows(await sql.query("SELECT current_setting('neon.branch_id',true) AS branch_id,current_database() AS db,current_user AS username,current_schema() AS schema"))[0];
 if(!identity||identity.branch_id!==BRANCH||databaseIdentityFingerprint({
    host:HOST,database:str(identity.db),user:str(identity.username),schema:str(identity.schema)
 })!==FINGERPRINT)fail('Wrong database identity');
 const binding=rows(await sql.query('SELECT namespace,runtime,isolation,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true'))[0];
 if(!binding||binding.namespace!=='phase8g_staging'||binding.runtime!=='preview'
   ||binding.isolation!=='ISOLATED_NEON_BRANCH'||binding.database_fingerprint!==FINGERPRINT)
   fail('Staging binding mismatch');
 const active=rows(await sql.query(`
    SELECT s.snapshot_id,s.manifest_checksum,s.candidate_count,s.status,
      s.manifest_checksum=evidence_manifest_checksum(s.schema_version,s.extraction_version,s.source_version_ids,s.manifest_json->'candidates') AS intact
    FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id WHERE a.singleton=true
 `))[0];
 if(!active||active.intact!==true||active.status!=='ACTIVE')fail('Active Staging snapshot integrity invalid');
 const bundle=readAndVerifyBundle();
 if(mode==='verify'){
   if(active.snapshot_id!==BASELINE_SNAPSHOT||str(active.manifest_checksum).trim()!==bundle.seal.baselineManifestChecksum
     ||Number(active.candidate_count)!==75||binding.writes_enabled!==false)
     fail('Frozen batch does not match current 75-candidate baseline');
   const known=rows(await sql.query("SELECT DISTINCT source_record_id FROM evidence_record_version WHERE provider='BSB_SRU_MARCXML'"));
   if(known.length!==50||bundle.seal.records.some(r=>known.some(k=>k.source_record_id===r.id)))
     fail('Frozen source identities overlap existing Staging history');
   console.log(JSON.stringify({status:'PHASE8P_750_PREIMPORT_VERIFIED',
     baseline:active.snapshot_id,newRecords:311,newCandidates:675,expectedTotal:750,
     writeWindowEnabled:false,archived:false,imported:false}));
   return;
 }
 if(mode==='audit'){
   if(binding.writes_enabled!==false||Number(active.candidate_count)!==750||active.snapshot_id===BASELINE_SNAPSHOT)
     fail('Target 750 candidate snapshot is not active with writes disabled');
   const count=rows(await sql.query(`
      SELECT (SELECT count(*)::int FROM evidence_candidate_projection p
        WHERE p.snapshot_id=$1 AND p.authority_status='NON_AUTHORITATIVE_CANDIDATE'
          AND p.review_status='UNREVIEWED') AS unreviewed,
      (SELECT count(*)::int FROM evidence_record_version v WHERE v.version_id IN
        (SELECT jsonb_array_elements_text(s.source_version_ids))) AS record_count
      FROM evidence_snapshot s WHERE s.snapshot_id=$1
   `,[active.snapshot_id]))[0];
   const old=rows(await sql.query('SELECT status,candidate_count FROM evidence_snapshot WHERE snapshot_id=$1',[BASELINE_SNAPSHOT]))[0];
   if(!count||Number(count.unreviewed)!==750||Number(count.record_count)!==361
     ||!old||old.status!=='RETIRED'||Number(old.candidate_count)!==75)
     fail('750 candidate provenance, full nonauthority or rollback guarantee invalid');
   console.log(JSON.stringify({status:'PHASE8P_750_STAGING_AUDIT_OK',
     activeSnapshot:active.snapshot_id,totalCandidates:750,recordVersions:361,
     baselinePreserved:BASELINE_SNAPSHOT,rollbackRetained:true,
     writesEnabled:false,authorityPromoted:false}));
   return;
 }
 if(required('PHASE8P_IMPORT_APPROVED')!=='IMPORT_FROZEN_BSB_750_STAGING')fail('Explicit authorization not present');
 if(!required('BLOB_READ_WRITE_TOKEN'))fail('Blob storage token missing');
 if(binding.writes_enabled!==true||active.snapshot_id!==BASELINE_SNAPSHOT
   ||str(active.manifest_checksum).trim()!==bundle.seal.baselineManifestChecksum
   ||Number(active.candidate_count)!==75)fail('Write window or baseline not ready');
 const environment:WriteEnvironment={runtime:'preview',namespace:'phase8g_staging',isolation:'ISOLATED_NEON_BRANCH',
   allowWrites:true,administrator:true,productionApproval:false,
   expectedDatabaseFingerprint:FINGERPRINT,expectedBlobStoreId:storeId};
 const publisher=new NeonSnapshotPublisher(connection,environment);
 await publisher.verifyMigration();
 const archive=new VercelPrivateBlobArchive(environment,storeId);
 // Verify immutable original source pages in private Vercel Blob before touching the DB.
 for(const p of bundle.sourcePages){
   const name='evidence/phase8g_staging/raw/sha256/'+p.hash+'.marcxml';
   await archive.putImmutable(name,new TextEncoder().encode(p.content),p.hash);
   await archive.readVerified(name,p.hash);
 }
 let expected={snapshotId:BASELINE_SNAPSHOT,manifestChecksum:bundle.seal.baselineManifestChecksum};
 let priorTotal=75,priorRecords=50,batchesDone=0;
 try{
   for(const part of bundle.batches){
     const result=await importBsbEvidencePersistent({
       xml:part.xml,archive,publisher,environment,now:new Date().toISOString(),
       mode:'INCREMENTAL',expectedBaseline:expected,requestBudget:bundle.seal.requestsMade,
       recordBudget:part.count,
       queryPlan:{mode:'FROZEN_PHASE8P_BSB_750',sourceRun:SOURCE_RUN,sourceArtifact:SOURCE_ARTIFACT,
         batchFile:part.name,batchSha256:sha(part.xml),baselineSnapshot:BASELINE_SNAPSHOT,
         sourcePageChecksums:bundle.sourcePages.map(x=>x.hash),reviewStatus:'UNREVIEWED',
         authorityPromoted:false,sourceLicense:'CC0_1.0',wholeMARCRecordsOnly:true},
     });
     priorTotal+=part.newCandidates;priorRecords+=part.count;batchesDone++;
     if(result.previousSnapshotId!==expected.snapshotId
       ||result.recordVersionCount!==priorRecords||result.candidateCount!==priorTotal)
       fail('Unexpected transactional count or active snapshot after batch '+batchesDone);
     const srow=rows(await sql.query('SELECT manifest_checksum FROM evidence_snapshot WHERE snapshot_id=$1',[result.snapshotId]))[0];
     if(!srow||!/^[a-f0-9]{64}$/u.test(str(srow.manifest_checksum).trim()))
       fail('Imported intermediate snapshot checksum unavailable');
     expected={snapshotId:result.snapshotId,manifestChecksum:str(srow.manifest_checksum).trim()};
     console.log(JSON.stringify({status:'VERIFIED_BSB_SCALE_BATCH',batch:batchesDone,
       intermediateSnapshot:result.snapshotId,activeCandidates:result.candidateCount,activeRecords:result.recordVersionCount}));
   }
   if(priorTotal!==750||priorRecords!==361||batchesDone!==8)fail('Final frozen batch count mismatch');
   const old=rows(await sql.query('SELECT status,candidate_count FROM evidence_snapshot WHERE snapshot_id=$1',[BASELINE_SNAPSHOT]))[0];
   if(!old||old.status!=='RETIRED'||Number(old.candidate_count)!==75)
     fail('Original rollback snapshot was not preserved');
   console.log(JSON.stringify({status:'PHASE8P_750_STAGING_IMPORT_VERIFIED',
     activeSnapshot:expected.snapshotId,rollbackSnapshot:BASELINE_SNAPSHOT,
     newRecords:311,newCandidates:675,totalCandidateCount:750,totalRecords:361,
     authorityPromoted:false}));
 }catch(e){
   // Even if a publisher throws AFTER committing an intermediate batch, discover
   // the live active snapshot rather than trusting the last locally saved ID.
   const live=rows(await sql.query('SELECT snapshot_id FROM evidence_active_snapshot WHERE singleton=true'))[0];
   if(live&&live.snapshot_id!==BASELINE_SNAPSHOT){
     await publisher.restore(BASELINE_SNAPSHOT,new Date().toISOString());
     await publisher.verifySnapshot(BASELINE_SNAPSHOT);
     console.error('Phase 8P import failed: original 75-candidate snapshot restored');
   }
   throw e;
 }
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Phase8P import failed');process.exitCode=1;});
