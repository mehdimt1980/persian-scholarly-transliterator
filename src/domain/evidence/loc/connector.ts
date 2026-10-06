import {
  EvidenceExtractionError,
  LexicalEvidenceSource,
  RawSourceRecord
} from '../connector';
import { LexicalEvidence, LexicalEvidenceSourceType, RomanizationScheme } from '../types';
import { LocClient, LocClientOptions } from './client';
import { extractEvidenceFromMarcRecord } from './extractor';
import { LocExtractorOptions, LocQuery } from './types';
import { parseMarcXml } from './xmlParser';

/**
 * Library of Congress pilot evidence connector.
 *
 * Implements the domain contract LexicalEvidenceSource<string, LocQuery>.
 *
 * Core invariant:
 *   External observations extracted by this connector are strictly non-authoritative
 *   cataloging evidence. They NEVER interact with or mutate the authoritative LexiconRepository.
 */
export class LocEvidenceConnector implements LexicalEvidenceSource<string, LocQuery> {
  public readonly sourceId = 'LOC';
  public readonly sourceType: LexicalEvidenceSourceType = 'LIBRARY_CATALOG';
  public readonly defaultScheme: RomanizationScheme = 'ALA_LC';

  private readonly client: LocClient;
  private readonly extractorOptions?: LocExtractorOptions;

  constructor(options?: { client?: LocClientOptions; extractor?: LocExtractorOptions }) {
    this.client = new LocClient(options?.client);
    this.extractorOptions = options?.extractor;
  }

  /**
   * Fetch raw MARCXML source records from the Library of Congress catalog.
   */
  public async fetch(query: LocQuery): Promise<RawSourceRecord<string>[]> {
    if (query.kind === 'LCCN') {
      const record = await this.client.fetchLccn(query.lccn);
      return [record];
    } else if (query.kind === 'SRU') {
      return this.client.searchSru(query.cql, {
        startRecord: query.startRecord,
        maximumRecords: query.maximumRecords
      });
    } else {
      throw new Error(`Unsupported LoC query kind: ${(query as any)?.kind}`);
    }
  }

  /**
   * Extract source-neutral LexicalEvidence records from a raw MARCXML source record.
   */
  public extractEvidence(record: RawSourceRecord<string>): LexicalEvidence[] {
    try {
      const marcRecords = parseMarcXml(record.payload);
      if (marcRecords.length === 0) {
        return [];
      }

      const allEvidence: LexicalEvidence[] = [];
      for (const marcRecord of marcRecords) {
        const evidence = extractEvidenceFromMarcRecord(marcRecord, {
          ...this.extractorOptions,
          now: () => record.fetchedAt
        });
        allEvidence.push(...evidence);
      }

      return allEvidence;
    } catch (err: any) {
      throw new EvidenceExtractionError(this.sourceId, err.message, record.rawIdentifier);
    }
  }
}
