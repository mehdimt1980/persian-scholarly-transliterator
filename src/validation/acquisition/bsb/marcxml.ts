import { SaxesParser, type SaxesTagNS } from 'saxes';
import type { MarcDataField, MarcRecord, SruDiagnostic, SruPage } from './types';

const MARC_NS = 'http://www.loc.gov/MARC21/slim';
const SRU_NS = 'http://www.loc.gov/zing/srw/';
export const XML_LIMITS = { maxBytes: 5_000_000, maxDepth: 32, maxElements: 100_000, maxTextLength: 1_000_000, maxRecords: 50, maxFieldsPerRecord: 2_000, maxSubfieldsPerField: 500 } as const;
type ElementFrame = { local: string; uri: string; text: string };
type MutableRecord = Omit<MarcRecord, 'rawXml'>;
const clean = (value: string): string => value.trim();
const escapeXml = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const attribute = (tag: SaxesTagNS, name: string): string | undefined => Object.values(tag.attributes).find((item) => item.local === name && item.uri === '')?.value;
const canonicalRecordXml = (record: MutableRecord): string => `<record xmlns="${MARC_NS}"><leader>${escapeXml(record.leader)}</leader>${record.controlfields.map((field) => `<controlfield tag="${escapeXml(field.tag)}">${escapeXml(field.value)}</controlfield>`).join('')}${record.datafields.map((field) => `<datafield tag="${escapeXml(field.tag)}" ind1="${escapeXml(field.ind1)}" ind2="${escapeXml(field.ind2)}">${field.subfields.map((subfield) => `<subfield code="${escapeXml(subfield.code)}">${escapeXml(subfield.value)}</subfield>`).join('')}</datafield>`).join('')}</record>`;

