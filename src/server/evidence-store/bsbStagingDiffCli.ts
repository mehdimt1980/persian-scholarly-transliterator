/** Phase 8J: read-only comparison of bounded LIVE BSB pages against persistent Neon staging.
 * Does not import, publish, open a write window, or mutate any store.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { collectBsbPagedEvidence } from '../../validation/bsbPagedAcquisitionCli';
import { databaseIdentityFingerprint } from './guard';
import { parseMarcCollection, parseSruMarcXml } from '../../validation/acquisition/bsb/marcxml';
import { lexicalCandidateSchema } from '../../validation/lexical-evidence/schema';
import { reconcileBsbSelectedFixture } from './bsbFixtureReconciliation';
import { compareBsbWithActiveStaging, type ActiveRecordVersion, type ActiveCandidateProjection } from './bsbStagingComparison';

const expectedBranchId='br-noisy-field-b2m5q1zb';
const expectedHost='ep-super-meadow-b28s6g97-pooler.c-6.eu-central-1.aws.neon.tech';
const expectedFingerprint='721280eed36907f5da9a76e5937c2bda28c70bc9cc01e695d4c6072f80fbeae2';
const expectedSnapshotId='snapshot-7946161b2af2652b776a6bd4';
const sha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
const rowsOf=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value as Record<string,unknown>[]:[];
const requireEnv=(key:string):string=>{
  const value=process.env[key];
  if(!value)throw new Error(`Missing required staging environment value: ${key}`);
  return value;
};
const version=(row:Record<string,unknown>):ActiveRecordVersion=>({
  sourceRecordId:String(row.source_record_id), recordChecksum:String(row.record_checksum).trim(),
  versionId:String(row.version_id),
});
const candidate=(row:Record<string,unknown>):ActiveCandidateProjection=>({
  candidateId:String(row.candidate_id), contentHash:String(row.content_hash).trim(),
  sourceVersionId:String(row.source_version_id),
});
const str=(value:unknown):string=>String(value??'');

async function main():Promise<void>{
  const url=requireEnv('PHASE8G_STAGING_DATABASE_URL');
  if(requireEnv('PHASE8G_STAGING_DATABASE_FINGERPRINT')!==expectedFingerprint)
    throw new Error('Unexpected expected Neon fingerprint');
  const parsed=new URL(url);
  if(!['postgres:','postgresql:'].includes(parsed.protocol)||parsed.hostname.toLowerCase()!==expectedHost)
    throw new Error('Non-staging Neon host rejected');
  const sql=neon(url);

  const identity=rowsOf(await sql.query("SELECT current_setting('neon.branch_id',true) AS branch_id,current_database() AS db,current_user AS username,current_schema() AS schema"))[0];
  if(!identity || identity.branch_id!==expectedBranchId
    || databaseIdentityFingerprint({host:expectedHost,database:str(identity.db),user:str(identity.username),schema:str(identity.schema)})!==expectedFingerprint)
    throw new Error('Read-only comparison refused: wrong Neon branch or identity');

  const binding=rowsOf(await sql.query('SELECT namespace,runtime,isolation,database_fingerprint,writes_enabled FROM evidence_environment_binding WHERE singleton=true'))[0];
  if(!binding||binding.namespace!=='phase8g_staging'||binding.runtime!=='preview'
    ||binding.isolation!=='ISOLATED_NEON_BRANCH'
    ||binding.database_fingerprint!==expectedFingerprint||binding.writes_enabled!==false)
    throw new Error('Read-only comparison refused: staging binding mismatch or writes enabled');

  const snapshotRows=rowsOf(await sql.query(`
    SELECT s.snapshot_id,s.status,s.manifest_checksum,s.candidate_count,
      s.manifest_checksum=evidence_manifest_checksum(s.schema_version,s.extraction_version,s.source_version_ids,s.manifest_json->'candidates') AS checksum_valid,
      (SELECT count(*)::int FROM evidence_candidate_projection cp WHERE cp.snapshot_id=s.snapshot_id) AS actual_candidate_count,
      NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(s.source_version_ids) source(id)
                 WHERE NOT EXISTS(SELECT 1 FROM evidence_record_version v WHERE v.version_id=source.id)) AS sources_present
    FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id
    WHERE a.singleton=true
  `));
  const snapshot=snapshotRows[0];
  if(snapshotRows.length!==1||!snapshot||snapshot.snapshot_id!==expectedSnapshotId
    ||snapshot.status!=='ACTIVE'||snapshot.checksum_valid!==true||snapshot.sources_present!==true
    ||Number(snapshot.candidate_count)!==Number(snapshot.actual_candidate_count))
    throw new Error('Active staging snapshot identity or manifest integrity verification failed');
  const activeSnapshotId=str(snapshot.snapshot_id);
  const baselineManifestChecksum=str(snapshot.manifest_checksum).trim();

  const activeRecords=rowsOf(await sql.query(`
    SELECT v.source_record_id,v.record_checksum,v.version_id
    FROM evidence_active_snapshot a JOIN evidence_snapshot s ON s.snapshot_id=a.snapshot_id
    CROSS JOIN LATERAL jsonb_array_elements_text(s.source_version_ids) source(id)
    JOIN evidence_record_version v ON v.version_id=source.id
    WHERE a.singleton=true AND v.provider='BSB_SRU_MARCXML'
  `)).map(version);
  const knownRaw=rowsOf(await sql.query(`
    SELECT source_record_id,record_checksum,version_id
    FROM evidence_record_version WHERE provider='BSB_SRU_MARCXML'
    ORDER BY source_record_id,version_id LIMIT 2000
  `));
  if(knownRaw.length>=2000)throw new Error('Historical identity scan truncated; comparison refused');
  const historicalRecords=knownRaw.map(version);
  const activeCandidates=rowsOf(await sql.query(`
    SELECT cp.candidate_id,cp.content_hash,cp.source_version_id
    FROM evidence_active_snapshot a JOIN evidence_candidate_projection cp ON cp.snapshot_id=a.snapshot_id
    WHERE a.singleton=true AND cp.provider='BSB_SRU_MARCXML'
  `)).map(candidate);
  if(activeCandidates.length!==Number(snapshot.candidate_count))
    throw new Error('Active BSB candidate count inconsistent with snapshot');
  const activeCandidateJsonRows=rowsOf(await sql.query(`
    SELECT cp.candidate_json
    FROM evidence_active_snapshot a JOIN evidence_candidate_projection cp ON cp.snapshot_id=a.snapshot_id
    WHERE a.singleton=true AND cp.provider='BSB_SRU_MARCXML'
  `));
  if(activeCandidateJsonRows.length!==activeCandidates.length)
    throw new Error('Active candidate JSON count mismatch');
  const persistedCandidates=activeCandidateJsonRows.map(row=>lexicalCandidateSchema.parse(row.candidate_json));

  const {manifest,rawPages}=await collectBsbPagedEvidence();
  if(rawPages.length!==manifest.pages.length||rawPages.length<1)
    throw new Error('Missing BSB raw source pages');
  for(const [i,page] of rawPages.entries()){
    if(page.file!==manifest.pages[i].file||sha(page.xml)!==manifest.pages[i].rawSha256)
      throw new Error('BSB raw source checksum mismatch');
  }
  const comparison=compareBsbWithActiveStaging({
    manifest, activeSnapshotId, baselineManifestChecksum, activeRecords,historicalRecords,activeCandidates,
  });
  const fixtureXml=fs.readFileSync('validation/acquisition/bsb/authentic-selected-records.v1.xml','utf8');
  const reconciliation=reconcileBsbSelectedFixture({
    fixtureRecords:parseMarcCollection(fixtureXml),
    liveRecords:rawPages.flatMap(page=>parseSruMarcXml(page.xml).records),
    persistedCandidates,
  });
  if(reconciliation.matchedLiveRecordCount!==reconciliation.baselineRecordCount)
    throw new Error('Not all two baseline source records were found in bounded live pages');

  // Fail closed if baseline moved or storage permission changed during network acquisition.
  const after=rowsOf(await sql.query(`
    SELECT a.snapshot_id,b.writes_enabled
    FROM evidence_active_snapshot a CROSS JOIN evidence_environment_binding b
    WHERE a.singleton=true AND b.singleton=true
  `))[0];
  if(!after||after.snapshot_id!==activeSnapshotId||after.writes_enabled!==false)
    throw new Error('Staging state changed while comparing; discard package');

  const directory=path.join(process.cwd(),'artifacts','phase8j-bsb-staging-diff');
  fs.mkdirSync(directory,{recursive:true});
  for(const page of rawPages)fs.writeFileSync(path.join(directory,page.file),page.xml,{flag:'wx'});
  const manifestFileContent=JSON.stringify(manifest,null,2)+'\n';
  const comparisonFileContent=JSON.stringify(comparison,null,2)+'\n';
  fs.writeFileSync(path.join(directory,'source-manifest.json'),manifestFileContent,{flag:'wx'});
  fs.writeFileSync(path.join(directory,'comparison.json'),comparisonFileContent,{flag:'wx'});
  const reconciliationFileContent=JSON.stringify(reconciliation,null,2)+'\n';
  fs.writeFileSync(path.join(directory,'fixture-reconciliation.json'),reconciliationFileContent,{flag:'wx'});
  const reviewCsvCell=(value:string):string=>{
    const normalized=value.replace(/\r\n?/gu,'\n');
    // Prevent spreadsheet formula execution in exported, untrusted catalogue fields.
    const safe=/^[\s]*[=+@-]/u.test(normalized) ? "'"+normalized : normalized;
    return '"'+safe.replaceAll('"','""')+'"';
  };
  const header=['sourceRecordId','candidateId','category','persianForm','observedLatinVariants','stagingStatus','reviewDecision','reviewNotes'];
  const rows=comparison.candidateDiff.map((item)=>[
    item.sourceRecordId,item.candidateId,item.category,item.persianForm,
    item.latinVariants.map((v)=>v.value+' ['+v.classification+']').join(' | '),
    item.state,'',''
  ]);
  const csv=[header,...rows].map((values)=>values.map(reviewCsvCell).join(',')).join('\r\n')+'\r\n';
  fs.writeFileSync(path.join(directory,'human-review-worklist.csv'),csv,{flag:'wx'});
  const aggregateManifest={
    schemaVersion:'phase8j-bsb-review-package-v1',activeSnapshotId,baselineManifestChecksum,
    sourceManifestSha256:sha(manifestFileContent),
    comparisonSha256:sha(comparisonFileContent),
    reviewWorklistSha256:sha(csv),
    fixtureReconciliationSha256:sha(reconciliationFileContent),
    rawPages:manifest.pages.map(p=>({file:p.file,checksum:p.rawSha256})),
    reviewRequired:true,importAuthorized:false,writesPerformed:false,
  };
  fs.writeFileSync(path.join(directory,'package-checksums.json'),JSON.stringify(aggregateManifest,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({
    status:'BSB_FIXTURE_RECONCILIATION_DIAGNOSTICS',
    selectedFieldDifferences:reconciliation.records.flatMap(record=>
      record.selectedFields.filter(field=>field.state!=='EXACT_SELECTED_FIELD').map(field=>({
        recordId:record.id,tag:field.tag,comparison:field.state,
        fixtureField:field.fixtureField,liveSameTagFields:field.liveSameTagFields,
      }))),
    candidateSemanticDifferences:reconciliation.records.flatMap(record=>
      record.candidateDifferences.filter(item=>item.state==='SEMANTIC_EVIDENCE_CHANGED').map(item=>({
        recordId:record.id,candidateId:item.candidateId,
        fixtureForm:item.fixtureForm,liveForm:item.liveForm,
        fixtureLatinVariants:item.fixtureLatinVariants,liveLatinVariants:item.liveLatinVariants,
      }))),
    decision:'BLOCKED_PENDING_FIELD_REVIEW',
  },null,2));
  console.log(JSON.stringify({
    status:'BSB_STAGING_READONLY_DIFF_COMPLETE',snapshotId:activeSnapshotId,
    baselineVerified:true,sourcePages:manifest.pages.length,sourceRecords:manifest.metrics.unique,
    sourceCandidates:manifest.metrics.candidateCount,
    records:comparison.recordCounts,candidates:comparison.candidateCounts,
    blockers:comparison.blockers,archiveDirectory:directory,
    reconciliation:{matchedFixtureRecords:reconciliation.matchedLiveRecordCount,
      exactSelectedFields:reconciliation.totals.exactSelectedFields,
      differentSelectedFields:reconciliation.totals.differentSelectedFields,
      semanticMatches:reconciliation.totals.semanticMatches,
      semanticDifferences:reconciliation.totals.semanticDifferences,
      missingCandidates:reconciliation.totals.missingCandidates,
      newCandidatesWithinTwoRecords:reconciliation.totals.newCandidates,
      blockers:reconciliation.blockers},
    importDecision:comparison.importDecision,writesPerformed:false,
  },null,2));
}
if(process.argv[1]?.endsWith('bsbStagingDiffCli.ts')){
  main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:'BSB staging diff failed');process.exitCode=1;});
}
