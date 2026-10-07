/**
 * Statistics, overlap analysis, and collision reporting for Kaikki acquisition.
 *
 * Core invariant:
 *   All comparisons against DEFAULT_LEXICON_REPOSITORY are strictly READ-ONLY.
 *   Authoritative lexicon changes = 0.
 *   Automatically promoted = 0.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import { DEFAULT_LEXICON_REPOSITORY } from '../../../data/lexicon';
import { LexiconRepository } from '../../lexicon/repository';
import type { LexicalCandidate } from '../types';
import { KAIKKI_EXTRACTOR_VERSION, KAIKKI_SOURCE_ID } from './extractor';
import type {
  KaikkiAcquisitionReport,
  KaikkiExtractedObservation,
  KaikkiLexiconOverlapItem,
  KaikkiMultiRomanizationEntry,
  KaikkiNormalizationCollision,
  KaikkiSourceManifest
} from './types';

/**
 * Compute streaming SHA-256 checksum of a file.
 */
export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => reject(err));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Analyze overlap between extracted normalized Persian forms and the project LexiconRepository.
 *
 * Guaranteed READ-ONLY: never mutates or inserts into the lexicon repository.
 */
export function analyzeLexiconOverlap(
  normalizedForms: Map<string, { rawWords: Set<string>; romanizations: Set<string> }>,
  lexiconRepo: LexiconRepository = DEFAULT_LEXICON_REPOSITORY
): {
  overlapCount: number;
  newFormCount: number;
  overlapItems: KaikkiLexiconOverlapItem[];
} {
  let overlapCount = 0;
  let newFormCount = 0;
  const overlapItems: KaikkiLexiconOverlapItem[] = [];

  for (const [normForm, data] of normalizedForms.entries()) {
    const entry = lexiconRepo.findByNormalized(normForm);
    const romanizations = Array.from(data.romanizations);
    const rawForm = Array.from(data.rawWords)[0] ?? normForm;

    if (entry) {
      overlapCount += 1;
      const canonicals = entry.readings.map((r) => r.canonical);
      const primaryCanonical = canonicals[0] ?? '';
      const exactMatch = romanizations.some((r) =>
        canonicals.some((c) => r.toLowerCase() === c.toLowerCase())
      );
      overlapItems.push({
        normalizedForm: normForm,
        persianForm: rawForm,
        inLexicon: true,
        lexiconCanonical: primaryCanonical,
        externalRomanizations: romanizations,
        overlapStatus: exactMatch ? 'EXACT_MATCH' : 'DIVERGENT'
      });
    } else {
      newFormCount += 1;
      overlapItems.push({
        normalizedForm: normForm,
        persianForm: rawForm,
        inLexicon: false,
        externalRomanizations: romanizations,
        overlapStatus: 'NEW_FORM'
      });
    }
  }

  return { overlapCount, newFormCount, overlapItems };
}

/**
 * Detect normalization collisions where multiple distinct raw source words
 * normalize to the same project string.
 */
export function detectNormalizationCollisions(
  observations: KaikkiExtractedObservation[]
): KaikkiNormalizationCollision[] {
  const map = new Map<
    string,
    {
      rawForms: Set<string>;
      posList: Set<string>;
      romanizations: Set<string>;
    }
  >();

  for (const obs of observations) {
    const norm = obs.normalizedForm;
    let group = map.get(norm);
    if (!group) {
      group = {
        rawForms: new Set(),
        posList: new Set(),
        romanizations: new Set()
      };
      map.set(norm, group);
    }

    group.rawForms.add(obs.rawSourceWord);
    if (obs.metadata.pos) group.posList.add(obs.metadata.pos);
    if (obs.evidence.observedRomanization) {
      group.romanizations.add(obs.evidence.observedRomanization);
    }
  }

  const collisions: KaikkiNormalizationCollision[] = [];
  for (const [norm, group] of map.entries()) {
    if (group.rawForms.size > 1) {
      collisions.push({
        normalizedForm: norm,
        rawForms: Array.from(group.rawForms).sort(),
        posList: Array.from(group.posList).sort(),
        romanizations: Array.from(group.romanizations).sort()
      });
    }
  }

  return collisions;
}

