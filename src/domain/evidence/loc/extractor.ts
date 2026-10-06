import { generateEvidenceId } from '../candidate';
import { LexicalEvidence } from '../types';
import { getFieldPolicy } from './fieldPolicy';
import { classifyPairScript, hasPersianLanguageEvidence } from './languageDetector';
import { resolveMarc880Linkages } from './linkage';
import { LocExtractorOptions, MarcRecord } from './types';

export const LOC_EXTRACTOR_VERSION = '1.0.0-loc-pilot';

/**
 * Extract source-neutral LexicalEvidence records from a parsed MARC record.
 *
 * Invariants:
 *   1. Requires positive record-level Persian language evidence (008, 041, 546).
 *   2. Extracts field/subfield pairs according to the explicit pilot whitelist.
 *   3. Resolves 880 linkage strictly by associated tag + occurrence number.
 *   4. Validates script direction (alternate field has Arabic/Persian script; regular has Latin).
 *   5. Preserves exact raw source observations without mutation, trimming, lowercase, or titlecase.
 *   6. Designates romanizationScheme as 'ALA_LC' with zero authoritative promotion.
 */
export function extractEvidenceFromMarcRecord(
  record: MarcRecord,
  options?: LocExtractorOptions
): LexicalEvidence[] {
  // 1. Language constraint: Record must exhibit Persian language evidence
  if (!hasPersianLanguageEvidence(record)) {
    return [];
  }

  const extractorVersion = options?.extractorVersion ?? LOC_EXTRACTOR_VERSION;
  const retrievedAt = options?.now ? options.now() : new Date().toISOString();
  const lccn = record.lccn ?? null;
  const sourceUri = record.sourceUri ?? (lccn ? `https://lccn.loc.gov/${lccn}` : null);

  const linkedPairs = resolveMarc880Linkages(record);
  const evidenceList: LexicalEvidence[] = [];

  for (const pair of linkedPairs) {
    // Only extract evidence from legitimate MATCHED pairs or conservative OCCURRENCE_00 representations
    if (pair.status !== 'MATCHED' && pair.status !== 'OCCURRENCE_00') {
      continue;
    }

    const associatedTag = pair.tag;
    const regField = pair.regularField;
    const altField = pair.alternateField;
    const linkageRaw = pair.linkage?.raw ?? `${associatedTag}-${pair.occurrenceNumber}`;

    // Iterate through supported subfields in the alternate graphic field
    for (const altSf of altField.subfields) {
      if (altSf.code === '6') continue; // Skip linkage subfield

      const policy = getFieldPolicy(associatedTag, altSf.code);
      if (!policy) {
        // Subfield is not in pilot whitelist
        continue;
      }

      // Find matching subfield in regular field (if linked)
      const regSf = regField?.subfields.find((sf) => sf.code === altSf.code);

      // Classify script direction
      const scriptResult = classifyPairScript(regSf?.value, altSf.value);
      if (!scriptResult.valid) {
        continue;
      }

      const persianForm = scriptResult.persian;
      const observedRomanization = scriptResult.roman;

      const sourceFieldLocator = regField
        ? `${associatedTag}$${altSf.code} ↔ 880[${linkageRaw}]$${altSf.code}`
        : `880[${linkageRaw}]$${altSf.code}`;

      const evidenceId = generateEvidenceId({
        sourceId: 'LOC',
        sourceRecordId: lccn,
        sourceField: sourceFieldLocator,
        persianForm,
        observedRomanization,
        romanizationScheme: 'ALA_LC'
      });

      const evidence: LexicalEvidence = {
        id: evidenceId,
        sourceType: 'LIBRARY_CATALOG',
        sourceRecordId: lccn,
        sourceUri,
        sourceField: sourceFieldLocator,
        persianForm,
        observedRomanization,
        romanizationScheme: 'ALA_LC',
        entityType: policy.entityType,
        context: lccn ? `LoC Record LCCN ${lccn} - ${policy.description}` : policy.description,
        provenance: {
          sourceId: 'LOC',
          sourceTitle: 'Library of Congress Catalog',
          sourceOrganization: 'Library of Congress',
          retrievalMethod: 'API',
          retrievedAt,
          extractorVersion,
          notes: `MARC 880 linkage: ${linkageRaw}`
        },
        status: 'OBSERVED'
      };

      evidenceList.push(evidence);
    }
  }

  return evidenceList;
}
