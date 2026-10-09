import type { MarcDataField, MarcRecord, SruPage } from './types';

const decode = (value: string): string => value.replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&apos;/gu, "'").replace(/&amp;/gu, '&').replace(/&#(x[0-9a-f]+|\d+);/giu, (_, code: string) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10)));
const attr = (text: string, name: string): string => decode(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'u').exec(text)?.[1] ?? ' ');
const textOf = (xml: string, localName: string): string => decode(new RegExp(`<(?:[\\w.-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${localName}>`, 'u').exec(xml)?.[1]?.replace(/<[^>]+>/gu, '') ?? '').trim();

export function parseMarcRecord(xml: string): MarcRecord {
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/iu.test(xml)) throw new Error('Unsafe XML declaration rejected');
  const controlfields = [...xml.matchAll(/<(?:[\w.-]+:)?controlfield\s+([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?controlfield>/gu)].map((match) => ({ tag: attr(match[1], 'tag'), value: decode(match[2].replace(/<[^>]+>/gu, '')).trim() }));
  const datafields: MarcDataField[] = [...xml.matchAll(/<(?:[\w.-]+:)?datafield\s+([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?datafield>/gu)].map((match) => ({ tag: attr(match[1], 'tag'), ind1: attr(match[1], 'ind1'), ind2: attr(match[1], 'ind2'), subfields: [...match[2].matchAll(/<(?:[\w.-]+:)?subfield\s+([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?subfield>/gu)].map((sub) => ({ code: attr(sub[1], 'code'), value: decode(sub[2].replace(/<[^>]+>/gu, '')).trim() })) }));
  return { leader: textOf(xml, 'leader'), controlfields, datafields, rawXml: xml };
}

export function parseSruMarcXml(xml: string): SruPage {
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/iu.test(xml)) throw new Error('Unsafe XML declaration rejected');
  const records = [...xml.matchAll(/<recordData(?:\s[^>]*)?>([\s\S]*?)<\/recordData>/gu)].map((match) => { const marc = /<((?:[\w.-]+:)?record)(?:\s[^>]*)?>[\s\S]*?<\/\1>/u.exec(match[1]); if (!marc) throw new Error('recordData does not contain MARCXML record'); return parseMarcRecord(marc[0]); });
  const next = textOf(xml, 'nextRecordPosition');
  return { version: textOf(xml, 'version'), numberOfRecords: Number(textOf(xml, 'numberOfRecords')), nextRecordPosition: next ? Number(next) : null, records };
}

export const fieldText = (field: MarcDataField): string => field.subfields.filter((sub) => ['a', 'b', 'n', 'p'].includes(sub.code)).map((sub) => sub.value).join(' ').replace(/\s+/gu, ' ').trim();
export const linkage = (field: MarcDataField): { tag: string; occurrence: string } | null => { const value = field.subfields.find((sub) => sub.code === '6')?.value; const match = /^(\d{3})-(\d{2})/u.exec(value ?? ''); return match ? { tag: match[1], occurrence: match[2] } : null; };