function parse(xml: string, mode: 'SRU' | 'MARC_COLLECTION' | 'MARC_RECORD') {
  if (Buffer.byteLength(xml, 'utf8') > XML_LIMITS.maxBytes) throw new Error(`XML exceeds ${XML_LIMITS.maxBytes}-byte limit`);
  let depth = 0; let elements = 0; let root: { local: string; uri: string } | null = null; let currentRecord: MutableRecord | null = null; let currentField: MarcDataField | null = null; let currentControl: { tag: string; value: string } | null = null; let inRecordData = false;
  let version = ''; let numberOfRecords: number | null = null; let nextRecordPosition: number | null = null; const positions: number[] = []; const records: MarcRecord[] = []; const diagnostics: SruDiagnostic[] = []; const stack: ElementFrame[] = []; let diagnostic: Partial<SruDiagnostic> | null = null;
  const parser = new SaxesParser({ xmlns: true, fragment: false });
  parser.on('doctype', () => { throw new Error('DTD is forbidden'); });
  parser.on('processinginstruction', (instruction) => { if (instruction.target.toLowerCase() !== 'xml') throw new Error('Processing instructions are forbidden'); });
  parser.on('opentag', (tag) => {
    depth += 1; elements += 1; if (depth > XML_LIMITS.maxDepth) throw new Error('XML depth limit exceeded'); if (elements > XML_LIMITS.maxElements) throw new Error('XML element limit exceeded');
    if (!root) { root = { local: tag.local, uri: tag.uri }; const expected = mode === 'SRU' ? { local: 'searchRetrieveResponse', uri: SRU_NS } : mode === 'MARC_COLLECTION' ? { local: 'collection', uri: MARC_NS } : { local: 'record', uri: MARC_NS }; if (root.local !== expected.local || root.uri !== expected.uri) throw new Error(`Unexpected XML root {${root.uri}}${root.local}`); }
    const parent = stack.at(-1); stack.push({ local: tag.local, uri: tag.uri, text: '' });
    if (mode === 'SRU' && tag.local === 'recordData' && tag.uri === SRU_NS) inRecordData = true;
    if (currentRecord && tag.uri !== MARC_NS) throw new Error('Foreign namespace inside MARC record');
    if (currentRecord && tag.uri === MARC_NS) { const allowed = parent?.local === 'record' ? ['leader', 'controlfield', 'datafield'] : parent?.local === 'datafield' ? ['subfield'] : []; if (!allowed.includes(tag.local)) throw new Error(`Unexpected MARC element ${tag.local}`); }
    if (tag.local === 'record' && tag.uri === MARC_NS) { if (mode === 'SRU' && !inRecordData) throw new Error('MARC record outside SRU recordData'); if (currentRecord) throw new Error('Nested MARC record'); currentRecord = { namespaceUri: tag.uri, leader: '', controlfields: [], datafields: [] }; }
    if (currentRecord && tag.local === 'controlfield' && tag.uri === MARC_NS) { if (parent?.local !== 'record') throw new Error('controlfield outside MARC record'); if (currentRecord.datafields.length + currentRecord.controlfields.length >= XML_LIMITS.maxFieldsPerRecord) throw new Error('MARC field limit exceeded'); const fieldTag = attribute(tag, 'tag'); if (!fieldTag) throw new Error('MARC controlfield missing tag'); currentControl = { tag: fieldTag, value: '' }; }
    if (currentRecord && tag.local === 'datafield' && tag.uri === MARC_NS) { if (parent?.local !== 'record') throw new Error('datafield outside MARC record'); if (currentRecord.datafields.length + currentRecord.controlfields.length >= XML_LIMITS.maxFieldsPerRecord) throw new Error('MARC field limit exceeded'); const fieldTag = attribute(tag, 'tag'); const ind1 = attribute(tag, 'ind1'); const ind2 = attribute(tag, 'ind2'); if (!fieldTag || ind1 === undefined || ind2 === undefined || ind1.length !== 1 || ind2.length !== 1) throw new Error('Invalid MARC datafield attributes'); currentField = { namespaceUri: tag.uri, tag: fieldTag, ind1, ind2, subfields: [] }; }
    if (currentField && tag.local === 'subfield' && tag.uri === MARC_NS) { if (parent?.local !== 'datafield') throw new Error('subfield outside MARC datafield'); if (currentField.subfields.length >= XML_LIMITS.maxSubfieldsPerField) throw new Error('MARC subfield limit exceeded'); const code = attribute(tag, 'code'); if (!code || code.length !== 1) throw new Error('Invalid MARC subfield code'); currentField.subfields.push({ namespaceUri: tag.uri, code, value: '' }); }
    if (mode === 'SRU' && tag.local === 'diagnostic' && /diagnostic/u.test(tag.uri)) diagnostic = {};
  });
  parser.on('text', (text) => { const frame = stack.at(-1); if (!frame) return; frame.text += text; if (frame.text.length > XML_LIMITS.maxTextLength) throw new Error('XML text limit exceeded'); });
  parser.on('cdata', (text) => { const frame = stack.at(-1); if (!frame) return; frame.text += text; if (frame.text.length > XML_LIMITS.maxTextLength) throw new Error('XML text limit exceeded'); });
  parser.on('closetag', (tag) => {
    const frame = stack.pop(); if (!frame || frame.local !== tag.local || frame.uri !== tag.uri) throw new Error('Malformed XML element stack'); const value = clean(frame.text); const parent = stack.at(-1); if (parent) parent.text += frame.text;
    if (currentRecord && tag.uri === MARC_NS && tag.local === 'leader') currentRecord.leader = value;
    if (currentControl && tag.uri === MARC_NS && tag.local === 'controlfield') { currentControl.value = value; currentRecord?.controlfields.push(currentControl); currentControl = null; }
    if (currentField && tag.uri === MARC_NS && tag.local === 'subfield') currentField.subfields.at(-1)!.value = value;
    if (currentField && tag.uri === MARC_NS && tag.local === 'datafield') { currentRecord?.datafields.push(currentField); currentField = null; }
    if (currentRecord && tag.uri === MARC_NS && tag.local === 'record') { if (!currentRecord.controlfields.some((field) => field.tag === '001')) throw new Error('MARC record missing 001'); const finalized = { ...currentRecord, rawXml: canonicalRecordXml(currentRecord) }; records.push(finalized); if (records.length > XML_LIMITS.maxRecords) throw new Error('MARC record limit exceeded'); currentRecord = null; }
    if (mode === 'SRU' && tag.uri === SRU_NS) { if (tag.local === 'version') version = value; if (tag.local === 'numberOfRecords') numberOfRecords = strictInteger(value, 'numberOfRecords', 0); if (tag.local === 'nextRecordPosition') nextRecordPosition = strictInteger(value, 'nextRecordPosition', 1); if (tag.local === 'recordPosition') positions.push(strictInteger(value, 'recordPosition', 1)); if (tag.local === 'recordData') inRecordData = false; }
    if (diagnostic && /diagnostic/u.test(tag.uri)) { if (tag.local === 'uri') diagnostic.uri = value; if (tag.local === 'message') diagnostic.message = value; if (tag.local === 'details') diagnostic.details = value; if (tag.local === 'diagnostic') { if (!diagnostic.uri || !diagnostic.message) throw new Error('Malformed SRU diagnostic'); diagnostics.push({ uri: diagnostic.uri, message: diagnostic.message, details: diagnostic.details ?? '' }); diagnostic = null; } }
    depth -= 1;
  });
  parser.write(xml).close();
  if (stack.length || currentRecord || currentField || currentControl) throw new Error('Incomplete XML document');
  if (mode === 'SRU') { if (version !== '1.2') throw new Error(`Unsupported SRU version: ${version || 'missing'}`); if (numberOfRecords === null) throw new Error('SRU numberOfRecords is missing'); if (!diagnostics.length) { if (positions.length !== records.length) throw new Error('SRU recordPosition count does not match records'); if (records.length > numberOfRecords) throw new Error('SRU page contains more records than numberOfRecords'); for (let index = 1; index < positions.length; index += 1) if (positions[index] !== positions[index - 1] + 1) throw new Error('SRU record positions are not contiguous'); if (nextRecordPosition !== null && positions.length && nextRecordPosition !== positions.at(-1)! + 1) throw new Error('Invalid SRU nextRecordPosition'); } }
  return { records, version, numberOfRecords, nextRecordPosition, positions, diagnostics };
}

