import { normalizePersian } from '../../../domain/normalization';
import { classifyScript, pairTitles } from './classification';
import { recordId, sha256 } from './identity';
import { ciniiResponseSchema } from './schema';
import type { CiniiEvidenceRecord, CiniiQueryConfig, RawTitleVariant, ScriptClassification } from './types';

function strings(value: unknown): string[] { if (typeof value === 'string') return [value]; if (Array.isArray(value)) return value.flatMap(strings); if (value && typeof value === 'object') { const item = value as Record<string, unknown>; return strings(item['@value'] ?? item.value ?? item.name ?? item['@id']); } return []; }
function titles(value: unknown, field = 'title'): RawTitleVariant[] { const values = Array.isArray(value) ? value : [value]; return values.flatMap((entry) => { if (typeof entry === 'string') return entry.trim() ? [{ value: entry, sourceField: field }] : []; if (entry && typeof entry === 'object') { const item = entry as Record<string, unknown>; const text = item['@value'] ?? item.value; const relationship = item.relationship ?? item['@type']; const explicitRelationship = relationship === 'ROMANIZATION' || relationship === 'RomanizedTitle' ? 'ROMANIZATION' as const : relationship === 'TRANSLATION' || relationship === 'TranslatedTitle' ? 'TRANSLATION' as const : undefined; return typeof text === 'string' && text.trim() ? [{ value: text, language: typeof item['@language'] === 'string' ? item['@language'] : undefined, sourceField: field, ...(explicitRelationship ? { explicitRelationship } : {}) }] : []; } return []; }); }
function first(value: unknown): string | null { return strings(value).map((item) => item.trim()).find(Boolean) ?? null; }
function year(value: unknown): number | null { const match = first(value)?.match(/\b(1[0-9]{3}|20[0-9]{2})\b/u); return match ? Number(match[1]) : null; }
function sourceId(url: string): string { return url.match(/\/(?:crid|ncid)\/([^/?#]+)/u)?.[1] ?? url; }
function isbn(value: string): string | null { const normalized = value.replace(/^urn:isbn:/iu, '').replace(/[-\s]/gu, '').toUpperCase(); return /^(?:\d{9}[\dX]|\d{13})$/u.test(normalized) ? normalized : null; }
function urls(value: unknown): string[] { return strings(value).filter((item) => { try { const url = new URL(item); return url.protocol === 'https:' || url.protocol === 'http:'; } catch { return false; } }); }
function worldcatReferences(raw: Record<string, unknown>): CiniiEvidenceRecord['crossCatalogReferences'] {
  const references: CiniiEvidenceRecord['crossCatalogReferences'] = [];
  for (const sourceField of ['link', 'rdfs:seeAlso', 'dc:identifier'] as const) {
    for (const value of urls(raw[sourceField])) {
      const url = new URL(value); if (!/(^|\.)worldcat\.org$/iu.test(url.hostname)) continue;
      const match = url.pathname.match(/\/oclc\/(\d{5,})\b/iu); references.push({ catalog: 'WORLDCAT', oclc: match?.[1] ?? null, url: url.toString(), sourceField, relationship: 'CROSS_CATALOG_LINK_UNVERIFIED' });
    }
  }
  return [...new Map(references.map((reference) => [`${reference.sourceField}:${reference.url}`, reference])).values()];
}

export function parseCiniiItems(responseInput: unknown, query: CiniiQueryConfig, retrievedAt: string): CiniiEvidenceRecord[] {
  const response = ciniiResponseSchema.parse(responseInput);
  return response.items.map((raw) => {
    const sourceUrl = raw['@id']; const id = sourceId(sourceUrl); const rawTitles = titles(raw.title);
    if (rawTitles.length === 0) throw new Error(`CiNii record ${id} has no usable title.`);
    const catalogLanguages = strings(raw['dc:language']);
    const pairing = pairTitles(rawTitles, catalogLanguages); const normalized = pairing.persianTitle ? normalizePersian(pairing.persianTitle).normalizedInput : null;
    const classifications = rawTitles.map((title) => classifyScript(title.value));
    const scriptClassification: ScriptClassification = classifications.includes('MIXED_ARABIC_LATIN') ? 'MIXED_ARABIC_LATIN' : classifications.includes('PERSIAN_SCRIPT') ? 'PERSIAN_SCRIPT' : classifications.includes('ARABIC_SCRIPT_UNCERTAIN_LANGUAGE') ? 'ARABIC_SCRIPT_UNCERTAIN_LANGUAGE' : classifications.every((item) => item === 'LATIN_ONLY') ? 'LATIN_ONLY' : 'OTHER_SCRIPT';
    const isbns = [...new Set([...strings(raw['dcterms:hasPart']), ...strings(raw.isbn)].flatMap((item) => { const parsed = isbn(item); return parsed ? [parsed] : []; }))];
    const ncidCandidate = first(raw.ncid) ?? (sourceUrl.includes('/ncid/') ? id : null); const ncid = ncidCandidate && /^[A-Z]{2}\d{8}$/u.test(ncidCandidate) ? ncidCandidate : null; const crid = sourceUrl.includes('/crid/') && /^[A-Za-z0-9._~-]+$/u.test(id) ? id : null;
    const crossCatalogReferences = worldcatReferences(raw); const oclcs = [...new Set(crossCatalogReferences.flatMap((reference) => reference.oclc ? [reference.oclc] : []))];
    const checksum = sha256(raw); const originalSourceFields = Object.keys(raw).sort();
    const latinTitleVariants = pairing.latinVariants.map((title) => ({ value: title.value, classification: title.classification, probableScheme: 'UNKNOWN' as const, sourceField: title.sourceField }));
    const observedRomanizations = latinTitleVariants.filter((title) => title.classification === 'ROMANIZATION_CANDIDATE').map(({ value, probableScheme, sourceField }) => ({ value, probableScheme, sourceField }));
    const titleLanguages = rawTitles.flatMap((title) => title.language ? [title.language] : []);
    const base = { schemaVersion: 'phase8d-cinii-evidence-v1' as const, datasetVersion: 'phase8d-cinii-pilot-v1' as const, recordId: recordId(id), sourceProvider: 'CINII_RESEARCH_OPENSEARCH_V2' as const, sourceRecordId: id, sourceUrl, retrievedAt, queryId: query.queryId, recordType: Array.isArray(raw['@type']) ? raw['@type'][0] ?? null : raw['@type'] ?? null, rawTitles, persianTitle: pairing.persianTitle, normalizedPersianTitle: normalized, observedRomanizations, latinTitleVariants, languageEvidence: { catalogLanguages, titleLanguages, unicodeEvidence: [...new Set(classifications)], assessment: pairing.languageAssessment, linguisticIdentity: pairing.persianTitle && pairing.languageAssessment === 'POSITIVE_PERSIAN_EVIDENCE' ? 'PERSIAN_SUPPORTED' as const : 'UNCERTAIN' as const }, scriptClassification, authors: strings(raw['dc:creator']), publicationMetadata: { publisher: first(raw['dc:publisher']), publicationYear: year(raw['prism:publicationDate']) }, identifiers: { crid, ncid, isbns, oclcs }, crossCatalogReferences, pairingStatus: pairing.status, pairingEvidence: pairing.evidence, bibliographicIdentityStatus: 'UNIQUE_RECORD' as const, relatedRecordIds: [], reviewStatus: 'UNREVIEWED' as const, provenance: { endpoint: 'https://cir.nii.ac.jp/opensearch/v2/books' as const, officialDocumentation: 'https://support.nii.ac.jp/en/cir/r_opensearch', attribution: 'CiNii Research, National Institute of Informatics (NII)', licenseNote: 'Bibliographic evidence subject to NII usage regulations and third-party rights; not asserted as open-license scholarly gold.', originalSourceFields }, rawRecordChecksum: checksum };
    return { ...base, contentHash: sha256(base) };
  });
}