/**
 * Compile multi-romanization entries and statistics across Persian forms.
 */
export function compileMultiRomanizationEntries(
  observations: KaikkiExtractedObservation[]
): {
  formsWithOneRomanization: number;
  formsWithMultiRomanization: number;
  formsWithNoRomanization: number;
  multiEntries: KaikkiMultiRomanizationEntry[];
} {
  const formMap = new Map<
    string,
    {
      normalizedForm: string;
      observations: string[];
      evidenceIds: string[];
    }
  >();

  for (const obs of observations) {
    const raw = obs.rawSourceWord;
    let entry = formMap.get(raw);
    if (!entry) {
      entry = {
        normalizedForm: obs.normalizedForm,
        observations: [],
        evidenceIds: []
      };
      formMap.set(raw, entry);
    }

    entry.evidenceIds.push(obs.evidence.id);
    if (obs.evidence.observedRomanization) {
      entry.observations.push(obs.evidence.observedRomanization);
    }
  }

  let formsWithOne = 0;
  let formsWithMulti = 0;
  let formsWithNo = 0;
  const multiEntries: KaikkiMultiRomanizationEntry[] = [];

  for (const [raw, data] of formMap.entries()) {
    const distinct = Array.from(new Set(data.observations));
    if (distinct.length === 1) {
      formsWithOne += 1;
    } else if (distinct.length > 1) {
      formsWithMulti += 1;
      multiEntries.push({
        persianForm: raw,
        normalizedForm: data.normalizedForm,
        observations: data.observations,
        distinctObservations: distinct,
        automaticAuthority: false,
        evidenceIds: data.evidenceIds
      });
    } else {
      formsWithNo += 1;
    }
  }

  return {
    formsWithOneRomanization: formsWithOne,
    formsWithMultiRomanization: formsWithMulti,
    formsWithNoRomanization: formsWithNo,
    multiEntries
  };
}

/**
 * Build complete Kaikki acquisition report from observations and candidate results.
 */