function strictInteger(value: string, name: string, minimum: number): number { if (!/^\d+$/u.test(value)) throw new Error(`Invalid SRU ${name}`); const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new Error(`Invalid SRU ${name}`); return parsed; }
export function parseMarcRecord(xml: string): MarcRecord { const result = parse(xml, 'MARC_RECORD'); if (result.records.length !== 1) throw new Error('Expected exactly one MARC record'); return result.records[0]; }
export function parseMarcCollection(xml: string): MarcRecord[] { return parse(xml, 'MARC_COLLECTION').records; }
export function parseSruMarcXml(xml: string): SruPage { const result = parse(xml, 'SRU'); return { version: result.version, numberOfRecords: result.numberOfRecords!, nextRecordPosition: result.nextRecordPosition, recordPositions: result.positions, records: result.records, diagnostics: result.diagnostics }; }
export const fieldText = (field: MarcDataField): string => field.subfields.filter((sub) => ['a', 'b', 'n', 'p'].includes(sub.code)).map((sub) => sub.value).join(' ').replace(/\s+/gu, ' ').trim();
export const linkage = (field: MarcDataField): { tag: string; occurrence: string } | null => { const value = field.subfields.find((sub) => sub.code === '6')?.value; const match = /^(\d{3})-(\d{2})/u.exec(value ?? ''); return match ? { tag: match[1], occurrence: match[2] } : null; };
