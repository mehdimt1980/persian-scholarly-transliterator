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
import type { LexicalCandidate, LexicalEvidence } from '../types';
import { KAIKKI_EXTRACTOR_VERSION, KAIKKI_SOURCE_ID } from './extractor';
import type {
  KaikkiAcquisitionReport,
  KaikkiExtractedObservation,
  KaikkiLemmaStatus,
  KaikkiLexiconOverlapItem,
  KaikkiMultiRomanizationEntry,
  KaikkiNormalizationCollision,
  KaikkiSourceManifest
} from './types';

/**
 * Lightweight accumulator for normalized Persian lexical forms.
 * Allows streaming acquisition without holding every raw observation in memory.
 */
export interface NormalizedLexicalGroup {
  normalizedForm: string;
  rawWords: Set<string>;
  posList: Set<string>;
  romanizations: Set<string>;
  evidenceIds: string[];
  supportingEvidence: LexicalEvidence[];
}

/**
 * Streaming accumulator for Kaikki acquisition metrics and normalized groups.
 */
export class KaikkiAcquisitionAccumulator {
  public rowsRead = 0;
  public malformedRows = 0;
  public validPersianRecords = 0;

  public lemmaRecords = 0;
  public nonLemmaRecords = 0;
  public unknownLemmaStatusRecords = 0;

  public entriesWithIpa = 0;
  public entriesWithRomanization = 0;
  public romanizationObservationCount = 0;

  private readonly distinctPersianForms = new Set<string>();
  private readonly normalizedGroups = new Map<string, NormalizedLexicalGroup>();
  private readonly processedEntryKeys = new Set<string>();

  // Tracks multi-romanization per raw word
  private readonly rawWordObservations = new Map<
    string,
    { normalizedForm: string; observations: string[]; evidenceIds: string[] }
  >();

  public addObservation(obs: KaikkiExtractedObservation, retainEvidenceForCandidate = true): void {
    this.distinctPersianForms.add(obs.rawSourceWord);

    let group = this.normalizedGroups.get(obs.normalizedForm);
    if (!group) {
      group = {
        normalizedForm: obs.normalizedForm,
        rawWords: new Set(),
        posList: new Set(),
        romanizations: new Set(),
        evidenceIds: [],
        supportingEvidence: []
      };
      this.normalizedGroups.set(obs.normalizedForm, group);
    }

    group.rawWords.add(obs.rawSourceWord);
    if (obs.metadata.pos) group.posList.add(obs.metadata.pos);
    group.evidenceIds.push(obs.evidence.id);

    if (retainEvidenceForCandidate) {
      group.supportingEvidence.push(obs.evidence);
    }

    if (obs.evidence.observedRomanization) {
      group.romanizations.add(obs.evidence.observedRomanization);
      this.romanizationObservationCount += 1;
    }

    // Track raw word observations
    let rawTrack = this.rawWordObservations.get(obs.rawSourceWord);
    if (!rawTrack) {
      rawTrack = {
        normalizedForm: obs.normalizedForm,
        observations: [],
        evidenceIds: []
      };
      this.rawWordObservations.set(obs.rawSourceWord, rawTrack);
    }
    rawTrack.evidenceIds.push(obs.evidence.id);
    if (obs.evidence.observedRomanization) {
      rawTrack.observations.push(obs.evidence.observedRomanization);
    }
  }

  public recordEntryMetadata(
    entryKey: string,
    lemmaStatus: KaikkiLemmaStatus,
    hasIpa: boolean,
    hasRomanization: boolean
  ): void {
    if (!this.processedEntryKeys.has(entryKey)) {
      this.processedEntryKeys.add(entryKey);

      if (lemmaStatus === 'LEMMA') this.lemmaRecords += 1;
      else if (lemmaStatus === 'NON_LEMMA_FORM') this.nonLemmaRecords += 1;
      else this.unknownLemmaStatusRecords += 1;

      if (hasIpa) this.entriesWithIpa += 1;
      if (hasRomanization) this.entriesWithRomanization += 1;
    }
  }

  public getNormalizedGroups(): Map<string, NormalizedLexicalGroup> {
    return this.normalizedGroups;
  }

  public toReport(
    manifest: KaikkiSourceManifest,
    candidateCount: number,
    lexiconRepo: LexiconRepository = DEFAULT_LEXICON_REPOSITORY
  ): KaikkiAcquisitionReport {
    // Normalization collisions
    const collisions: KaikkiNormalizationCollision[] = [];
    for (const [norm, group] of this.normalizedGroups.entries()) {
      if (group.rawWords.size > 1) {
        collisions.push({
          normalizedForm: norm,
          rawForms: Array.from(group.rawWords).sort(),
          posList: Array.from(group.posList).sort(),
          romanizations: Array.from(group.romanizations).sort()
        });
      }
    }

    // Overlap analysis
    const { overlapCount, newFormCount } = analyzeLexiconOverlap(this.normalizedGroups, lexiconRepo);

    // Multi-romanization metrics
    let formsWithOne = 0;
    let formsWithMulti = 0;
    let formsWithNo = 0;
    const multiEntries: KaikkiMultiRomanizationEntry[] = [];

    for (const [raw, data] of this.rawWordObservations.entries()) {
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
      source: KAIKKI_SOURCE_ID,
      extractorVersion: KAIKKI_EXTRACTOR_VERSION,
      manifest,
      rowsRead: this.rowsRead,
      malformedRows: this.malformedRows,
      validPersianRecords: this.validPersianRecords,
      distinctPersianForms: this.distinctPersianForms.size,
      distinctNormalizedForms: this.normalizedGroups.size,
      lemmaRecords: this.lemmaRecords,
      nonLemmaRecords: this.nonLemmaRecords,
      unknownLemmaStatusRecords: this.unknownLemmaStatusRecords,
      entriesWithRomanization: this.entriesWithRomanization,
      romanizationObservationCount: this.romanizationObservationCount,
      formsWithOneRomanization: formsWithOne,
      formsWithMultiRomanization: formsWithMulti,
      formsWithNoRomanization: formsWithNo,
      entriesWithIpa: this.entriesWithIpa,
      existingLexiconOverlapCount: overlapCount,
      newFormCount,
      candidateCount,
      promotionCount: 0,
      authoritativeLexiconChanges: 0,
      normalizationCollisions: collisions,
      multiRomanizationSamples: multiEntries.slice(0, 100)
    };
  }
}

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
