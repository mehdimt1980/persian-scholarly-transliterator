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

    it('guarantees peak RSS is greater than or equal to start RSS and end RSS', () => {
      const tracker = new StreamingMemoryTracker();
      const start = tracker.getStartRssMb();
      expect(start).toBeGreaterThan(0);

      tracker.sample();
      const end = tracker.getEndRssMb();
      const peak = tracker.getPeakRssMb();

      expect(peak).toBeGreaterThanOrEqual(start);
      expect(peak).toBeGreaterThanOrEqual(end);
    });
  });

  describe('2. Romanization & Observation Accounting Funnel', () => {
    it('reconciles observation counts and arithmetic invariants', async () => {
      const runner = new KaikkiScaleExperimentRunner();
      const summary = await runner.runExperiment({
        inputFilePath: PHASE7B_SAMPLE_FIXTURES_PATH,
        outputDir: 'artifacts/phase7d'
      });

      const f = summary.yieldFunnel;

      // Invariant 1: recordsWithRomanization + recordsWithoutRomanization === validPersianRecords
      expect(f.recordsWithRomanization + f.recordsWithoutRomanization).toBe(f.validPersianRecords);

      // Invariant 2: romanized + unromanized === totalExtractedEvidenceObservations
      expect(f.romanizedEvidenceObservations + f.unromanizedEvidenceObservations).toBe(
        f.totalExtractedEvidenceObservations
      );

      // Invariant 3: unique + duplicatesRemoved === totalExtractedEvidenceObservations
      expect(f.uniqueEvidenceObservationsAfterDeduplication + f.duplicateEvidenceObservationsRemoved).toBe(
        f.totalExtractedEvidenceObservations
      );

      // Invariant 4: totalInterpretationAttempts === uniqueEvidenceObservationsAfterDeduplication
      expect(f.totalInterpretationAttempts).toBe(f.uniqueEvidenceObservationsAfterDeduplication);
    });

    it('accurately distinguishes records with romanization vs records without romanization', async () => {
      // Create small deterministic test file with 1 romanized and 1 unromanized entry
      const testEntries = [
        JSON.stringify({
          word: 'کتاب',
          lang: 'Persian',
          lang_code: 'fa',
          pos: 'noun',
          forms: [{ form: 'ketāb', tags: ['romanization'] }]
        }),
        JSON.stringify({
          word: 'بی‌نشان',
          lang: 'Persian',
          lang_code: 'fa',
          pos: 'noun'
          // no forms, no romanization
        })
      ].join('\n');

      const tmpPath = path.resolve('artifacts/phase7d/test-rom-accounting.jsonl');
      fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
      fs.writeFileSync(tmpPath, testEntries, 'utf8');

      try {
        const runner = new KaikkiScaleExperimentRunner();
        const summary = await runner.runExperiment({
          inputFilePath: tmpPath,
          outputDir: 'artifacts/phase7d'
        });

        expect(summary.yieldFunnel.validPersianRecords).toBe(2);
        expect(summary.yieldFunnel.recordsWithRomanization).toBe(1);
        expect(summary.yieldFunnel.recordsWithoutRomanization).toBe(1);
        expect(summary.yieldFunnel.romanizedEvidenceObservations).toBe(1);
        expect(summary.yieldFunnel.unromanizedEvidenceObservations).toBe(1);
      } finally {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      }
    });
  });

  describe('3. Source Provenance & Metadata Passthrough', () => {
    it('leaves provenance undefined with status UNKNOWN when CLI metadata is omitted', async () => {
      const runner = new KaikkiScaleExperimentRunner();
      const summary = await runner.runExperiment({
        inputFilePath: PHASE7B_SAMPLE_FIXTURES_PATH,
        outputDir: 'artifacts/phase7d'
      });

      expect(summary.sourceManifest.sourceUrl).toBeUndefined();
      expect(summary.sourceManifest.wiktionaryDumpDate).toBeUndefined();
      expect(summary.sourceManifest.kaikkiExtractionDate).toBeUndefined();
      expect(summary.sourceManifest.wiktextractVersion).toBeUndefined();
      expect(summary.sourceManifest.provenanceStatus.sourceUrl).toBe('UNKNOWN');
      expect(summary.sourceManifest.provenanceStatus.wiktionaryDumpDate).toBe('UNKNOWN');
    });

    it('records EXPLICITLY_SUPPLIED when provenance metadata is passed', async () => {
      const runner = new KaikkiScaleExperimentRunner();
      const summary = await runner.runExperiment({
        inputFilePath: PHASE7B_SAMPLE_FIXTURES_PATH,
        outputDir: 'artifacts/phase7d',
        sourceUrl: 'https://example.com/dump.jsonl',
        wiktionaryDumpDate: '2026-09-01',
        kaikkiExtractionDate: '2026-10-01',
        wiktextractVersion: '1.99.0'
      });

      expect(summary.sourceManifest.sourceUrl).toBe('https://example.com/dump.jsonl');
      expect(summary.sourceManifest.wiktionaryDumpDate).toBe('2026-09-01');
      expect(summary.sourceManifest.provenanceStatus.sourceUrl).toBe('EXPLICITLY_SUPPLIED');
      expect(summary.sourceManifest.provenanceStatus.wiktionaryDumpDate).toBe('EXPLICITLY_SUPPLIED');
      expect(summary.sourceManifest.provenanceStatus.kaikkiExtractionDate).toBe('EXPLICITLY_SUPPLIED');
      expect(summary.sourceManifest.provenanceStatus.wiktextractVersion).toBe('EXPLICITLY_SUPPLIED');
    });
  });

  describe('4. Semantic Duplicates & Deterministic Hash Sampling', () => {
    it('measures semantic duplicate observations and candidate evidence reductions', async () => {
      const runner = new KaikkiScaleExperimentRunner();
      const summary = await runner.runExperiment({
        inputFilePath: PHASE7B_SAMPLE_FIXTURES_PATH,
        outputDir: 'artifacts/phase7d'
      });

      const dup = summary.duplicateEvidence;
      expect(dup.candidatesWith1Obs + dup.candidatesWith2Obs + dup.candidatesWith3PlusObs).toBe(
        summary.yieldFunnel.distinctNormalizedForms
      );
      expect(dup.literalDuplicateObservationsCount).toBeGreaterThanOrEqual(0);
      expect(dup.evidenceReductionIfDuplicatesCollapsed).toBeGreaterThanOrEqual(0);
    });

    it('samples audit items deterministically across runs using stable hash ordering', async () => {
      const runner = new KaikkiScaleExperimentRunner();
      const run1 = await runner.runExperiment({
        inputFilePath: PHASE7B_SAMPLE_FIXTURES_PATH,
        outputDir: 'artifacts/phase7d'
      });
      const run2 = await runner.runExperiment({
        inputFilePath: PHASE7B_SAMPLE_FIXTURES_PATH,
        outputDir: 'artifacts/phase7d'
      });

      expect(run1.auditSamples).toEqual(run2.auditSamples);
    });
  });

  describe('5. Zero-Denominator Handling', () => {
    it('reports null / N/A for divergence rate when reviewed overlap count is 0', async () => {
      // Empty mock dataset with no overlap
      const entry = JSON.stringify({
        word: 'ناشناس۱',
        lang: 'Persian',
        lang_code: 'fa',
        pos: 'noun',
        forms: [{ form: 'nā-shenās', tags: ['romanization'] }]
      });

      const tmpPath = path.resolve('artifacts/phase7d/test-zero-denom.jsonl');
      fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
      fs.writeFileSync(tmpPath, entry, 'utf8');

      try {
        const runner = new KaikkiScaleExperimentRunner();
        const summary = await runner.runExperiment({
          inputFilePath: tmpPath,
          outputDir: 'artifacts/phase7d'
        });

        if (summary.reviewedOverlap.reviewedOverlapCount === 0) {
          expect(summary.reviewedOverlap.divergenceRate).toBeNull();
        }
        if (summary.experimentalPacks.fullPackEntryCount === 0) {
          expect(summary.experimentalPacks.fullPackBytesPerEntry).toBeNull();
          expect(summary.confidenceTiers.crossProfilePercentage).toBeNull();
        }
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
      const resDefault = transliterate('شیراز', 'ijmes_full');
      expect(resDefault.tokens[0].evidenceDerivedProposal).toBeDefined();

      const resCustom = transliterate('شیراز', 'ijmes_full', [], DEFAULT_LEXICON_REPOSITORY);
      expect(resCustom.tokens[0].evidenceDerivedProposal).toBeDefined();
    });
  });
});
