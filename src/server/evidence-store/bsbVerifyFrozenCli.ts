/** Independent, offline verification of a previously created Phase 8L bundle. */
import fs from 'node:fs';
import path from 'node:path';
import { verifyFrozenReviewPackage } from './bsbFrozenPackage';

function main():void{
  const dir=path.resolve(process.argv[2]??'artifacts/phase8l-frozen');
  if(!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())
    throw new Error('Frozen BSB package directory missing');
  const files:Record<string,string>={};
  function readTree(relative:string):void{
    const where=path.join(dir,relative);
    for(const item of fs.readdirSync(where,{withFileTypes:true})){
      if(item.isSymbolicLink())throw new Error('Symlinks forbidden in frozen package');
      const rel=path.posix.join(relative,item.name);
      if(item.isDirectory())readTree(rel);
      else if(item.isFile()){
        const file=path.join(dir,rel);
        if(fs.statSync(file).size>5_000_000)throw new Error('Frozen package file exceeds size cap');
        files[rel]=fs.readFileSync(file,'utf8');
      }else throw new Error('Unexpected frozen package file type');
    }
  }
  readTree('');
  const seal=verifyFrozenReviewPackage(files);
  console.log(JSON.stringify({
    status:'FROZEN_BSB_REPLAY_VERIFIED',sourceRun:seal.sourceActionRun,
    frozenRecords:seal.frozenRecordCount,
    frozenCandidates:seal.frozenCandidateCount,
    activeBaseline:seal.baselineSnapshot,
    frozenCollectionHash:seal.filesSha256['frozen-new-records.marcxml'],
    importAuthorized:false,published:false,writesPerformed:false,
  },null,2));
}
try{main()}catch(error){console.error(error instanceof Error?error.message:'Frozen BSB verification failed');process.exitCode=1;}
