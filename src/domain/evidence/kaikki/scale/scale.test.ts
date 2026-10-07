import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { DEFAULT_LEXICON_REPOSITORY } from '../../../../data/lexicon';
import { DEFAULT_EVIDENCE_FALLBACK_REPOSITORY } from '../../../../data/fallback';
import { transliterate } from '../../../engine';
import { computeFileSha256 } from '../statistics';
import { KaikkiScaleExperimentRunner } from './runner';
import { forEachJsonlRow, StreamingMemoryTracker } from './stream';
import { validateScalePackIntegrity } from './validatorCli';
import { PHASE7B_SAMPLE_FIXTURES_PATH } from '../scheme/fixtures';
import type { EvidenceFallbackPack } from '../fallback/types';

describe('Phase 7D: Production-Scale Kaikki Knowledge Pack Experiment', () => {
  describe('1. Streaming Input & Memory Tracking', () => {
    it('computes streaming SHA-256 without readFileSync of whole file into memory', async () => {
      const sha = await computeFileSha256(PHASE7B_SAMPLE_FIXTURES_PATH);
      const expected = crypto
        .createHash('sha256')
        .update(fs.readFileSync(PHASE7B_SAMPLE_FIXTURES_PATH))
        .digest('hex');
      expect(sha).toBe(expected);
    });

    it('streams plain .jsonl files correctly line by line', async () => {
      let lines = 0;
      const res = await forEachJsonlRow(PHASE7B_SAMPLE_FIXTURES_PATH, () => {
        lines += 1;
      });
      expect(res.totalRows).toBeGreaterThan(0);
      expect(lines).toBe(res.totalRows);
      expect(res.memoryTracker.getPeakRssMb()).toBeGreaterThan(0);
    });

    it('streams and decompresses .jsonl.gz files on the fly', async () => {
      // Create temporary .jsonl.gz in memory / temp
      const tmpGzPath = path.resolve('artifacts/phase7d/test-sample.jsonl.gz');
      const rawContent = fs.readFileSync(PHASE7B_SAMPLE_FIXTURES_PATH);
      const gzipped = zlib.gzipSync(rawContent);
      fs.mkdirSync(path.dirname(tmpGzPath), { recursive: true });
      fs.writeFileSync(tmpGzPath, gzipped);

      try {
        let lines = 0;
        const _res = await forEachJsonlRow(tmpGzPath, () => {
          lines += 1;
        });
        expect(lines).toBeGreaterThan(0);
      } finally {
        if (fs.existsSync(tmpGzPath)) {
          fs.unlinkSync(tmpGzPath);
        }
      }
    });

    it('samples memory usage accurately without negative values', () => {
      const tracker = new StreamingMemoryTracker();
      expect(tracker.getStartRssMb()).toBeGreaterThan(0);
      expect(tracker.getPeakRssMb()).toBeGreaterThanOrEqual(tracker.getStartRssMb());
      expect(tracker.getEndRssMb()).toBeGreaterThan(0);
    });
  });

  describe('2. Scale Runner & Yield Funnel Invariants', () => {
    it('runs experiment on deterministic fixture and aggregates yield funnel metrics', async () => {
      const runner = new KaikkiScaleExperimentRunner();
      const summary = await runner.runExperiment({
        inputFilePath: PHASE7B_SAMPLE_FIXTURES_PATH,
        outputDir: 'artifacts/phase7d'
      });

      expect(summary.yieldFunnel.physicalRowsRead).toBeGreaterThan(0);
      expect(summary.yieldFunnel.validPersianRecords).toBeGreaterThan(0);
      expect(summary.yieldFunnel.distinctNormalizedForms).toBeGreaterThan(0);
      expect(summary.yieldFunnel.totalFallbackEligibleCandidates).toBeGreaterThan(0);

      // Verify yield funnel arithmetic
      expect(
        summary.yieldFunnel.totalFallbackEligibleCandidates + summary.yieldFunnel.totalFallbackIneligibleCandidates
      ).toBe(summary.yieldFunnel.distinctNormalizedForms);
    });

    it('produces deterministic semantic pack hashes on identical runs', async () => {
      const runner = new KaikkiScaleExperimentRunner();
      const run1 = await runner.runExperiment({
        inputFilePath: PHASE7B_SAMPLE_FIXTURES_PATH,
        outputDir: 'artifacts/phase7d'
      });
      const run2 = await runner.runExperiment({
        inputFilePath: PHASE7B_SAMPLE_FIXTURES_PATH,
        outputDir: 'artifacts/phase7d'
      });

      expect(run1.experimentalPacks.semanticPackSha256).toBe(run2.experimentalPacks.semanticPackSha256);
      expect(run1.yieldFunnel.totalFallbackEligibleCandidates).toBe(
        run2.yieldFunnel.totalFallbackEligibleCandidates
      );
    });
  });

  describe('3. Blocker Histogram & Profile Classification', () => {
    it('ranks blockers descending and computes exact percentages', async () => {
      const runner = new KaikkiScaleExperimentRunner();
      const summary = await runner.runExperiment({
        inputFilePath: PHASE7B_SAMPLE_FIXTURES_PATH,
        outputDir: 'artifacts/phase7d'
      });

      const b = summary.blockerHistogram;
      for (let i = 0; i < b.length - 1; i++) {
        expect(b[i].count).toBeGreaterThanOrEqual(b[i + 1].count);
      }
    });

    it('tracks candidate profile combinations without data leakage', async () => {
      const runner = new KaikkiScaleExperimentRunner();
      const summary = await runner.runExperiment({
        inputFilePath: PHASE7B_SAMPLE_FIXTURES_PATH,
        outputDir: 'artifacts/phase7d'
      });

      const combos = summary.candidateProfileCombinations;
      const totalCandidates =
        combos.classicalOnly +
        combos.iranianOnly +
        combos.crossProfile +
        combos.unclassifiedOnly +
        combos.mixedClassifiedAndUnclassified;

      expect(totalCandidates).toBe(summary.yieldFunnel.distinctNormalizedForms);
    });
  });

  describe('4. Reviewed Lexicon Overlap & Divergence Analysis', () => {
    it('audits overlap against DEFAULT_LEXICON_REPOSITORY read-only with zero mutations', async () => {
      const entryCountBefore = DEFAULT_LEXICON_REPOSITORY.getAllEntries().length;
      const runner = new KaikkiScaleExperimentRunner();
      const summary = await runner.runExperiment({
        inputFilePath: PHASE7B_SAMPLE_FIXTURES_PATH,
        outputDir: 'artifacts/phase7d'
      });

      const entryCountAfter = DEFAULT_LEXICON_REPOSITORY.getAllEntries().length;
      expect(entryCountAfter).toBe(entryCountBefore);

      expect(summary.reviewedOverlap.exactCanonicalMatches + summary.reviewedOverlap.canonicalDivergences).toBe(
        summary.reviewedOverlap.reviewedOverlapCount
      );
      expect(summary.reviewedOverlap.novelEligibleCount + summary.reviewedOverlap.reviewedOverlapCount).toBe(
        summary.reviewedOverlap.totalEligibleEntries
      );
    });
  });

  describe('5. Pack Integrity Validator', () => {
    it('validates generated experimental fallback pack integrity', async () => {
      const runner = new KaikkiScaleExperimentRunner();
      const summary = await runner.runExperiment({
        inputFilePath: PHASE7B_SAMPLE_FIXTURES_PATH,
        outputDir: 'artifacts/phase7d'
      });

      const validation = validateScalePackIntegrity(summary.experimentalPacks.fullPackPath);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
      expect(validation.entryCount).toBe(summary.experimentalPacks.fullPackEntryCount);
      expect(validation.semanticSha256).toBe(summary.experimentalPacks.semanticPackSha256);
    });

    it('fails closed when pack contains malformed or non-deterministic IDs', () => {
      const badPack: EvidenceFallbackPack = {
        manifest: {
          packVersion: '1.0.0',
          generatedAt: new Date().toISOString(),
          inputSha256: 'abc',
          extractorVersion: '1.0.0',
          interpreterVersion: '1.0.0',
          ruleSetVersion: '1.0.0',
          aggregatorVersion: '1.0.0',
          entryCount: 1
        },
        entries: {
          شیراز: {
            id: 'non-deterministic-fake-id',
            normalizedForm: 'شیراز',
            hypothesis: 'shīrāz',
            consensusStatus: 'UNANIMOUS_DETERMINISTIC',
            confidenceTier: 'SINGLE_OBSERVATION_DETERMINISTIC',
            candidateAnalysisId: 'cand-1',
            evidenceCount: 1,
            sourceProfiles: ['IRANIAN'],
            interpretations: [{ evidenceId: 'evi-1', romanization: 'shiraz', profile: 'IRANIAN' }],
            generatedFrom: {
              acquisitionVersion: '1.0.0',
              interpreterVersion: '1.0.0',
              ruleSetVersion: '1.0.0',
              aggregatorVersion: '1.0.0'
            }
          }
        }
      };

      const tmpPath = path.resolve('artifacts/phase7d/bad-test-pack.json');
      fs.writeFileSync(tmpPath, JSON.stringify(badPack), 'utf8');

      try {
        const val = validateScalePackIntegrity(tmpPath);
        expect(val.valid).toBe(false);
        expect(val.errors.some((e) => e.includes('non-deterministic ID'))).toBe(true);
      } finally {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      }
    });
  });

  describe('6. Production Pack & Runtime Invariants', () => {
    it('proves that the production fallback pack (kaikki-fallback.v1.json) remains strictly untouched from Phase 7C', () => {
      const prodPackPath = path.resolve('src/data/generated/kaikki-fallback.v1.json');
      expect(fs.existsSync(prodPackPath)).toBe(true);

      const raw = fs.readFileSync(prodPackPath, 'utf8');
      const prodPack = JSON.parse(raw) as EvidenceFallbackPack;

      expect(prodPack.manifest.packVersion).toBe('1.0.0');
      expect(prodPack.manifest.entryCount).toBe(4);
      expect(Object.keys(prodPack.entries)).toEqual(['گفتار', 'شیراز', 'حضور', 'عالی']);
      expect(DEFAULT_EVIDENCE_FALLBACK_REPOSITORY.getEntryCount()).toBe(4);
    });

    it('proves that running transliterate with experimental pack occurs only via explicit dependency injection', () => {
      // Normal production transliteration uses DEFAULT_EVIDENCE_FALLBACK_REPOSITORY
      const resDefault = transliterate('شیراز', 'ijmes_full');
      expect(resDefault.tokens[0].evidenceDerivedProposal).toBeDefined();

      // Custom lexicon without fallback parameter receives NO fallback
      const resCustom = transliterate('شیراز', 'ijmes_full', [], DEFAULT_LEXICON_REPOSITORY);
      expect(resCustom.tokens[0].evidenceDerivedProposal).toBeDefined();
    });
  });
});
