import { normalizePersian } from '../../../domain/normalization';
import { sha256 } from '../cinii/identity';
import { lexicalCandidateSchema } from '../../lexical-evidence/schema';
import { LEXICAL_EVIDENCE_VERSION, type LexicalCandidate, type LexicalCandidateCategory, type ProviderEvidence } from '../../lexical-evidence/types';
import { fieldText, linkage } from './marcxml';
import type { MarcDataField, MarcRecord } from './types';

const hasArabic = (value: string): boolean => /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(value);
const hasLatin = (value: string): boolean => /[A-Za-zÀ-ž]/u.test(value);
const sf = (field: MarcDataField, code: string): string[] => field.subfields.filter((item) => item.code === code).map((item) => item.value);
const sourceUrl = (id: string): string => `${'https://bsb.alma.exlibrisgroup.com/view/sru/49BVB_BSB'}?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(`identifier=="${id}"`)}&maximumRecords=1&recordSchema=marcxml`;
const recordId = (record: MarcRecord): string => record.controlfields.find((item) => item.tag === '001')?.value ?? sha256(record.rawXml).slice(0, 20);
function pairFor(field: MarcDataField, fields: MarcDataField[]): MarcDataField | undefined { const link = linkage(field); if (!link) return undefined; if (field.tag === '880') return fields.find((item) => item.tag === link.tag && linkage(item)?.occurrence === link.occurrence); return fields.find((item) => item.tag === '880' && linkage(item)?.tag === field.tag && linkage(item)?.occurrence === link.occurrence); }
function ids(record: MarcRecord) { const values = record.datafields.filter((field) => field.tag === '035').flatMap((field) => sf(field, 'a')); return { crid: null, ncid: null, isbns: record.datafields.filter((field) => field.tag === '020').flatMap((field) => sf(field, 'a')), oclcs: values.flatMap((value) => /\(OCoLC\)(\d+)/u.exec(value)?.[1] ?? []) }; }

export function adaptBsbRecord(record: MarcRecord): LexicalCandidate[] {
  const id = recordId(record); const url = sourceUrl(id); const checksum = sha256(record.rawXml); const output: LexicalCandidate[] = [];
  const languageCodes = record.datafields.filter((field) => field.tag === '041').flatMap((field) => sf(field, 'a'));
  const fixedLanguage = record.controlfields.find((item) => item.tag === '008')?.value.slice(35, 38);
  if (![...languageCodes, fixedLanguage].includes('per')) return output;
  const sourceFields = record.datafields.filter((field) => ['100', '110', '245', '700', '710', '880'].includes(field.tag));
  for (const field of sourceFields) {
    const text = fieldText(field); if (!text || !hasArabic(text)) continue;
    const linked = pairFor(field, record.datafields); const effectiveTag = field.tag === '880' ? linkage(field)?.tag ?? '880' : field.tag;
    if (!['100', '110', '245', '700', '710'].includes(effectiveTag)) continue;
    const category: LexicalCandidateCategory = effectiveTag === '245' ? 'WORK_TITLE' : ['100', '700'].includes(effectiveTag) ? 'PERSON_NAME' : 'ORGANIZATION_NAME';
    const normalizedSearchForm = normalizePersian(text).normalizedInput; const contextualIdentity = `BSB_SRU_MARCXML:${id}:${effectiveTag}`; const linkedText = linked ? fieldText(linked) : '';
    const providerEvidence: ProviderEvidence[] = [{ provider: 'BSB_SRU_MARCXML', sourceRecordId: id, sourceUrl: url, sourceField: `${field.tag}$${field.subfields.map((item) => item.code).join('')}`, sourceChecksum: checksum, relationship: 'ORIGINAL_SCRIPT', linkedField: linked ? linked.tag : undefined, indicators: [field.ind1, field.ind2], subfields: field.subfields }];
    const variants: LexicalCandidate['observedLatinVariants'] = linkedText && hasLatin(linkedText) ? [{ value: linkedText, classification: 'ROMANIZATION_CANDIDATE', sourceField: linked?.tag ?? '', sourceRecordId: id }] : [];
    if (effectiveTag === '245') for (const variant of record.datafields.filter((item) => item.tag === '246').filter((item) => hasLatin(fieldText(item)))) variants.push({ value: fieldText(variant), classification: variant.ind2 === '1' ? 'TRANSLATED_TITLE' : 'UNDETERMINED_LATIN_VARIANT', sourceField: '246', sourceRecordId: id });
    if (variants[0]) providerEvidence.push({ provider: 'BSB_SRU_MARCXML', sourceRecordId: id, sourceUrl: url, sourceField: variants[0].sourceField, sourceChecksum: checksum, relationship: 'ROMANIZATION_CANDIDATE', linkedField: field.tag, indicators: linked ? [linked.ind1, linked.ind2] : undefined, subfields: linked?.subfields });
    for (const variant of record.datafields.filter((item) => item.tag === '246').filter((item) => hasLatin(fieldText(item)))) providerEvidence.push({ provider: 'BSB_SRU_MARCXML', sourceRecordId: id, sourceUrl: url, sourceField: '246', sourceChecksum: checksum, relationship: variant.ind2 === '1' ? 'TRANSLATED_TITLE' : 'UNCERTAIN_VARIANT', indicators: [variant.ind1, variant.ind2], subfields: variant.subfields });
    const base = { schemaVersion: LEXICAL_EVIDENCE_VERSION, candidateId: `lex-${sha256({ normalizedSearchForm, category, contextualIdentity }).slice(0, 20)}`, originalPersianForm: text, normalizedSearchForm, category, contextualIdentity, linguisticContext: { kind: effectiveTag === '245' ? 'BIBLIOGRAPHIC_TITLE' as const : 'CREATOR_FIELD' as const, fullText: text, uncertainEntityType: false }, sourceRecordIds: [id], sourceUrls: [url], fieldProvenance: [{ sourceRecordId: id, sourceUrl: url, sourceField: effectiveTag === '245' ? 'title' as const : 'dc:creator' as const, observedForm: text, evidenceStatus: 'OBSERVED' as const }], providerEvidence, observedLatinVariants: variants, bibliographicIdentities: [{ recordId: id, identityStatus: 'UNIQUE_RECORD' as const, ...ids(record) }], evidenceCount: 1, distinctSourceCount: 1, reviewStatus: 'UNREVIEWED' as const, authorityStatus: 'NON_AUTHORITATIVE_CANDIDATE' as const, evidenceStatus: 'CANDIDATE' as const, extractionMethod: 'WHOLE_BIBLIOGRAPHIC_FIELD' as const, extractionVersion: 'phase8f-bsb-v1' as const };
    output.push(lexicalCandidateSchema.parse({ ...base, contentHash: sha256(base) }));
  }
  return output;
}
