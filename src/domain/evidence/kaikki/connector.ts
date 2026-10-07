/**
 * Kaikki Persian evidence connector and acquisition pipeline orchestrator.
 *
 * Implements the domain contract LexicalEvidenceSource<KaikkiRawEntry, KaikkiParseOptions>.
 *
 * Core invariant:
 *   External observations extracted by this connector are strictly non-authoritative
 *   lexicographic evidence. They NEVER mutate or insert into DEFAULT_LEXICON_REPOSITORY.
 *   Authoritative promotions = 0.
 */

import fs from 'node:fs';
import type { Readable } from 'node:stream';
import { DEFAULT_LEXICON_REPOSITORY } from '../../../data/lexicon';
import { LexiconRepository } from '../../lexicon/repository';
import { synthesizeCandidateFromEvidence } from '../candidate';
import {
  EvidenceExtractionError,
  LexicalEvidenceSource,
  RawSourceRecord
} from '../connector';
import {
  LexicalCandidate,
  LexicalEvidence,
  LexicalEvidenceSourceType,
  RomanizationScheme
} from '../types';
import {
  extractKaikkiObservations,
  KAIKKI_EXTRACTOR_VERSION,
  KAIKKI_SOURCE_ID
} from './extractor';
import { parseKaikkiJsonlStream } from './parser';
import {
  buildKaikkiAcquisitionReport,
  computeFileSha256
} from './statistics';
import type {
  KaikkiAcquisitionResult,
  KaikkiExtractedObservation,
  KaikkiParseOptions,
  KaikkiRawEntry,
  KaikkiSourceManifest
} from './types';

export interface KaikkiConnectorOptions {
  lexiconRepo?: LexiconRepository;
  manifestOverrides?: Partial<KaikkiSourceManifest>;
}

export class KaikkiEvidenceConnector implements LexicalEvidenceSource<KaikkiRawEntry, KaikkiParseOptions> {
  public readonly sourceId = KAIKKI_SOURCE_ID;
  public readonly sourceType: LexicalEvidenceSourceType = 'LEXICOGRAPHIC_DATASET';
  public readonly defaultScheme: RomanizationScheme = 'LOCAL';

  private readonly lexiconRepo: LexiconRepository;
  private readonly manifestOverrides?: Partial<KaikkiSourceManifest>;

  constructor(options?: KaikkiConnectorOptions) {
    this.lexiconRepo = options?.lexiconRepo ?? DEFAULT_LEXICON_REPOSITORY;
    this.manifestOverrides = options?.manifestOverrides;
  }

  /**
   * Fetch method required by LexicalEvidenceSource.
   * For Kaikki bulk dataset, returns empty array if invoked directly without a stream.
   */
  public async fetch(_query: KaikkiParseOptions): Promise<RawSourceRecord<KaikkiRawEntry>[]> {
    return [];
  }

  /**
   * Extract source-neutral LexicalEvidence records from a raw Kaikki source record.
   */
  public extractEvidence(record: RawSourceRecord<KaikkiRawEntry>): LexicalEvidence[] {
    try {
      const extracted = extractKaikkiObservations(record.payload, {
        now: () => record.fetchedAt
      });
      return extracted.map((o) => o.evidence);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new EvidenceExtractionError(this.sourceId, message, record.rawIdentifier);
    }
  }

  /**
   * Stream and process a Kaikki JSONL file, producing evidence, metadata, candidates, and summary report.
   */
  public async processFile(
    filePath: string,
    options?: KaikkiParseOptions
  ): Promise<KaikkiAcquisitionResult> {
    const inputSha256 = await computeFileSha256(filePath);
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });

    return this.processStream(stream, {
      ...options,
      inputSha256,
      inputFile: filePath
    });
  }

  /**
   * Stream and process a Kaikki JSONL Readable stream.
   */
  public async processStream(
    stream: Readable,
    options?: KaikkiParseOptions & { inputSha256?: string; inputFile?: string }
  ): Promise<KaikkiAcquisitionResult> {
    const acquisitionTimestamp = new Date().toISOString();

    const manifest: KaikkiSourceManifest = {
      source: KAIKKI_SOURCE_ID,
      extractorVersion: KAIKKI_EXTRACTOR_VERSION,
      acquisitionTimestamp,
      inputSha256: options?.inputSha256,
      inputFile: options?.inputFile,
      ...this.manifestOverrides
    };

    let rowsRead = 0;
    let malformedRows = 0;
    let validPersianRecords = 0;
    const observations: KaikkiExtractedObservation[] = [];

    for await (const result of parseKaikkiJsonlStream(stream, options)) {
      rowsRead += 1;
      if (!result.success || !result.entry) {
        if (result.error) {
          malformedRows += 1;
        }
        continue;
      }

      validPersianRecords += 1;

      if (options?.onlyLemmas) {
        const hasFormOf = result.entry.senses?.some((s) => s.form_of && s.form_of.length > 0);
        if (hasFormOf) {
          continue;
        }
      }

      const extracted = extractKaikkiObservations(result.entry, {
        now: () => acquisitionTimestamp
      });
      observations.push(...extracted);
    }

    // Group evidence by Persian form for Candidate synthesis
    const evidenceByPersian = new Map<string, LexicalEvidence[]>();
    for (const obs of observations) {
      const form = obs.rawSourceWord;
      let list = evidenceByPersian.get(form);
      if (!list) {
        list = [];
        evidenceByPersian.set(form, list);
      }
      list.push(obs.evidence);
    }

    // Synthesize candidates (proposedCanonical = null, ZERO automatic authority)
    const candidates: LexicalCandidate[] = [];
    for (const [persianForm, evidenceList] of evidenceByPersian.entries()) {
      const candidate = synthesizeCandidateFromEvidence(persianForm, evidenceList, {
        derivedAt: acquisitionTimestamp,
        proposedCanonical: null,
        notes: 'Synthesized from Kaikki Wiktionary Persian dataset observation'
      });
      candidates.push(candidate);
    }

    const report = buildKaikkiAcquisitionReport({
      manifest,
      rowsRead,
      malformedRows,
      validPersianRecords,
      observations,
      candidates,
      lexiconRepo: this.lexiconRepo
    });

    const allEvidence = observations.map((o) => o.evidence);

    return {
      observations,
      evidence: allEvidence,
      candidates,
      report
    };
  }
}