export function buildKaikkiAcquisitionReport(params: {
  manifest: KaikkiSourceManifest;
  rowsRead: number;
  malformedRows: number;
  validPersianRecords?: number;
  observations: KaikkiExtractedObservation[];
  candidates: LexicalCandidate[];
  lexiconRepo?: LexiconRepository;
}): KaikkiAcquisitionReport {
  const { manifest, rowsRead, malformedRows, observations, candidates, lexiconRepo } = params;

  const distinctPersianForms = new Set<string>();
  const normalizedMap = new Map<string, { rawWords: Set<string>; romanizations: Set<string> }>();

  let lemmaRecords = 0;
  let nonLemmaRecords = 0;
  let unknownLemmaRecords = 0;
  let entriesWithIpa = 0;
  let entriesWithRomanization = 0;
  let romanizationObservationCount = 0;

  const processedEntries = new Set<string>();

  for (const obs of observations) {
    distinctPersianForms.add(obs.rawSourceWord);

    let normGroup = normalizedMap.get(obs.normalizedForm);
    if (!normGroup) {
      normGroup = { rawWords: new Set(), romanizations: new Set() };
      normalizedMap.set(obs.normalizedForm, normGroup);
    }
    normGroup.rawWords.add(obs.rawSourceWord);
    if (obs.evidence.observedRomanization) {
      normGroup.romanizations.add(obs.evidence.observedRomanization);
      romanizationObservationCount += 1;
    }

    const entryKey = `${obs.rawSourceWord}#${obs.metadata.pos ?? 'entry'}`;
    if (!processedEntries.has(entryKey)) {
      processedEntries.add(entryKey);

      if (obs.metadata.lemmaStatus === 'LEMMA') lemmaRecords += 1;
      else if (obs.metadata.lemmaStatus === 'NON_LEMMA_FORM') nonLemmaRecords += 1;
      else unknownLemmaRecords += 1;

      if (obs.metadata.ipaObservations.length > 0) entriesWithIpa += 1;
      if (obs.evidence.observedRomanization !== null) entriesWithRomanization += 1;
    }
  }

  const { overlapCount, newFormCount } = analyzeLexiconOverlap(normalizedMap, lexiconRepo);
  const collisions = detectNormalizationCollisions(observations);
  const {
    formsWithOneRomanization,
    formsWithMultiRomanization,
    formsWithNoRomanization,
    multiEntries
  } = compileMultiRomanizationEntries(observations);

  return {
    source: KAIKKI_SOURCE_ID,
    extractorVersion: KAIKKI_EXTRACTOR_VERSION,
    manifest,
    rowsRead,
    malformedRows,
    validPersianRecords: params.validPersianRecords ?? processedEntries.size,
    distinctPersianForms: distinctPersianForms.size,
    distinctNormalizedForms: normalizedMap.size,
    lemmaRecords,
    nonLemmaRecords,
    unknownLemmaStatusRecords: unknownLemmaRecords,
    entriesWithRomanization,
    romanizationObservationCount,
    formsWithOneRomanization,
    formsWithMultiRomanization,
    formsWithNoRomanization,
    entriesWithIpa,
    existingLexiconOverlapCount: overlapCount,
    newFormCount,
    candidateCount: candidates.length,
    promotionCount: 0,
    authoritativeLexiconChanges: 0,
    normalizationCollisions: collisions,
    multiRomanizationSamples: multiEntries.slice(0, 100)
  };
}

/**
 * Format the standard human-readable summary table required by the pilot specification.
 */
export function formatKaikkiSummary(report: KaikkiAcquisitionReport): string {
  const pad = (label: string, value: string | number) =>
    `${label.padEnd(32)} ${String(value).padStart(12)}`;

  return [
    '================================================================',
    'Kaikki Persian Acquisition Pilot',
    '================================================================',
    pad('Rows read:', report.rowsRead.toLocaleString()),
    pad('Malformed rows:', report.malformedRows.toLocaleString()),
    pad('Valid Persian records:', report.validPersianRecords.toLocaleString()),
    pad('Distinct Persian forms:', report.distinctPersianForms.toLocaleString()),
    pad('Distinct normalized forms:', report.distinctNormalizedForms.toLocaleString()),
    pad('Lemma records:', report.lemmaRecords.toLocaleString()),
    pad('Non-lemma forms:', report.nonLemmaRecords.toLocaleString()),
    pad('Unknown lemma status records:', report.unknownLemmaStatusRecords.toLocaleString()),
    pad('Entries with romanization:', report.entriesWithRomanization.toLocaleString()),
    pad('Romanization observations:', report.romanizationObservationCount.toLocaleString()),
    pad('Forms with 1 romanization:', report.formsWithOneRomanization.toLocaleString()),
    pad('Forms with >1 romanization:', report.formsWithMultiRomanization.toLocaleString()),
    pad('Forms with no romanization:', report.formsWithNoRomanization.toLocaleString()),
    pad('Forms with IPA:', report.entriesWithIpa.toLocaleString()),
    pad('Existing project lexicon:', report.existingLexiconOverlapCount.toLocaleString()),
    pad('New lexical forms:', report.newFormCount.toLocaleString()),
    pad('Candidate records generated:', report.candidateCount.toLocaleString()),
    pad('Normalization collisions:', report.normalizationCollisions.length.toLocaleString()),
    pad('Automatically promoted:', report.promotionCount),
    pad('Authoritative lexicon changes:', report.authoritativeLexiconChanges),
    '================================================================'
  ].join('\n');
}
