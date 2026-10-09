import { normalizePersian } from '../../../domain/normalization';
import { classifyScript, pairTitles } from './classification';
import { recordId, sha256 } from './identity';
import { ciniiResponseSchema } from './schema';
import type { CiniiEvidenceRecord, CiniiQueryConfig, RawTitleVariant, ScriptClassification } from './types';

function strings(value: unknown): string[] { if (typeof value === 'string') return [value]; if (Array.isArray(value)) return value.flatMap(strings); if (value && typeof value === 'object') { const item = value as Record<string, unknown>; return strings(item['@value'] ?? item.value ?? item.name ?? item['@id']); } return []; }
function titles(value: unknown, field = 'title'): RawTitleVariant[] { const values = Array.isArray(value) ? value : [value]; return values.flatMap((entry) => { if (typeof entry === 'string') return entry.trim() ? [{ value: entry, sourceField: field }] : []; if (entry && typeof entry === 'object') { const item = entry as Record<string, unknown>; const text = item['@value'] ?? item.value; return typeof text === 'string' && text.trim() ? [{ value: text, language: typeof item['@language'] === 'string' ? item['@language'] : undefined, sourceField: field }] : []; } return []; }); }
function first(value: unknown): string | null { return strings(value).map((item) => item.trim()).find(Boolean) ?? null; }
function year(value: unknown): number | null { const match = first(value)?.match(/\b(1[0-9]{3}|20[0-9]{2})\b/u); return match ? Number(match[1]) : null; }
function sourceId(url: string): string { return url.match(/\/(?:crid|ncid)\/([^/?#]+)/u)?.[1] ?? url; }

export function parseCiniiItems(responseInput: unknown, query: CiniiQueryConfig, retrievedAt: string): CiniiEvidenceRecord[] {
  const response = ciniiResponseSchema.parse(responseInput);
  return response.items.map((raw) => {
    const sourceUrl = raw['@id']; const id = sourceId(sourceUrl); const rawTitles = titles(raw.title);
    if (rawTitles.length === 0) throw new Error(`CiNii record ${id} has no usable title.`);
    const pairing = pairTitles(rawTitles); const normalized = pairing.persianTitle ? normalizePersian(pairing.persianTitle).normalizedInput : null;
    const catalogLanguages = strings(raw['dc:language']);
    const classifications = rawTitles.map((title) => classifyScript(title.value));
    const scriptClassification: ScriptClassification = classifications.includes('MIXED_ARABIC_LATIN') ? 'MIXED_ARABIC_LATIN' : classifications.includes('PERSIAN_SCRIPT') ? 'PERSIAN_SCRIPT' : classifications.includes('ARABIC_SCRIPT_UNCERTAIN_LANGUAGE') ? 'ARABIC_SCRIPT_UNCERTAIN_LANGUAGE' : classifications.every((item) => item === 'LATIN_ONLY') ? 'LATIN_ONLY' : 'OTHER_SCRIPT';
    const isbns = [...new Set([...strings(raw['dcterms:hasPart']), ...strings(raw.isbn)].map((item) => item.replace(/^urn:isbn:/iu, '')).filter((item) => /[0-9X-]{10,17}/iu.test(item)))];
    const ncid = first(raw.ncid) ?? (sourceUrl.includes('/ncid/') ? id : null); const crid = sourceUrl.includes('/crid/') ? id : null;
    const checksum = sha256(raw); const originalSourceFields = Object.keys(raw).sort();
    const base = { schemaVersion: 'phase8d-cinii-evidence-v1' as const, datasetVersion: 'phase8d-cinii-pilot-v1' as const, recordId: recordId(id), sourceProvider: 'CINII_RESEARCH_OPENSEARCH_V2' as const, sourceRecordId: id, sourceUrl, retrievedAt, queryId: query.queryId, recordType: Array.isArray(raw['@type']) ? raw['@type'][0] ?? null : raw['@type'] ?? null, rawTitles, persianTitle: pairing.persianTitle, normalizedPersianTitle: normalized, observedRomanizations: pairing.romanizations.map((title) => ({ value: title.value, probableScheme: 'UNKNOWN' as const, sourceField: title.sourceField })), languageEvidence: { catalogLanguages, unicodeEvidence: [...new Set(classifications)], linguisticIdentity: pairing.persianTitle && (catalogLanguages.includes('fa') || scriptClassification === 'PERSIAN_SCRIPT') ? 'PERSIAN_SUPPORTED' as const : 'UNCERTAIN' as const }, scriptClassification, authors: strings(raw['dc:creator']), publicationMetadata: { publisher: first(raw['dc:publisher']), publicationYear: year(raw['prism:publicationDate']) }, identifiers: { crid, ncid, isbns }, pairingStatus: pairing.status, pairingEvidence: pairing.evidence, bibliographicIdentityStatus: 'UNIQUE_RECORD' as const, relatedRecordIds: [], reviewStatus: 'UNREVIEWED' as const, provenance: { endpoint: 'https://cir.nii.ac.jp/opensearch/v2/books' as const, officialDocumentation: 'https://support.nii.ac.jp/en/cir/r_opensearch', attribution: 'CiNii Research, National Institute of Informatics (NII)', licenseNote: 'Bibliographic evidence subject to NII usage regulations and third-party rights; not asserted as open-license scholarly gold.', originalSourceFields }, rawRecordChecksum: checksum };
    return { ...base, contentHash: sha256(base) };
  });
}
