import { runReleasePortabilityGate } from './releasePortabilityGate';

function main(): void {
  const report = runReleasePortabilityGate();
  console.log(
    `Release portability gate PASS: ${report.positivePassed} compositional positives + ` +
      `${report.negativePassed} fail-closed negatives; ` +
      `${report.total} total; frozen-authority overlap=${report.authorityOverlapCount}.`
  );
}

main();
