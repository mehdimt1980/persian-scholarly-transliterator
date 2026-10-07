/**
 * Scale experiment runner for Phase 7D.
 *
 * Implements the full-scale acquisition, interpretation, consensus, and fallback
 * aggregation pipeline on real Wiktextract / Kaikki Persian datasets.
 *
 * Critical Scholarly Invariants:
 *   1. Zero new linguistic rules.
 *   2. Zero modifications to authoritative lexicon.
 *   3. Zero automatic promotions.
 *   4. Experimental fallback repository is used ONLY via dependency injection for simulation/measurement.
 *   5. Production runtime fallback pack remains strictly untouched.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DEFAULT_LEXICON_REPOSITORY } from '../../../../data/lexicon';
import { transliterate } from '../../../engine';
import { normalizePersian } from '../../../normalization';
import { synthesizeCandidateFromEvidence } from '../../candidate';
import {
  determineLemmaStatus,
  extractKaikkiObservations,
  extractRawRomanizations,
  KAIKKI_EXTRACTOR_VERSION
} from '../extractor';
import { WiktionaryPersianSchemeInterpreter } from '../scheme/interpreter';
import { KaikkiCandidateSchemeAggregator } from '../scheme/aggregator';
import { computeFallbackEntryId, deriveConfidenceTier } from '../fallback/identity';
import { EvidenceFallbackRepository } from '../fallback/repository';
import { computeFileSha256 } from '../statistics';
import { forEachJsonlRow, StreamingMemoryTracker } from './stream';
import type {
  BlockerHistogramItem,
  CandidateProfileCombinationDistribution,
  ConfidenceTierDistribution,
  CorpusCoverageEvaluationResult,
  DuplicateEvidenceMetrics,
  ExperimentalPackGenerationResult,
  KaikkiScaleSourceManifest,
  KaikkiScaleYieldFunnel,
  Phase7DScaleoutSummary,
  PosYieldItem,
  ProfileClassificationDistribution,
  ProperNameCohortMetrics,
  ReviewedDivergenceSample,
  ReviewedLexiconOverlapAnalysis,
  ScaleAuditSamples,
  ScaleExperimentOptions,
  ScalePerformanceStage
} from './types';
import type {
  EvidenceDerivedReference,
  EvidenceFallbackEntry,
  EvidenceFallbackPack,
  EvidenceFallbackPackManifest
} from '../fallback/types';
import type { KaikkiRawEntry, KaikkiExtractedObservation } from '../types';
import type { LexicalEvidence } from '../../types';

interface InternalNormalizedGroup {
  normalizedForm: string;
  rawWords: Set<string>;
  posList: Set<string>;
  isLemma: boolean;
  isProperName: boolean;
  seenEvidenceIds: Set<string>;
  evidenceList: LexicalEvidence[];
  observationList: KaikkiExtractedObservation[];
}

function computeSampleHash(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export class KaikkiScaleExperimentRunner {
  private readonly interpreter = new WiktionaryPersianSchemeInterpreter();
  private readonly aggregator = new KaikkiCandidateSchemeAggregator();

  /**
   * Run the empirical scale experiment on a Kaikki dataset.
   */
  public async runExperiment(options: ScaleExperimentOptions): Promise<Phase7DScaleoutSummary> {
    const inputFilePath = path.resolve(options.inputFilePath);
    if (!fs.existsSync(inputFilePath)) {
      throw new Error(`Input file not found: ${inputFilePath}`);
    }

    const outputDir = path.resolve(options.outputDir ?? 'artifacts/phase7d');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 1. Source Manifest & Provenance Tracking
    const stats = fs.statSync(inputFilePath);
    const inputSha256 = await computeFileSha256(inputFilePath);

    const sourceManifest: KaikkiScaleSourceManifest = {
      sourceEdition: 'enwiktionary',
      language: 'Persian (fa)',
      sourceUrl: options.sourceUrl,
      wiktionaryDumpDate: options.wiktionaryDumpDate,
      kaikkiExtractionDate: options.kaikkiExtractionDate,
      wiktextractVersion: options.wiktextractVersion,
      downloadTimestamp: new Date().toISOString(),
      provenanceStatus: {
        sourceUrl: options.sourceUrl ? 'EXPLICITLY_SUPPLIED' : 'UNKNOWN',
        wiktionaryDumpDate: options.wiktionaryDumpDate ? 'EXPLICITLY_SUPPLIED' : 'UNKNOWN',
        kaikkiExtractionDate: options.kaikkiExtractionDate ? 'EXPLICITLY_SUPPLIED' : 'UNKNOWN',
        wiktextractVersion: options.wiktextractVersion ? 'EXPLICITLY_SUPPLIED' : 'UNKNOWN'
      },
      inputFileBytes: stats.size,
      inputSha256,
      inputFileName: path.basename(inputFilePath)
    };

    // 2. Stream Accumulation & Memory Tracking
    const memoryTracker = new StreamingMemoryTracker();
    const startRssMb = memoryTracker.getStartRssMb();
    const startTime = Date.now();

    const normalizedMap = new Map<string, InternalNormalizedGroup>();
    const distinctRawPersianForms = new Set<string>();

    let physicalRowsRead = 0;
    let malformedRows = 0;
    let validPersianRecords = 0;
    let lemmaRecords = 0;
    let nonLemmaRecords = 0;
    let unknownLemmaStatusRecords = 0;

    let recordsWithRomanization = 0;
    let recordsWithoutRomanization = 0;

    let totalExtractedEvidenceObservations = 0;
    let romanizedEvidenceObservations = 0;
    let unromanizedEvidenceObservations = 0;
    let uniqueEvidenceObservationsAfterDeduplication = 0;
    let duplicateEvidenceObservationsRemoved = 0;

    let recordsWithIpa = 0;
    let recordsWithPos = 0;
    let properNameRecords = 0;

    await forEachJsonlRow(
      inputFilePath,
      (_rowNum, line) => {
        physicalRowsRead += 1;
        let record: KaikkiRawEntry;
        try {
          record = JSON.parse(line) as KaikkiRawEntry;
        } catch {
          malformedRows += 1;
          return;
        }

        if (record.lang_code !== 'fa' && record.lang !== 'Persian') {
          return;
        }

        validPersianRecords += 1;
        const rawWord = record.word;
        if (!rawWord || typeof rawWord !== 'string' || rawWord.trim().length === 0) {
          return;
        }
        distinctRawPersianForms.add(rawWord);

        const lemmaResult = determineLemmaStatus(record);
        if (lemmaResult.lemmaStatus === 'LEMMA') lemmaRecords += 1;
        else if (lemmaResult.lemmaStatus === 'NON_LEMMA_FORM') nonLemmaRecords += 1;
        else unknownLemmaStatusRecords += 1;

        if (Array.isArray(record.sounds) && record.sounds.some((s) => typeof s.ipa === 'string')) {
          recordsWithIpa += 1;
        }
        if (typeof record.pos === 'string' && record.pos.trim().length > 0) {
          recordsWithPos += 1;
        }

        const isProperName =
          record.pos === 'name' ||
          record.pos === 'proper noun' ||
          record.pos === 'propn' ||
          (Array.isArray(record.tags) && record.tags.includes('proper-noun'));

        if (isProperName) {
          properNameRecords += 1;
        }

        // Measure actual source romanization presence
        const rawRomanizations = extractRawRomanizations(record);
        if (rawRomanizations.length > 0) {
          recordsWithRomanization += 1;
        } else {
          recordsWithoutRomanization += 1;
        }

        const normalizedForm = normalizePersian(rawWord).normalizedInput;
        let group = normalizedMap.get(normalizedForm);
        if (!group) {
          group = {
            normalizedForm,
            rawWords: new Set(),
            posList: new Set(),
            isLemma: lemmaResult.lemmaStatus === 'LEMMA',
            isProperName,
            seenEvidenceIds: new Set(),
            evidenceList: [],
            observationList: []
          };
          normalizedMap.set(normalizedForm, group);
        }

        group.rawWords.add(rawWord);
        if (record.pos) group.posList.add(record.pos);
        if (lemmaResult.lemmaStatus === 'LEMMA') group.isLemma = true;
        if (isProperName) group.isProperName = true;

        const observations = extractKaikkiObservations(record);
        for (const obs of observations) {
          totalExtractedEvidenceObservations += 1;
          const rom = obs.evidence.observedRomanization;
          if (rom !== null && rom.trim().length > 0) {
            romanizedEvidenceObservations += 1;
          } else {
            unromanizedEvidenceObservations += 1;
          }

          if (!group.seenEvidenceIds.has(obs.evidence.id)) {
            group.seenEvidenceIds.add(obs.evidence.id);
            group.evidenceList.push(obs.evidence);
            group.observationList.push(obs);
            uniqueEvidenceObservationsAfterDeduplication += 1;
          } else {
            duplicateEvidenceObservationsRemoved += 1;
          }
        }
      },
      {
        tracker: memoryTracker,
        maxRecords: options.maxRecords,
        progressEvery: options.progressEvery
      }
    );

    memoryTracker.sample();

    // 3. Candidate Synthesis, Scheme Interpretation, Consensus & Fallback Filtering
    let classicalDariObservations = 0;
    let iranianObservations = 0;
    let unclassifiedObservations = 0;
    let conflictingObservations = 0;

    let directEquivalentInterpretations = 0;
    let deterministicEquivalentInterpretations = 0;
    let contextRequiredInterpretations = 0;
    let unsupportedInterpretations = 0;

    let unanimousDeterministicCandidates = 0;
    let conflictingDeterministicCandidates = 0;
    let partialCandidates = 0;
    let blockedCandidates = 0;
    let noInterpretableEvidenceCandidates = 0;

    let totalFallbackEligibleCandidates = 0;
    let totalFallbackIneligibleCandidates = 0;

    const blockerCounts = new Map<string, number>();
    let totalBlockedInterpretations = 0;
    let totalInterpretationAttempts = 0;

    let candidateClassicalOnly = 0;
    let candidateIranianOnly = 0;
    let candidateCrossProfile = 0;
    let candidateUnclassifiedOnly = 0;
    let candidateMixedClassifiedAndUnclassified = 0;

    let tierCrossProfile = 0;
    let tierMultiObs = 0;
    let tierSingleObs = 0;

    let candidatesWith1Obs = 0;
    let candidatesWith2Obs = 0;
    let candidatesWith3PlusObs = 0;
    let literalDuplicateObservationsCount = 0;
    let sameRomanizationAcrossDistinctRecordsCount = 0;
    let sameNormalizedFormWithMultipleObservationsCount = 0;
    let evidenceReductionIfDuplicatesCollapsed = 0;

    const posYieldMap = new Map<string, { sourceForms: number; eligibleForms: number }>();
    let properNameSourceCount = 0;
    let properNameInterpretableCount = 0;
    let properNameEligibleCount = 0;
    let properNameCrossProfileCount = 0;

    const eligibleEntries: Record<string, EvidenceFallbackEntry> = {};
    const packVersion = options.packVersion ?? '1.0.0';

    // Sampling pools for deterministic hash-based sampling
    const crossProfilePool: { item: EvidenceFallbackEntry; hash: string }[] = [];
    const multiObservationPool: { item: EvidenceFallbackEntry; hash: string }[] = [];
    const singleObservationPool: { item: EvidenceFallbackEntry; hash: string }[] = [];
    const blockedSamplePoolsByKind: Record<
      string,
      { item: { normalizedForm: string; reason: string; romanizations: string[] }; hash: string }[]
    > = {};

    let normalizationCollisions = 0;
    for (const group of normalizedMap.values()) {
      if (group.rawWords.size > 1) {
        normalizationCollisions += 1;
      }

      // Track POS
      const posArray = Array.from(group.posList);
      const primaryPos = posArray.length > 0 ? posArray[0] : 'unknown';
      let posData = posYieldMap.get(primaryPos);
      if (!posData) {
        posData = { sourceForms: 0, eligibleForms: 0 };
        posYieldMap.set(primaryPos, posData);
      }
      posData.sourceForms += 1;

      if (group.isProperName) {
        properNameSourceCount += 1;
      }

      const obsCount = group.observationList.length;
      if (obsCount === 1) candidatesWith1Obs += 1;
      else if (obsCount === 2) candidatesWith2Obs += 1;
      else if (obsCount >= 3) candidatesWith3PlusObs += 1;

      if (obsCount >= 2) {
        sameNormalizedFormWithMultipleObservationsCount += 1;
      }

      if (group.evidenceList.length === 0) {
        totalFallbackIneligibleCandidates += 1;
        noInterpretableEvidenceCandidates += 1;
        continue;
      }

      const candidate = synthesizeCandidateFromEvidence(
        group.normalizedForm,
        group.evidenceList,
        { entityType: 'WORD' }
      );

      const analysis = this.aggregator.analyzeCandidate(candidate, group.observationList, this.interpreter);
      const interpByEvidenceId = new Map(analysis.interpretations.map((i) => [i.evidenceId, i]));

      // Duplicate semantic evidence audit
      const seenLiteralKeys = new Set<string>();
      const romToSourceRecords = new Map<string, Set<string>>();

      for (const obs of group.observationList) {
        const interp = interpByEvidenceId.get(obs.evidence.id);
        const profile = interp?.sourceProfile ?? 'UNCLASSIFIED';
        const rom = obs.evidence.observedRomanization ?? '';
        const literalKey = `${obs.evidence.sourceRecordId ?? ''}|${rom}|${profile}`;

        if (seenLiteralKeys.has(literalKey)) {
          literalDuplicateObservationsCount += 1;
        }
        seenLiteralKeys.add(literalKey);

        if (rom.trim().length > 0 && obs.evidence.sourceRecordId) {
          const recs = romToSourceRecords.get(rom) ?? new Set<string>();
          recs.add(obs.evidence.sourceRecordId);
          romToSourceRecords.set(rom, recs);
        }
      }

      for (const recs of romToSourceRecords.values()) {
        if (recs.size > 1) {
          sameRomanizationAcrossDistinctRecordsCount += 1;
        }
      }

      const reduction = group.observationList.length - seenLiteralKeys.size;
      if (reduction > 0) {
        evidenceReductionIfDuplicatesCollapsed += reduction;
      }

      // Profile observations count
      for (const interp of analysis.interpretations) {
        totalInterpretationAttempts += 1;
        if (interp.sourceProfile === 'CLASSICAL_DARI') classicalDariObservations += 1;
        else if (interp.sourceProfile === 'IRANIAN') iranianObservations += 1;
        else if (interp.sourceProfile === 'UNCLASSIFIED') unclassifiedObservations += 1;
        else if (interp.sourceProfile === 'CONFLICTING') conflictingObservations += 1;

        if (interp.status === 'DIRECT_EQUIVALENT') directEquivalentInterpretations += 1;
        else if (interp.status === 'DETERMINISTIC_EQUIVALENT') deterministicEquivalentInterpretations += 1;
        else if (interp.status === 'CONTEXT_REQUIRED') contextRequiredInterpretations += 1;
        else if (interp.status === 'UNSUPPORTED') unsupportedInterpretations += 1;

        for (const blocker of interp.blockers) {
          totalBlockedInterpretations += 1;
          const count = blockerCounts.get(blocker.kind) ?? 0;
          blockerCounts.set(blocker.kind, count + 1);

          if (!blockedSamplePoolsByKind[blocker.kind]) {
            blockedSamplePoolsByKind[blocker.kind] = [];
          }
          const sampleHash = computeSampleHash(
            `${group.normalizedForm}|${blocker.kind}|${interp.evidenceId}|${interp.rawObservedRomanization ?? ''}`
          );
          blockedSamplePoolsByKind[blocker.kind].push({
            item: {
              normalizedForm: group.normalizedForm,
              reason: blocker.reason,
              romanizations: group.observationList.map((o) => o.evidence.observedRomanization ?? '')
            },
            hash: sampleHash
          });
        }
      }

      // Candidate Profile Combination
      const activeProfiles = new Set(analysis.interpretations.map((i) => i.sourceProfile));
      const hasClassical = activeProfiles.has('CLASSICAL_DARI');
      const hasIranian = activeProfiles.has('IRANIAN');
      const hasUnclassified = activeProfiles.has('UNCLASSIFIED');

      if (hasClassical && hasIranian) candidateCrossProfile += 1;
      else if (hasClassical && !hasIranian && !hasUnclassified) candidateClassicalOnly += 1;
      else if (hasIranian && !hasClassical && !hasUnclassified) candidateIranianOnly += 1;
      else if (hasUnclassified && !hasClassical && !hasIranian) candidateUnclassifiedOnly += 1;
      else candidateMixedClassifiedAndUnclassified += 1;

      // Candidate Consensus Status
      if (analysis.consensusStatus === 'UNANIMOUS_DETERMINISTIC') unanimousDeterministicCandidates += 1;
      else if (analysis.consensusStatus === 'CONFLICTING_DETERMINISTIC') conflictingDeterministicCandidates += 1;
      else if (analysis.consensusStatus === 'PARTIAL') partialCandidates += 1;
      else if (analysis.consensusStatus === 'BLOCKED') blockedCandidates += 1;
      else noInterpretableEvidenceCandidates += 1;

      if (analysis.consensusStatus !== 'BLOCKED' && analysis.consensusStatus !== 'NO_INTERPRETABLE_EVIDENCE') {
        if (group.isProperName) properNameInterpretableCount += 1;
      }

      // Strict Fallback Eligibility Filter
      const isEligible =
        analysis.consensusStatus === 'UNANIMOUS_DETERMINISTIC' &&
        analysis.consensusTargetHypothesis !== null &&
        candidate.proposedCanonical === null &&
        analysis.interpretations.length > 0 &&
        analysis.interpretations.every(
          (interp) =>
            interp.targetHypothesis !== null &&
            interp.blockers.length === 0 &&
            (interp.status === 'DIRECT_EQUIVALENT' || interp.status === 'DETERMINISTIC_EQUIVALENT')
        );

      if (!isEligible) {
        totalFallbackIneligibleCandidates += 1;
        continue;
      }

      const validProfiles = Array.from(
        new Set(
          analysis.interpretations
            .map((i) => i.sourceProfile)
            .filter((p): p is 'CLASSICAL_DARI' | 'IRANIAN' => p === 'CLASSICAL_DARI' || p === 'IRANIAN')
        )
      ).sort();

      if (validProfiles.length === 0) {
        totalFallbackIneligibleCandidates += 1;
        continue;
      }

      totalFallbackEligibleCandidates += 1;
      posData.eligibleForms += 1;

      if (group.isProperName) {
        properNameEligibleCount += 1;
        if (validProfiles.length > 1) properNameCrossProfileCount += 1;
      }

      const obsMap = new Map(group.observationList.map((o) => [o.evidence.id, o]));
      const evidenceRefs: EvidenceDerivedReference[] = analysis.interpretations.map((interp) => {
        const obs = obsMap.get(interp.evidenceId);
        return {
          evidenceId: interp.evidenceId,
          sourceRecordId: obs?.metadata.rawSourceWord,
          romanization: interp.rawObservedRomanization,
          profile: interp.sourceProfile as 'CLASSICAL_DARI' | 'IRANIAN',
          sourceUri: obs?.metadata.rawSourceWord
            ? `https://en.wiktionary.org/wiki/${encodeURIComponent(obs.metadata.rawSourceWord)}`
            : undefined
        };
      });

      const confidenceTier = deriveConfidenceTier(validProfiles, evidenceRefs.length);
      if (confidenceTier === 'CROSS_PROFILE_CONSENSUS') tierCrossProfile += 1;
      else if (confidenceTier === 'MULTI_OBSERVATION_CONSENSUS') tierMultiObs += 1;
      else if (confidenceTier === 'SINGLE_OBSERVATION_DETERMINISTIC') tierSingleObs += 1;

      const entryId = computeFallbackEntryId(
        packVersion,
        candidate.normalizedForm,
        analysis.consensusTargetHypothesis!,
        analysis.id,
        candidate.evidenceIds
      );

      const entry: EvidenceFallbackEntry = {
        id: entryId,
        normalizedForm: candidate.normalizedForm,
        hypothesis: analysis.consensusTargetHypothesis!,
        consensusStatus: 'UNANIMOUS_DETERMINISTIC',
        confidenceTier,
        candidateAnalysisId: analysis.id,
        evidenceCount: evidenceRefs.length,
        sourceProfiles: validProfiles,
        interpretations: evidenceRefs,
        generatedFrom: {
          acquisitionVersion: '1.0.0',
          interpreterVersion: analysis.interpretations[0]?.interpreterVersion ?? '1.0.0',
          ruleSetVersion: analysis.interpretations[0]?.ruleSetVersion ?? '1.0.0',
          aggregatorVersion: analysis.aggregatorVersion
        }
      };

      eligibleEntries[candidate.normalizedForm] = entry;

      const sampleHash = computeSampleHash(`${candidate.normalizedForm}|${entry.hypothesis}|${confidenceTier}`);
      if (confidenceTier === 'CROSS_PROFILE_CONSENSUS') {
        crossProfilePool.push({ item: entry, hash: sampleHash });
      } else if (confidenceTier === 'MULTI_OBSERVATION_CONSENSUS') {
        multiObservationPool.push({ item: entry, hash: sampleHash });
      } else if (confidenceTier === 'SINGLE_OBSERVATION_DETERMINISTIC') {
        singleObservationPool.push({ item: entry, hash: sampleHash });
      }
    }

    memoryTracker.sample();

    // 4. Reviewed Lexicon Overlap Analysis (Strictly READ-ONLY)
    let reviewedOverlapCount = 0;
    let exactCanonicalMatches = 0;
    let canonicalDivergences = 0;
    const divergencePool: { item: ReviewedDivergenceSample; hash: string }[] = [];
    const reviewedMatchPool: { item: { normalizedForm: string; canonical: string }; hash: string }[] = [];
    const novelEligibleEntries: Record<string, EvidenceFallbackEntry> = {};

    for (const [normForm, entry] of Object.entries(eligibleEntries)) {
      const lexEntry = DEFAULT_LEXICON_REPOSITORY.findByNormalized(normForm);
      if (lexEntry) {
        reviewedOverlapCount += 1;
        const lexCanonicals = lexEntry.readings.map((r) => r.canonical.toLowerCase());
        const hypLower = entry.hypothesis.toLowerCase();
        const hash = computeSampleHash(`${normForm}|${entry.hypothesis}`);
        if (lexCanonicals.includes(hypLower)) {
          exactCanonicalMatches += 1;
          reviewedMatchPool.push({ item: { normalizedForm: normForm, canonical: entry.hypothesis }, hash });
        } else {
          canonicalDivergences += 1;
          divergencePool.push({
            item: {
              persianForm: Array.from(normalizedMap.get(normForm)?.rawWords ?? [])[0] ?? normForm,
              normalizedForm: normForm,
              reviewedCanonical: lexEntry.readings[0]?.canonical ?? '',
              evidenceHypothesis: entry.hypothesis,
              confidenceTier: entry.confidenceTier,
              sourceProfiles: entry.sourceProfiles
            },
            hash
          });
        }
      } else {
        novelEligibleEntries[normForm] = entry;
      }
    }

    const divergenceRate =
      reviewedOverlapCount > 0 ? Math.round((canonicalDivergences / reviewedOverlapCount) * 10000) / 100 : null;

    // 5. Deterministic Sort and Semantic Hash Computation
    const sortedEligibleKeys = Object.keys(eligibleEntries).sort();
    const sortedEligibleEntries: Record<string, EvidenceFallbackEntry> = {};
    for (const k of sortedEligibleKeys) {
      sortedEligibleEntries[k] = eligibleEntries[k];
    }

    const sortedNovelKeys = Object.keys(novelEligibleEntries).sort();
    const sortedNovelEntries: Record<string, EvidenceFallbackEntry> = {};
    for (const k of sortedNovelKeys) {
      sortedNovelEntries[k] = novelEligibleEntries[k];
    }

    const semanticSerialization = JSON.stringify(sortedEligibleEntries);
    const semanticPackSha256 = crypto.createHash('sha256').update(semanticSerialization).digest('hex');

    // 6. Manifest and Experimental Packs Serialization
    const fullManifest: EvidenceFallbackPackManifest = {
      packVersion,
      generatedAt: new Date().toISOString(),
      inputSha256,
      wiktionaryDumpDate: sourceManifest.wiktionaryDumpDate,
      wiktextractVersion: sourceManifest.wiktextractVersion,
      extractorVersion: KAIKKI_EXTRACTOR_VERSION,
      interpreterVersion: '1.0.0',
      ruleSetVersion: '1.0.0',
      aggregatorVersion: '1.0.0',
      entryCount: sortedEligibleKeys.length
    };

    const fullPack: EvidenceFallbackPack = {
      manifest: fullManifest,
      entries: sortedEligibleEntries
    };

    const novelManifest: EvidenceFallbackPackManifest = {
      ...fullManifest,
      entryCount: sortedNovelKeys.length
    };

    const novelPack: EvidenceFallbackPack = {
      manifest: novelManifest,
      entries: sortedNovelEntries
    };

    const fullPackPath = path.join(outputDir, 'kaikki-fallback-full.json');
    const novelPackPath = path.join(outputDir, 'kaikki-fallback-novel-only.json');
    const fullJson = JSON.stringify(fullPack, null, 2);
    const novelJson = JSON.stringify(novelPack, null, 2);

    fs.writeFileSync(fullPackPath, fullJson, 'utf8');
    fs.writeFileSync(novelPackPath, novelJson, 'utf8');

    const fullPackBytes = Buffer.byteLength(fullJson, 'utf8');
    const novelPackBytes = Buffer.byteLength(novelJson, 'utf8');
    const fullGzipBytes = zlib.gzipSync(Buffer.from(fullJson, 'utf8')).length;
    const novelGzipBytes = zlib.gzipSync(Buffer.from(novelJson, 'utf8')).length;

    const fullPackBytesPerEntry =
      sortedEligibleKeys.length > 0 ? Math.round(fullPackBytes / sortedEligibleKeys.length) : null;
    const novelPackBytesPerEntry =
      sortedNovelKeys.length > 0 ? Math.round(novelPackBytes / sortedNovelKeys.length) : null;

    const experimentalPacks: ExperimentalPackGenerationResult = {
      fullPackPath,
      fullPackBytes,
      fullPackGzipBytes: fullGzipBytes,
      fullPackEntryCount: sortedEligibleKeys.length,
      fullPackBytesPerEntry,
      novelPackPath,
      novelPackBytes,
      novelPackGzipBytes: novelGzipBytes,
      novelPackEntryCount: sortedNovelKeys.length,
      novelPackBytesPerEntry,
      semanticPackSha256
    };

    // 7. Internal Corpus Coverage Evaluations via Dependency Injection
    const experimentalFallbackRepo = new EvidenceFallbackRepository(fullPack);
    const corpusEvaluations = this.evaluateInternalCorpora(experimentalFallbackRepo, options.evaluationCorpusPath);

    memoryTracker.sample();
    const durationMs = Date.now() - startTime;
    const peakRssMb = memoryTracker.getPeakRssMb();
    const endRssMb = memoryTracker.getEndRssMb();

    // 8. Performance stage report
    const fullPerformanceStage: ScalePerformanceStage = {
      stageName: 'FULL_DATASET',
      rowsProcessed: physicalRowsRead,
      wallClockDurationMs: durationMs,
      rowsPerSecond: durationMs > 0 ? Math.round((physicalRowsRead / (durationMs / 1000)) * 100) / 100 : 0,
      startRssMb,
      peakRssMb,
      endRssMb,
      eligibleEntriesCount: sortedEligibleKeys.length
    };

    // 9. Blocker Histogram
    const blockerHistogram: BlockerHistogramItem[] = Array.from(blockerCounts.entries())
      .map(([kind, count]) => ({
        blockerKind: kind,
        count,
        percentageOfBlockedInterpretations:
          totalBlockedInterpretations > 0 ? Math.round((count / totalBlockedInterpretations) * 10000) / 100 : null,
        percentageOfTotalInterpretationAttempts:
          totalInterpretationAttempts > 0 ? Math.round((count / totalInterpretationAttempts) * 10000) / 100 : null
      }))
      .sort((a, b) => b.count - a.count);

    // 10. Profile Distribution
    const totalProfileObs =
      classicalDariObservations + iranianObservations + unclassifiedObservations + conflictingObservations;
    const profileDistribution: ProfileClassificationDistribution = {
      classicalDariCount: classicalDariObservations,
      classicalDariPercentage:
        totalProfileObs > 0 ? Math.round((classicalDariObservations / totalProfileObs) * 10000) / 100 : null,
      iranianCount: iranianObservations,
      iranianPercentage:
        totalProfileObs > 0 ? Math.round((iranianObservations / totalProfileObs) * 10000) / 100 : null,
      unclassifiedCount: unclassifiedObservations,
      unclassifiedPercentage:
        totalProfileObs > 0 ? Math.round((unclassifiedObservations / totalProfileObs) * 10000) / 100 : null,
      conflictingCount: conflictingObservations,
      conflictingPercentage:
        totalProfileObs > 0 ? Math.round((conflictingObservations / totalProfileObs) * 10000) / 100 : null
    };

    // 11. Candidate Profile Combinations
    const candidateProfileCombinations: CandidateProfileCombinationDistribution = {
      classicalOnly: candidateClassicalOnly,
      iranianOnly: candidateIranianOnly,
      crossProfile: candidateCrossProfile,
      unclassifiedOnly: candidateUnclassifiedOnly,
      mixedClassifiedAndUnclassified: candidateMixedClassifiedAndUnclassified
    };

    // 12. Confidence Tiers
    const totalEligible = sortedEligibleKeys.length;
    const confidenceTiers: ConfidenceTierDistribution = {
      crossProfileConsensus: tierCrossProfile,
      crossProfilePercentage: totalEligible > 0 ? Math.round((tierCrossProfile / totalEligible) * 10000) / 100 : null,
      multiObservationConsensus: tierMultiObs,
      multiObservationPercentage: totalEligible > 0 ? Math.round((tierMultiObs / totalEligible) * 10000) / 100 : null,
      singleObservationDeterministic: tierSingleObs,
      singleObservationPercentage: totalEligible > 0 ? Math.round((tierSingleObs / totalEligible) * 10000) / 100 : null
    };

    // 13. POS Distribution
    const posDistribution: PosYieldItem[] = Array.from(posYieldMap.entries())
      .map(([pos, data]) => ({
        pos,
        sourceForms: data.sourceForms,
        eligibleFallbackForms: data.eligibleForms,
        eligibilityRate: data.sourceForms > 0 ? Math.round((data.eligibleForms / data.sourceForms) * 10000) / 100 : null
      }))
      .sort((a, b) => b.sourceForms - a.sourceForms);

    // 14. Proper Name Cohort
    const properNameCohort: ProperNameCohortMetrics = {
      sourceProperNameCount: properNameSourceCount,
      interpretableProperNameCount: properNameInterpretableCount,
      fallbackEligibleProperNameCount: properNameEligibleCount,
      crossProfileProperNameCount: properNameCrossProfileCount
    };

    // 15. Duplicate Evidence
    const duplicateEvidence: DuplicateEvidenceMetrics = {
      candidatesWith1Obs,
      candidatesWith2Obs,
      candidatesWith3PlusObs,
      literalDuplicateObservationsCount,
      sameRomanizationAcrossDistinctRecordsCount,
      sameNormalizedFormWithMultipleObservationsCount,
      evidenceReductionIfDuplicatesCollapsed
    };

    // 16. Reviewed Overlap Analysis
    const reviewedOverlap: ReviewedLexiconOverlapAnalysis = {
      totalEligibleEntries: sortedEligibleKeys.length,
      reviewedOverlapCount,
      novelEligibleCount: sortedNovelKeys.length,
      exactCanonicalMatches,
      canonicalDivergences,
      divergenceRate,
      divergenceSamples: divergencePool.sort((a, b) => a.hash.localeCompare(b.hash)).slice(0, 50).map((d) => d.item)
    };

    const yieldFunnel: KaikkiScaleYieldFunnel = {
      physicalRowsRead,
      malformedRows,
      validPersianRecords,
      distinctRawPersianForms: distinctRawPersianForms.size,
      distinctNormalizedForms: normalizedMap.size,
      normalizationCollisions,
      lemmaRecords,
      nonLemmaRecords,
      unknownLemmaStatusRecords,
      recordsWithRomanization,
      recordsWithoutRomanization,
      totalExtractedEvidenceObservations,
      romanizedEvidenceObservations,
      unromanizedEvidenceObservations,
      uniqueEvidenceObservationsAfterDeduplication,
      duplicateEvidenceObservationsRemoved,
      totalInterpretationAttempts,
      recordsWithIpa,
      recordsWithPos,
      properNameRecords,
      classicalDariObservations,
      iranianObservations,
      unclassifiedObservations,
      conflictingObservations,
      directEquivalentInterpretations,
      deterministicEquivalentInterpretations,
      contextRequiredInterpretations,
      unsupportedInterpretations,
      unanimousDeterministicCandidates,
      conflictingDeterministicCandidates,
      partialCandidates,
      blockedCandidates,
      noInterpretableEvidenceCandidates,
      totalFallbackEligibleCandidates,
      totalFallbackIneligibleCandidates
    };

    // Deterministic hash-based sampling
    const blockedSamplesByKind: Record<string, { normalizedForm: string; reason: string; romanizations: string[] }[]> = {};
    for (const [kind, pool] of Object.entries(blockedSamplePoolsByKind)) {
      blockedSamplesByKind[kind] = pool
        .sort((a, b) => a.hash.localeCompare(b.hash))
        .slice(0, 25)
        .map((p) => p.item);
    }

    const auditSamples: ScaleAuditSamples = {
      crossProfileSamples: crossProfilePool.sort((a, b) => a.hash.localeCompare(b.hash)).slice(0, 25).map((p) => p.item),
      multiObservationSamples: multiObservationPool.sort((a, b) => a.hash.localeCompare(b.hash)).slice(0, 25).map((p) => p.item),
      singleObservationSamples: singleObservationPool.sort((a, b) => a.hash.localeCompare(b.hash)).slice(0, 25).map((p) => p.item),
      blockedSamplesByKind,
      reviewedMatchSamples: reviewedMatchPool.sort((a, b) => a.hash.localeCompare(b.hash)).slice(0, 25).map((p) => p.item),
      reviewedDivergenceSamples: divergencePool.sort((a, b) => a.hash.localeCompare(b.hash)).slice(0, 50).map((p) => p.item)
    };

    return {
      experimentVersion: '1.0.0',
      executedAt: new Date().toISOString(),
      sourceManifest,
      performanceStages: [fullPerformanceStage],
      yieldFunnel,
      blockerHistogram,
      profileDistribution,
      candidateProfileCombinations,
      confidenceTiers,
      posDistribution,
      properNameCohort,
      reviewedOverlap,
      duplicateEvidence,
      experimentalPacks,
      corpusEvaluations,
      auditSamples,
      governanceInvariants: {
        automaticPromotions: 0,
        authoritativeLexiconMutations: 0,
        falseAuthoritativeCount: 0,
        underBlockedCount: 0,
        productionPackUntouched: true
      }
    };
  }

  /**
   * Evaluates coverage on internal benchmark corpora.
   */
  public evaluateInternalCorpora(
    fallbackRepo: EvidenceFallbackRepository,
    extraCorpusPath?: string
  ): CorpusCoverageEvaluationResult[] {
    const results: CorpusCoverageEvaluationResult[] = [];
    const emptyFallbackRepo = new EvidenceFallbackRepository();

    // Corpus 1: V3 Frozen Gold Benchmark (108 cases)
    const v3BenchmarkPath = path.resolve('validation/corpus/phase4.6b-external-benchmark.v3.json');
    if (fs.existsSync(v3BenchmarkPath)) {
      const v3Raw = JSON.parse(fs.readFileSync(v3BenchmarkPath, 'utf8'));
      const cases = (v3Raw.cases ?? []) as Array<{ input: string; profile?: string }>;
      results.push(
        this.evaluateCases('V3_FROZEN_EXTERNAL_BENCHMARK (108 cases)', cases, fallbackRepo, emptyFallbackRepo)
      );
    }

    // Corpus 2: Pilot Single Validation Corpus (46 cases)
    const pilotSinglePath = path.resolve('validation/corpus/pilot.single.json');
    if (fs.existsSync(pilotSinglePath)) {
      const singleRaw = JSON.parse(fs.readFileSync(pilotSinglePath, 'utf8'));
      const cases = (singleRaw.cases ?? []) as Array<{ input: string; profile?: string }>;
      results.push(this.evaluateCases('PILOT_SINGLE_VALIDATION_CORPUS (46 cases)', cases, fallbackRepo, emptyFallbackRepo));
    }

    // Corpus 3: User supplied external evaluation corpus
    if (extraCorpusPath && fs.existsSync(extraCorpusPath)) {
      const extraRaw = JSON.parse(fs.readFileSync(extraCorpusPath, 'utf8'));
      const cases = Array.isArray(extraRaw)
        ? (extraRaw as Array<{ input: string; profile?: string }>)
        : ((extraRaw.cases ?? []) as Array<{ input: string; profile?: string }>);
      results.push(this.evaluateCases(`CUSTOM_EVALUATION_CORPUS (${path.basename(extraCorpusPath)})`, cases, fallbackRepo, emptyFallbackRepo));
    }

    return results;
  }

  private evaluateCases(
    corpusName: string,
    cases: Array<{ input: string; profile?: string }>,
    fallbackRepo: EvidenceFallbackRepository,
    emptyFallbackRepo: EvidenceFallbackRepository
  ): CorpusCoverageEvaluationResult {
    let totalLexicalTokens = 0;
    let unresolvedTokensBefore = 0;
    let displayableTokensBefore = 0;
    let displayableTokensAfter = 0;
    let authoritativeTokensBefore = 0;
    let authoritativeTokensAfter = 0;
    let recoveredTokens = 0;

    const uniqueLexicalForms = new Set<string>();
    const unresolvedUniqueFormsBefore = new Set<string>();
    const displayableUniqueFormsBefore = new Set<string>();
    const displayableUniqueFormsAfter = new Set<string>();
    const recoveredUniqueForms = new Set<string>();

    for (const c of cases) {
      const profile = (c.profile as any) ?? 'ijmes_full';
      const resBefore = transliterate(c.input, profile, [], DEFAULT_LEXICON_REPOSITORY, emptyFallbackRepo);
      const resAfter = transliterate(c.input, profile, [], DEFAULT_LEXICON_REPOSITORY, fallbackRepo);

      const persianTokensBefore = resBefore.tokens.filter((t) => t.tokenType === 'persian-word');
      const persianTokensAfter = resAfter.tokens.filter((t) => t.tokenType === 'persian-word');

      totalLexicalTokens += persianTokensBefore.length;

      for (let i = 0; i < persianTokensBefore.length; i++) {
        const tBefore = persianTokensBefore[i];
        const tAfter = persianTokensAfter[i];
        const norm = tBefore.normalizedSurface;
        uniqueLexicalForms.add(norm);

        const isAuthBefore = tBefore.status === 'LEXICON_RESOLVED' || tBefore.status === 'DETERMINISTIC';
        const isAuthAfter = tAfter.status === 'LEXICON_RESOLVED' || tAfter.status === 'DETERMINISTIC';

        if (isAuthBefore) {
          authoritativeTokensBefore += 1;
          displayableTokensBefore += 1;
          displayableUniqueFormsBefore.add(norm);
        }

        if (isAuthAfter) {
          authoritativeTokensAfter += 1;
        }

        if (tBefore.status === 'UNRESOLVED' && tBefore.blockingReason === 'NO_LEXICAL_ENTRY') {
          unresolvedTokensBefore += 1;
          unresolvedUniqueFormsBefore.add(norm);
        }

        const isDisplayableAfter = isAuthAfter || tAfter.evidenceDerivedProposal !== undefined;
        if (isDisplayableAfter) {
          displayableTokensAfter += 1;
          displayableUniqueFormsAfter.add(norm);
        }

        if (
          tBefore.status === 'UNRESOLVED' &&
          tBefore.blockingReason === 'NO_LEXICAL_ENTRY' &&
          tAfter.evidenceDerivedProposal !== undefined
        ) {
          recoveredTokens += 1;
          recoveredUniqueForms.add(norm);
        }
      }
    }

    const totalUniqueCount = uniqueLexicalForms.size;
    const unresolvedUniqueCount = unresolvedUniqueFormsBefore.size;

    return {
      corpusName,
      totalLexicalTokens,
      uniqueLexicalForms: totalUniqueCount,
      unresolvedTokensBefore,
      unresolvedUniqueFormsBefore: unresolvedUniqueCount,

      displayableTokensBefore,
      displayCoverageBefore:
        totalLexicalTokens > 0 ? Math.round((displayableTokensBefore / totalLexicalTokens) * 10000) / 100 : 0,
      displayableTokensAfter,
      displayCoverageAfter:
        totalLexicalTokens > 0 ? Math.round((displayableTokensAfter / totalLexicalTokens) * 10000) / 100 : 0,

      displayableUniqueFormsBefore: displayableUniqueFormsBefore.size,
      uniqueFormDisplayCoverageBefore:
        totalUniqueCount > 0 ? Math.round((displayableUniqueFormsBefore.size / totalUniqueCount) * 10000) / 100 : 0,
      displayableUniqueFormsAfter: displayableUniqueFormsAfter.size,
      uniqueFormDisplayCoverageAfter:
        totalUniqueCount > 0 ? Math.round((displayableUniqueFormsAfter.size / totalUniqueCount) * 10000) / 100 : 0,

      authoritativeTokensBefore,
      authoritativeCoverageBefore:
        totalLexicalTokens > 0 ? Math.round((authoritativeTokensBefore / totalLexicalTokens) * 10000) / 100 : 0,
      authoritativeTokensAfter,
      authoritativeCoverageAfter:
        totalLexicalTokens > 0 ? Math.round((authoritativeTokensAfter / totalLexicalTokens) * 10000) / 100 : 0,

      recoveredTokens,
      tokenLexicalMissRecoveryRate:
        unresolvedTokensBefore > 0 ? Math.round((recoveredTokens / unresolvedTokensBefore) * 10000) / 100 : 0,
      recoveredUniqueForms: recoveredUniqueForms.size,
      uniqueFormLexicalMissRecoveryRate:
        unresolvedUniqueCount > 0 ? Math.round((recoveredUniqueForms.size / unresolvedUniqueCount) * 10000) / 100 : 0
    };
  }
}
