/** Freeze a specific previously audited GitHub Actions artifact; no SRU/Neon/Blob calls. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { freezeBsbNewOnly, FROZEN_INPUT_RUN } from './bsbFrozenPackage';
const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');

function main():void{
  const inputDir=path.resolve(process.argv[2]??'artifacts/phase8l-source');
  const outputDir=path.resolve(process.argv[3]??'artifacts/phase8l-frozen');
  if(inputDir===outputDir || fs.existsSync(outputDir))
    throw new Error('Frozen BSB output must not exist and must be separate from source');
  if(!fs.existsSync(inputDir)||!fs.statSync(inputDir).isDirectory())
    throw new Error('Pinned Phase 8K source artifact not downloaded');
  const names=fs.readdirSync(inputDir).sort();
  const expected=[
    'comparison.json','fixture-reconciliation.json','human-review-worklist.csv',
    'package-checksums.json','source-manifest.json',
    'page-001.xml','page-002.xml','page-003.xml','page-004.xml','page-005.xml',
  ].sort();
  if(JSON.stringify(names)!==JSON.stringify(expected))
    throw new Error('Unexpected Phase 8K artifact file list, refusing to freeze');
  const files:Record<string,string>={};
  for(const name of names){
    const file=path.join(inputDir,name);
    if(!fs.statSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>5_000_000)
      throw new Error('Unsafe source artifact entry '+name);
    files[name]=fs.readFileSync(file,'utf8');
  }
  const {files:output,seal}=freezeBsbNewOnly(files,FROZEN_INPUT_RUN);
  // No output is written until all source/page/candidate checks have passed.
  fs.mkdirSync(outputDir,{recursive:true});
  for(const [name,body] of Object.entries(output)){
    const file=path.resolve(outputDir,name);
    if(!file.startsWith(outputDir+path.sep))
      throw new Error('Frozen output path traversal attempt');
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,body,{flag:'wx',mode:0o600});
  }
  for(const [name,checksum] of Object.entries(seal.filesSha256)){
    if(sha(fs.readFileSync(path.join(outputDir,name),'utf8'))!==checksum)
      throw new Error('Frozen output changed after seal');
  }
  console.log(JSON.stringify({
    status:'FROZEN_BSB_PROPOSAL_VERIFIED',sourceRun:seal.sourceActionRun,
    baselineSnapshot:seal.baselineSnapshot,
    frozenRecords:seal.frozenRecordCount,frozenCandidates:seal.frozenCandidateCount,
    excludedPriorSourceIds:seal.excludedPriorSourceIds.length,
    frozenCollectionSha256:seal.filesSha256['frozen-new-records.marcxml'],
    sealSha256:sha(output['frozen-seal.json']),
    importAuthorized:seal.importAuthorized,published:seal.published,
    authorizationStatus:seal.status,changesMadeToNeonOrBlob:false,
  },null,2));
}
try{main()}catch(error){console.error(error instanceof Error?error.message:'Frozen BSB validation failed');process.exitCode=1;}
