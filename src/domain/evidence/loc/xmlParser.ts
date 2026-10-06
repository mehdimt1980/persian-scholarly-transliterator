import { MarcControlField, MarcDataField, MarcRecord, MarcSubfield } from './types';

/**
 * Decode XML predefined and numeric character entities.
 */
export function decodeXmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#([0-9]+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

/**
 * Parse a raw XML attribute value.
 */
function getAttribute(tagSnippet: string, attrName: string): string | undefined {
  const match = tagSnippet.match(new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? decodeXmlEntities(match[1]) : undefined;
}

/**
 * Parse a single `<record>...</record>` XML snippet into a structured `MarcRecord`.
 */
export function parseSingleMarcXmlRecord(recordXml: string): MarcRecord {
  let leader: string | undefined;
  const controlFields: MarcControlField[] = [];
  const dataFields: MarcDataField[] = [];

  // 1. Leader
  const leaderMatch = recordXml.match(/<leader[^>]*>([\s\S]*?)<\/leader>/i);
  if (leaderMatch) {
    leader = decodeXmlEntities(leaderMatch[1].trim());
  }

  // 2. Control fields
  const controlFieldRegex = /<controlfield\b([^>]*)>([\s\S]*?)<\/controlfield>/gi;
  let cfMatch: RegExpExecArray | null;
  while ((cfMatch = controlFieldRegex.exec(recordXml)) !== null) {
    const attrs = cfMatch[1];
    const rawVal = cfMatch[2];
    const tag = getAttribute(attrs, 'tag');
    if (tag) {
      controlFields.push({
        tag: tag.trim(),
        value: decodeXmlEntities(rawVal)
      });
    }
  }

  // 3. Data fields and subfields
  const dataFieldRegex = /<datafield\b([^>]*)>([\s\S]*?)<\/datafield>/gi;
  let dfMatch: RegExpExecArray | null;
  while ((dfMatch = dataFieldRegex.exec(recordXml)) !== null) {
    const attrs = dfMatch[1];
    const body = dfMatch[2];
    const tag = getAttribute(attrs, 'tag') ?? '';
    const ind1 = getAttribute(attrs, 'ind1') ?? ' ';
    const ind2 = getAttribute(attrs, 'ind2') ?? ' ';

    const subfields: MarcSubfield[] = [];
    const subfieldRegex = /<subfield\b([^>]*)>([\s\S]*?)<\/subfield>/gi;
    let sfMatch: RegExpExecArray | null;
    while ((sfMatch = subfieldRegex.exec(body)) !== null) {
      const sfAttrs = sfMatch[1];
      const sfVal = sfMatch[2];
      const code = getAttribute(sfAttrs, 'code') ?? '';
      subfields.push({
        code,
        value: decodeXmlEntities(sfVal)
      });
    }

    if (tag) {
      dataFields.push({
        tag: tag.trim(),
        ind1,
        ind2,
        subfields
      });
    }
  }

  // 4. Derive LCCN
  // MARC 010$a is the preferred LCCN field; fallback to 001 if valid
  let lccn: string | undefined;
  const df010 = dataFields.find((df) => df.tag === '010');
  const sf010a = df010?.subfields.find((sf) => sf.code === 'a')?.value?.trim();
  if (sf010a) {
    // Normalise LCCN by removing internal multiple spaces
    lccn = sf010a.replace(/\s+/g, '');
  } else {
    const cf001 = controlFields.find((cf) => cf.tag === '001')?.value?.trim();
    if (cf001 && /^\d+$/.test(cf001)) {
      lccn = cf001;
    }
  }

  // 5. Derive Language code from 008 (positions 35-37)
  let language: string | undefined;
  const cf008 = controlFields.find((cf) => cf.tag === '008')?.value;
  if (cf008 && cf008.length >= 38) {
    language = cf008.substring(35, 38).trim().toLowerCase();
  }

  return {
    leader,
    controlFields,
    dataFields,
    lccn,
    language,
    sourceUri: lccn ? `https://lccn.loc.gov/${lccn}` : undefined
  };
}

/**
 * Parse a MARCXML or SRU response string containing one or more `<record>` elements.
 */
export function parseMarcXml(xmlString: string): MarcRecord[] {
  if (!xmlString || typeof xmlString !== 'string') {
    return [];
  }

  // Match all <record ...> ... </record> blocks (case-insensitive, non-greedy)
  const recordRegex = /<record\b[^>]*>([\s\S]*?)<\/record>/gi;
  const records: MarcRecord[] = [];
  let match: RegExpExecArray | null;

  while ((match = recordRegex.exec(xmlString)) !== null) {
    const recordXml = match[0];
    records.push(parseSingleMarcXmlRecord(recordXml));
  }

  return records;
}
