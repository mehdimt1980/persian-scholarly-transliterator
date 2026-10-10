/** One-time read-only BSB harvest to target >=750 total live candidate projections. */
import fs from 'node:fs';
import path from 'node:path';
import {neon} from '@neondatabase/serverless';
import {databaseIdentityFingerprint} from './guard';
import {buildSruUrl,fetchSruPage} from '../../validation/acquisition/bsb/client';
import {parseMarcCollection} from '../../validation/acquisition/bsb/marcxml';
import {
  BASELINE_SNAPSHOT,MAX_PAGES,PAGE_SIZE,TARGET_TOTAL_CANDIDATES,
  freshScaleSelection,selectBsbScaleRecords,renderSelectedBsbBatches,validateScaleSeals,sha,
} from './bsbScaleSelection';

const HOST='ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const BRANCH='br-noisy-field-b2m5q1zb';
const FINGERPRINT='721280eed36907f5da9a76e5937c2bda28c70bc9cc01e695d4c6072f80fbeae2';
const SQL_ROWS=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value as Record<string,unknown>[]:[];
const s=(v:unknown)=>String(v??'');
const output=path.resolve('artifacts/phase8p-bsb-750-freeze');
const REQUEST_DELAY_MS=900;
const query={index:'all_for_ui',relation:'all' as const,term:'فارسی'};
async function main(){
  const url=process.env.PHASE8G_STAGING_DATABASE_URL;
  if(!url||new URL(url).hostname.toLowerCase()!==HOST||process.env.PHASE8G_STAGING_DATABASE_FINGERPRINT!==FINGERPRINT)
    throw new Error('Only the approved isolated Neon Staging branch can be used for acquisition baseline');
  const sql=neon(url);
  const ident=SQL_ROWS(await sql.query("SELECT current_setting('neon.branch_id',true) AS branch_id,current_database() AS db,current_user AS username,current_schema() AS schema"))[0];
  if(!ident||ident.branch_id!==BRANCH||databaseIdentityFingerprint({
    host:HOST,database:s(ident.db),user:s(ident.username),schema:s(ident.schema),
  })!==FINGERPRINT)throw new Error('Staging database identity mismatch');
  const binding=SQL_ROWS(await sql.query('SELECT namespace,runtime,isolation,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true'))[0];
  if(!binding||binding.namespace!=='phase8g_staging'||binding.runtime!=='preview'
    ||binding.isolation!=='ISOLATED_NEON_BRANCH'||binding.database_fingerprint!==FINGERPRINT
    ||binding.writes_enabled!==false)throw new Error('Staging evidence writes must stay closed');
  const baseline=SQL_ROWS(await sql.query(`
    SELECT s.snapshot_id,s.manifest_checksum,s.candidate_count,s.status,
      s.manifest_checksum=evidence_manifest_checksum(s.schema_version,s.extraction_version,s.source_version_ids,s.manifest_json->'candidates') AS intact
    FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id WHERE a.singleton=true
  `))[0];
  if(!baseline||baseline.snapshot_id!==BASELINE_SNAPSHOT||baseline.status!=='ACTIVE'
    ||Number(baseline.candidate_count)!==75||baseline.intact!==true)
    throw new Error('BSB acquisition must start from the known intact 75-candidate baseline');
  const knownRows=SQL_ROWS(await sql.query(`
    SELECT DISTINCT v.source_record_id FROM evidence_active_snapshot a
    JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id
    CROSS JOIN LATERAL jsonb_array_elements_text(s.source_version_ids) ver(id)
    JOIN evidence_record_version v ON v.version_id=ver.id
    WHERE a.singleton=true AND v.provider='BSB_SRU_MARCXML'
  `));
  if(knownRows.length!==50)throw new Error('Expected the 50 original BSB record identities');
  const knownIds=new Set(knownRows.map(x=>s(x.source_record_id)));
  const selection=freshScaleSelection(),pages: Array<{
    file:string;startRecord:number;recordsReceived:number;totalReported:number;
    sourceUrl:string;sha256:string;nextPosition:number|null;
  }>=[];
  const pageFiles:Record<string,string>={};
  let start=1,reportedTotal:number|null=null,completedSource=false;
  for(let n=0;n<MAX_PAGES && selection.candidatesAdded<TARGET_TOTAL_CANDIDATES-75;n++){
    if(n>0)await new Promise(resolve=>setTimeout(resolve,REQUEST_DELAY_MS));
    const request=buildSruUrl(query,start,PAGE_SIZE);
    const {page,xml}=await fetchSruPage(request);
    if(reportedTotal!==null&&reportedTotal!==page.numberOfRecords)
      throw new Error('BSB source result count changed mid-harvest; discard the package');
    reportedTotal=page.numberOfRecords;
    if(page.records.length>PAGE_SIZE||page.records.length===0&&start<=reportedTotal
      ||page.records.length>0&&page.recordPositions[0]!==start)
      throw new Error('BSB paging response is not contiguous');
    if(page.nextRecordPosition!==null&&page.nextRecordPosition!==start+page.records.length)
      throw new Error('BSB non-contiguous continuation cursor');
    const file='source-page-'+String(n+1).padStart(3,'0')+'.xml';
    pages.push({file,startRecord:start,recordsReceived:page.records.length,
      totalReported:page.numberOfRecords,sourceUrl:request.toString(),sha256:sha(xml),
      nextPosition:page.nextRecordPosition});
    pageFiles[file]=xml;
    selectBsbScaleRecords({incoming:page.records,existingRecordIds:knownIds,selection});
    console.log(JSON.stringify({status:'PAGE_COMPLETE',page:n+1,records:page.records.length,
      newRecords:selection.selected.length,newCandidates:selection.candidatesAdded,
      remaining:Math.max(0,TARGET_TOTAL_CANDIDATES-75-selection.candidatesAdded)}));
    if(start+page.records.length-1>=reportedTotal){completedSource=true;break;}
    if(page.nextRecordPosition===null||page.nextRecordPosition<=start)throw new Error('Missing BSB continuation');
    start=page.nextRecordPosition;
  }
  if(selection.candidatesAdded<TARGET_TOTAL_CANDIDATES-75)
    throw new Error('Not enough real BSB records within 20-request budget: '+selection.candidatesAdded+
      ' candidates collected. No partial package will be frozen or imported.');
  if(new Set(selection.seal.map(x=>x.id)).size!==selection.selected.length)
    throw new Error('Duplicate selected MARC identities');
  const packages=renderSelectedBsbBatches(selection.selected);
  const replay=packages.flatMap(p=>parseMarcCollection(p.xml));
  if(validateScaleSeals(replay,selection.seal)!==selection.candidatesAdded)
    throw new Error('Source/candidate freeze replay differs from live BSB');
  const after=SQL_ROWS(await sql.query(`SELECT a.snapshot_id,s.manifest_checksum,b.writes_enabled
    FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id
    CROSS JOIN evidence_environment_binding b WHERE a.singleton=true AND b.singleton=true`))[0];
  if(!after||after.snapshot_id!==baseline.snapshot_id||after.manifest_checksum!==baseline.manifest_checksum
    ||after.writes_enabled!==false)throw new Error('Original Staging snapshot changed during BSB acquisition');

  if(fs.existsSync(output))throw new Error('Refuse to overwrite immutable frozen scale artifact');
  fs.mkdirSync(output,{recursive:true});
  const files:Record<string,string>={};
  for(const [name,xml] of Object.entries(pageFiles))files['source/'+name]=xml;
  for(const p of packages)files['selected/'+p.name]=p.xml;
  const hashes=Object.fromEntries(Object.entries(files).map(([name,body])=>[name,sha(body)]));
  const seal={
    schemaVersion:'phase8p-bsb-scale-750-freeze-v1',provider:'BSB_SRU_MARCXML',
    sourceLicense:'CC0_1.0_BIBLIOGRAPHIC_METADATA_ONLY',
    query,baselineSnapshot:baseline.snapshot_id,
    baselineManifestChecksum:s(baseline.manifest_checksum).trim(),
    baselineRecordCount:knownIds.size,baselineCandidateCount:75,
    targetCandidateCount:TARGET_TOTAL_CANDIDATES,
    totalAfterImport:75+selection.candidatesAdded,
    frozenNewRecords:selection.selected.length,frozenNewCandidates:selection.candidatesAdded,
    skippedExisting:selection.skippedExisting,skippedNonPersian:selection.skippedNoCandidate,
    maxRequests:MAX_PAGES,requestsMade:pages.length,pageSize:PAGE_SIZE,
    sourceTotalReported:reportedTotal,sourceComplete:completedSource,
    pages,records:selection.seal,batches:packages.map(p=>({file:'selected/'+p.name,records:p.recordCount})),
    filesSha256:hashes,reviewStatus:'UNREVIEWED',authorityStatus:'NON_AUTHORITATIVE_CANDIDATE',
    approvedForImport:false,approvedForGold:false,
  };
  files['scale-seal.json']=JSON.stringify(seal,null,2)+'\n';
  for(const [name,body]of Object.entries(files)){
    const abs=path.join(output,name);fs.mkdirSync(path.dirname(abs),{recursive:true});
    fs.writeFileSync(abs,body,{flag:'wx'});
  }
  console.log(JSON.stringify({status:'FROZEN_REAL_BSB_750_READY',baseline:baseline.snapshot_id,
    candidateTarget:TARGET_TOTAL_CANDIDATES,totalAfterImport:seal.totalAfterImport,
    recordsAdded:selection.selected.length,candidatesAdded:selection.candidatesAdded,
    fetchedPages:pages.length,existingSkipped:selection.skippedExisting,
    sourceComplete:completedSource,persisted:false,approvedForGold:false,output}));
}

main().catch(e=>{console.error(e instanceof Error?e.message:'BSB scale-out failed');process.exitCode=1;});
