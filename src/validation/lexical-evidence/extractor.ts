import { normalizePersian } from '../../domain/normalization';
import { classifyScript } from '../acquisition/cinii/classification';
import { sha256 } from '../acquisition/cinii/identity';
import type { CiniiEvidenceRecord } from '../acquisition/cinii/types';
import { lexicalCandidateSchema } from './schema';
import { LEXICAL_EVIDENCE_VERSION, type LexicalCandidate, type LexicalCandidateCategory, type LexicalSourceCitation } from './types';

function primaryIdentity(record: CiniiEvidenceRecord): string { return record.identifiers.ncid ? `ncid:${record.identifiers.ncid}` : record.identifiers.isbns[0] ? `isbn:${record.identifiers.isbns[0]}` : record.identifiers.oclcs[0] ? `oclc:${record.identifiers.oclcs[0]}` : record.identifiers.crid ? `crid:${record.identifiers.crid}` : `record:${record.recordId}`; }
function hasConflict(candidate: Pick<LexicalCandidate, 'observedLatinVariants'>): boolean { const classifications = new Map<string, Set<string>>(); for (const variant of candidate.observedLatinVariants) { const set = classifications.get(variant.value) ?? new Set<string>(); set.add(variant.classification); classifications.set(variant.value, set); } return [...classifications.values()].some((set) => set.size > 1); }

function makeCandidate(record: CiniiEvidenceRecord, form: string, category: LexicalCandidateCategory, field: 'title' | 'dc:creator', uncertainEntityType: boolean): LexicalCandidate {
  const normalizedSearchForm = normalizePersian(form).normalizedInput; const contextualIdentity = `${field}:${primaryIdentity(record)}`;
  const citation: LexicalSourceCitation = { sourceRecordId: record.sourceRecordId, sourceUrl: record.sourceUrl, sourceField: field, observedForm: form, evidenceStatus: 'OBSERVED' };
  const base = { schemaVersion: LEXICAL_EVIDENCE_VERSION, candidateId: `lex-${sha256({ normalizedSearchForm, category, contextualIdentity }).slice(0, 20)}`, originalPersianForm: form, normalizedSearchForm, category, contextualIdentity, linguisticContext: { kind: field === 'title' ? 'BIBLIOGRAPHIC_TITLE' as const : 'CREATOR_FIELD' as const, fullText: record.persianTitle ?? form, uncertainEntityType }, sourceRecordIds: [record.sourceRecordId], sourceUrls: [record.sourceUrl], fieldProvenance: [citation], observedLatinVariants: field === 'title' ? record.latinTitleVariants.map((variant) => ({ value: variant.value, classification: variant.classification, sourceField: variant.sourceField, sourceRecordId: record.sourceRecordId })) : [], bibliographicIdentities: [{ recordId: record.recordId, identityStatus: record.bibliographicIdentityStatus, ...record.identifiers }], evidenceCount: 1, distinctSourceCount: 1, reviewStatus: 'UNREVIEWED' as const, authorityStatus: 'NON_AUTHORITATIVE_CANDIDATE' as const, evidenceStatus: 'CANDIDATE' as const, extractionMethod: 'WHOLE_BIBLIOGRAPHIC_FIELD' as const, extractionVersion: 'phase8e-v1' as const };
  return lexicalCandidateSchema.parse({ ...base, contentHash: sha256(base) });
}

export function extractLexicalCandidates(records: CiniiEvidenceRecord[]): LexicalCandidate[] {
  const extracted: LexicalCandidate[] = [];
  for (const record of records) {
    if (!record.persianTitle || record.languageEvidence.assessment !== 'POSITIVE_PERSIAN_EVIDENCE') continue;
    extracted.push(makeCandidate(record, record.persianTitle, 'WORK_TITLE', 'title', false));
    for (const creator of record.authors) if (['PERSIAN_SCRIPT', 'ARABIC_SCRIPT_UNCERTAIN_LANGUAGE'].includes(classifyScript(creator))) extracted.push(makeCandidate(record, creator, 'UNCLASSIFIED_CANDIDATE', 'dc:creator', true));
  }
  const grouped = new Map<string, LexicalCandidate[]>(); for (const candidate of extracted) grouped.set(candidate.candidateId, [...(grouped.get(candidate.candidateId) ?? []), candidate]);
  return [...grouped.values()].map((group) => {
    const first = group[0]; const sourceRecordIds = [...new Set(group.flatMap((item) => item.sourceRecordIds))].sort(); const sourceUrls = [...new Set(group.flatMap((item) => item.sourceUrls))].sort();
    const fieldProvenance = [...new Map(group.flatMap((item) => item.fieldProvenance).map((item) => [`${item.sourceRecordId}:${item.sourceField}:${item.observedForm}`, item])).values()];
    const observedLatinVariants = [...new Map(group.flatMap((item) => item.observedLatinVariants).map((item) => [`${item.sourceRecordId}:${item.value}:${item.classification}`, item])).values()];
    const bibliographicIdentities = [...new Map(group.flatMap((item) => item.bibliographicIdentities).map((item) => [item.recordId, item])).values()];
    const updated = { ...first, sourceRecordIds, sourceUrls, fieldProvenance, observedLatinVariants, bibliographicIdentities, evidenceCount: fieldProvenance.length, distinctSourceCount: sourceRecordIds.length, evidenceStatus: hasConflict({ observedLatinVariants }) ? 'CONFLICTING' as const : 'CANDIDATE' as const };
    return lexicalCandidateSchema.parse({ ...updated, contentHash: sha256({ ...updated, contentHash: undefined }) });
  }).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
}
