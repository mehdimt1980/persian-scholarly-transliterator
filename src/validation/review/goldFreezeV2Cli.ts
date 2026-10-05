import { assertFrozenBenchmarkIntegrity } from './goldFreezeV2';

function main(): void {
  const freeze = assertFrozenBenchmarkIntegrity();
  console.log(
    `Validated frozen V2 gold: ${freeze.caseCount} cases; ` +
      `${freeze.dispositionCounts.FINAL} FINAL / ` +
      `${freeze.dispositionCounts.REVIEW_REQUIRED} REVIEW_REQUIRED / ` +
      `${freeze.dispositionCounts.UNRESOLVED} UNRESOLVED; ` +
      `source git blob ${freeze.sourceBenchmarkGitBlobSha1}; Phase 4.6C authorized.`
  );
}

main();
