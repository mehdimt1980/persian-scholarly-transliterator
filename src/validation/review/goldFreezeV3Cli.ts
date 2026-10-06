import { assertFrozenBenchmarkIntegrityV3 } from './goldFreezeV3';

function main(): void {
  const freeze = assertFrozenBenchmarkIntegrityV3();
  console.log(
    `Validated frozen V3 gold: ${freeze.caseCount} cases; ` +
      `${freeze.dispositionCounts.FINAL} FINAL / ` +
      `${freeze.dispositionCounts.REVIEW_REQUIRED} REVIEW_REQUIRED / ` +
      `${freeze.dispositionCounts.UNRESOLVED} UNRESOLVED; ` +
      `source git blob ${freeze.sourceBenchmarkGitBlobSha1}; Phase 4.6C authorized.`
  );
}

main();
