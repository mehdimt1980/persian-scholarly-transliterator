import { LexicalEvidence, LexicalEvidenceSourceType, RomanizationScheme } from './types';

/**
 * Raw external record fetched from a remote or local data provider.
 */
export interface RawSourceRecord<TPayload = unknown> {
  sourceId: string;
  rawIdentifier?: string;
  payload: TPayload;
  fetchedAt: string;
}

/**
 * Contract for external source connectors / adapters (e.g. LoC, VIAF, BnF, GND, WorldCat).
 *
 * Invariant: Connectors extract evidence from raw records, producing LexicalEvidence records.
 * Connectors NEVER interact with or mutate the authoritative LexiconRepository.
 */
export interface LexicalEvidenceSource<TPayload = unknown, TQuery = unknown> {
  readonly sourceId: string;
  readonly sourceType: LexicalEvidenceSourceType;
  readonly defaultScheme: RomanizationScheme;

  /**
   * Fetch raw source records according to a source-specific query.
   */
  fetch(query: TQuery): Promise<RawSourceRecord<TPayload>[]>;

  /**
   * Extract source-neutral LexicalEvidence records from a raw source record.
   */
  extractEvidence(record: RawSourceRecord<TPayload>): LexicalEvidence[];
}

export class EvidenceExtractionError extends Error {
  public readonly sourceId: string;
  public readonly rawIdentifier?: string;

  constructor(sourceId: string, message: string, rawIdentifier?: string) {
    super(`[${sourceId}] Failed to extract lexical evidence: ${message}`);
    this.name = 'EvidenceExtractionError';
    this.sourceId = sourceId;
    this.rawIdentifier = rawIdentifier;
  }
}
