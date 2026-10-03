import { BibliographyRecord } from './types';

const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * Deterministic 64-bit FNV-1a hash formatted as a 16-character hexadecimal string.
 */
export function fnv1a64Hex(input: string): string {
  let hash = FNV_OFFSET_BASIS_64;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

export function computeRecordContentFingerprint(record: Omit<BibliographyRecord, 'id' | 'sourceRowIndex' | 'sourceColumns'>): string {
  const components = [
    record.type,
    record.title,
    record.containerTitle ?? '',
    record.authors.map((a) => a.literal).join('|'),
    record.editors.map((e) => e.literal).join('|'),
    record.translators.map((t) => t.literal).join('|'),
    record.year ?? '',
    record.publisher ?? '',
    record.place ?? '',
    record.volume ?? '',
    record.issue ?? '',
    record.pageStart ?? '',
    record.pageEnd ?? '',
    record.doi ?? '',
    record.url ?? '',
    record.isbn ?? '',
    record.issn ?? '',
    record.language ?? '',
    record.notes ?? ''
  ];

  // Include sorted passthrough entries
  const passthroughKeys = Object.keys(record.passthrough).sort();
  for (const k of passthroughKeys) {
    components.push(`${k}=${record.passthrough[k]}`);
  }

  return fnv1a64Hex(components.join(':::'));
}

export function generateFallbackRecordId(
  record: Omit<BibliographyRecord, 'id' | 'sourceRowIndex' | 'sourceColumns'>,
  occurrence: number
): string {
  const fingerprint = computeRecordContentFingerprint(record);
  return `record:${fingerprint}:${occurrence}`;
}
