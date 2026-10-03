import { BibliographyRecord } from './types';

function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeRecordContentFingerprint(record: Omit<BibliographyRecord, 'id' | 'sourceRowIndex'>): string {
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

  return fnv1a32Hex(components.join(':::'));
}

export function generateFallbackRecordId(
  record: Omit<BibliographyRecord, 'id' | 'sourceRowIndex'>,
  occurrence: number
): string {
  const fingerprint = computeRecordContentFingerprint(record);
  return `record:${fingerprint}:${occurrence}`;
}
