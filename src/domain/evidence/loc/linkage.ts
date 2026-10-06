import { LinkedMarcFieldPair, MarcDataField, MarcRecord, ParsedSubfield6 } from './types';

/**
 * Parse MARC Subfield $6 linkage value.
 *
 * MARC $6 format:
 *   tag-occurrenceNumber[/(scriptIdentificationCode)/(orientationCode)]
 *
 * Examples:
 *   - '880-01'           -> linkingTag: '880', occurrenceNumber: '01'
 *   - '100-01/(3/r'      -> linkingTag: '100', occurrenceNumber: '01', scriptCode: '3', orientationCode: 'r'
 *   - '245-03/(3/r'      -> linkingTag: '245', occurrenceNumber: '03', scriptCode: '3', orientationCode: 'r'
 *   - '700-70'           -> linkingTag: '700', occurrenceNumber: '70'
 *   - '245-00/(3/r'      -> linkingTag: '245', occurrenceNumber: '00', scriptCode: '3', orientationCode: 'r'
 */
export function parseSubfield6(value: string): ParsedSubfield6 | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();

  // Pattern: tag (3 digits), hyphen, occurrence (2 digits or more), optional slash and params
  const match = trimmed.match(/^(\d{3})-(\d{2,3})(?:\/([^/]+)(?:\/([^/]+))?)?$/);
  if (!match) return null;

  const linkingTag = match[1];
  const occurrenceNumber = match[2];
  const scriptCode = match[3] ? match[3].replace(/^\(/, '') : undefined;
  const orientationCode = match[4];

  return {
    linkingTag,
    occurrenceNumber,
    scriptCode,
    orientationCode,
    raw: trimmed
  };
}

/**
 * Extract subfield $6 from a MARC datafield.
 */
export function getSubfield6(field: MarcDataField): string | undefined {
  return field.subfields.find((sf) => sf.code === '6')?.value?.trim();
}

/**
 * Resolve all linked field pairs in a MARC record.
 *
 * MARC 880 linkage invariants:
 *   1. A regular datafield (tag !== '880') specifies `$6 880-NN`.
 *   2. The corresponding alternate graphic datafield (tag === '880') specifies `$6 TTT-NN`
 *      where TTT equals the regular field tag, and NN is the identical occurrence number.
 *   3. Fields are linked STRICTLY by (associatedTag + occurrenceNumber). They are never
 *      linked by array proximity or line order.
 *   4. Occurrence '00' on an 880 field indicates an unlinked alternate graphic field with
 *      no corresponding regular Roman-script field.
 */
export function resolveMarc880Linkages(record: MarcRecord): LinkedMarcFieldPair[] {
  const regularFields: MarcDataField[] = [];
  const alternate880Fields: MarcDataField[] = [];

  for (const df of record.dataFields) {
    if (df.tag === '880') {
      alternate880Fields.push(df);
    } else {
      regularFields.push(df);
    }
  }

  // Index regular fields by `880-${occurrenceNumber}`
  // Map key: `${df.tag}-${occurrenceNumber}`
  const regularIndex = new Map<string, MarcDataField>();

  for (const reg of regularFields) {
    const raw6 = getSubfield6(reg);
    if (!raw6) continue;
    const parsed6 = parseSubfield6(raw6);
    if (parsed6 && parsed6.linkingTag === '880') {
      // Keyed by associated tag and occurrence number: e.g. "245-02"
      const key = `${reg.tag}-${parsed6.occurrenceNumber}`;
      regularIndex.set(key, reg);
    }
  }

  const linkedPairs: LinkedMarcFieldPair[] = [];

  for (const alt of alternate880Fields) {
    const raw6 = getSubfield6(alt);
    if (!raw6) continue;
    const parsed6 = parseSubfield6(raw6);
    if (!parsed6) continue;

    const associatedTag = parsed6.linkingTag;
    const occurrence = parsed6.occurrenceNumber;

    if (occurrence === '00') {
      // Occurrence 00: Unlinked alternate graphic representation
      linkedPairs.push({
        tag: associatedTag,
        regularField: undefined,
        alternateField: alt,
        occurrenceNumber: '00',
        linkage: parsed6
      });
      continue;
    }

    const lookupKey = `${associatedTag}-${occurrence}`;
    const matchedRegular = regularIndex.get(lookupKey);

    // Only pair if regular field exists with exact matching associated tag and occurrence number
    if (matchedRegular) {
      linkedPairs.push({
        tag: associatedTag,
        regularField: matchedRegular,
        alternateField: alt,
        occurrenceNumber: occurrence,
        linkage: parsed6
      });
    } else {
      // Unmatched or orphaned 880 field (occurrence mismatch or missing regular counterpart)
      linkedPairs.push({
        tag: associatedTag,
        regularField: undefined,
        alternateField: alt,
        occurrenceNumber: occurrence,
        linkage: parsed6
      });
    }
  }

  return linkedPairs;
}
