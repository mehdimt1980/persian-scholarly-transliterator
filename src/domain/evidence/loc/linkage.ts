import {
  LinkedMarcFieldPair,
  MarcDataField,
  MarcRecord,
  ParsedSubfield6
} from './types';

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
 * Resolve all linked field pairs in a MARC record with full ambiguity and mismatch detection.
 *
 * Linkage semantics:
 *   1. MATCHED: Exactly one regular field (tag !== '880', $6 880-NN) and exactly one
 *      alternate field (tag === '880', $6 TTT-NN) share the same tag and nonzero occurrence.
 *   2. OCCURRENCE_00: Alternate field (tag === '880', $6 TTT-00) is an unlinked representation
 *      without a Roman-script counterpart.
 *   3. UNMATCHED_NONZERO: Nonzero alternate field lacks a corresponding regular field.
 *      (Does NOT produce lexical evidence).
 *   4. AMBIGUOUS_DUPLICATE: Multiple regular fields or multiple alternate fields claim the same
 *      tag and occurrence number. Fails closed without arbitrary pairing.
 *   5. MALFORMED_LINKAGE: Field 880 possesses a missing, unparseable, or invalid $6 subfield.
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

  // 1. Index regular fields by `${associatedTag}-${occurrenceNumber}` and detect duplicates
  const regularMap = new Map<string, MarcDataField[]>();

  for (const reg of regularFields) {
    const raw6 = getSubfield6(reg);
    if (!raw6) continue;
    const parsed6 = parseSubfield6(raw6);
    if (parsed6 && parsed6.linkingTag === '880') {
      const key = `${reg.tag}-${parsed6.occurrenceNumber}`;
      const existing = regularMap.get(key) ?? [];
      existing.push(reg);
      regularMap.set(key, existing);
    }
  }

  // 2. Count alternate 880 fields by `${linkingTag}-${occurrenceNumber}` to detect duplicate 880 targets
  const altCountMap = new Map<string, number>();
  for (const alt of alternate880Fields) {
    const raw6 = getSubfield6(alt);
    if (!raw6) continue;
    const parsed6 = parseSubfield6(raw6);
    if (parsed6 && parsed6.occurrenceNumber !== '00') {
      const key = `${parsed6.linkingTag}-${parsed6.occurrenceNumber}`;
      altCountMap.set(key, (altCountMap.get(key) ?? 0) + 1);
    }
  }

  const linkedPairs: LinkedMarcFieldPair[] = [];

  // 3. Resolve each alternate field
  for (const alt of alternate880Fields) {
    const raw6 = getSubfield6(alt);
    if (!raw6) {
      linkedPairs.push({
        tag: '880',
        regularField: undefined,
        alternateField: alt,
        occurrenceNumber: '??',
        status: 'MALFORMED_LINKAGE',
        diagnostic: 'Field 880 is missing subfield $6 linkage.'
      });
      continue;
    }

    const parsed6 = parseSubfield6(raw6);
    if (!parsed6) {
      linkedPairs.push({
        tag: '880',
        regularField: undefined,
        alternateField: alt,
        occurrenceNumber: '??',
        status: 'MALFORMED_LINKAGE',
        diagnostic: `Field 880 has malformed subfield $6: "${raw6}".`
      });
      continue;
    }

    const associatedTag = parsed6.linkingTag;
    const occurrence = parsed6.occurrenceNumber;

    if (occurrence === '00') {
      // Conservative occurrence 00 unlinked representation
      linkedPairs.push({
        tag: associatedTag,
        regularField: undefined,
        alternateField: alt,
        occurrenceNumber: '00',
        linkage: parsed6,
        status: 'OCCURRENCE_00'
      });
      continue;
    }

    const lookupKey = `${associatedTag}-${occurrence}`;
    const matchedRegulars = regularMap.get(lookupKey) ?? [];
    const altOccurrences = altCountMap.get(lookupKey) ?? 1;

    // Detect duplicate/ambiguous linkage
    if (matchedRegulars.length > 1 || altOccurrences > 1) {
      linkedPairs.push({
        tag: associatedTag,
        regularField: undefined,
        alternateField: alt,
        occurrenceNumber: occurrence,
        linkage: parsed6,
        status: 'AMBIGUOUS_DUPLICATE',
        diagnostic: `Ambiguous linkage: ${matchedRegulars.length} regular field(s) and ${altOccurrences} alternate 880 field(s) claim key "${lookupKey}".`
      });
      continue;
    }

    if (matchedRegulars.length === 1) {
      linkedPairs.push({
        tag: associatedTag,
        regularField: matchedRegulars[0],
        alternateField: alt,
        occurrenceNumber: occurrence,
        linkage: parsed6,
        status: 'MATCHED'
      });
    } else {
      // Nonzero occurrence without matching regular field
      linkedPairs.push({
        tag: associatedTag,
        regularField: undefined,
        alternateField: alt,
        occurrenceNumber: occurrence,
        linkage: parsed6,
        status: 'UNMATCHED_NONZERO',
        diagnostic: `No corresponding regular field ${associatedTag} found with $6 880-${occurrence}.`
      });
    }
  }

  return linkedPairs;
}
