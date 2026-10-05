import {
  assertCommittedBenchmarkMatchesWorklist,
  buildConsolidatedV2Benchmark,
  loadReauditWorklist,
  readConsolidatedV2Benchmark,
  writeConsolidatedV2Benchmark
} from './consolidateV2Benchmark';

function main(): void {
  const write = process.argv.slice(2).includes('--write');
  const worklist = loadReauditWorklist();
  const generated = buildConsolidatedV2Benchmark(worklist);

  if (write) {
    writeConsolidatedV2Benchmark(generated);
  }

  const committed = readConsolidatedV2Benchmark();
  assertCommittedBenchmarkMatchesWorklist(worklist, committed);

  const counts = committed.cases.reduce(
    (summary, testCase) => {
      summary[testCase.expected.disposition] += 1;
      return summary;
    },
    { FINAL: 0, REVIEW_REQUIRED: 0, UNRESOLVED: 0 }
  );

  console.log(
    `Validated consolidated V2 benchmark: ${committed.cases.length} cases; ` +
      `${counts.FINAL} FINAL / ${counts.REVIEW_REQUIRED} REVIEW_REQUIRED / ` +
      `${counts.UNRESOLVED} UNRESOLVED; human sign-off pending; engine evaluation blocked.`
  );
}

main();
