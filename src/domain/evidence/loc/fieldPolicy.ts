import { LexicalEntityType } from '../types';

export interface SupportedFieldSubfield {
  tag: string;
  subfieldCode: string;
  entityType: LexicalEntityType;
  description: string;
}

/**
 * Explicit whitelist of high-value MARC fields and subfields supported in Phase 5B.
 *
 * Excludes low-value administrative subfields, numeric dates, relator codes,
 * and punctuation-only fields.
 */
export const LOC_PILOT_FIELD_WHITELIST: Record<string, SupportedFieldSubfield> = {
  '100$a': { tag: '100', subfieldCode: 'a', entityType: 'PERSON', description: 'Main Entry - Personal Name' },
  '110$a': { tag: '110', subfieldCode: 'a', entityType: 'ORGANIZATION', description: 'Main Entry - Corporate Name' },
  '111$a': { tag: '111', subfieldCode: 'a', entityType: 'OTHER', description: 'Main Entry - Meeting / Conference Name' },
  '130$a': { tag: '130', subfieldCode: 'a', entityType: 'WORK', description: 'Main Entry - Uniform Title' },
  '240$a': { tag: '240', subfieldCode: 'a', entityType: 'WORK', description: 'Uniform Title' },
  '245$a': { tag: '245', subfieldCode: 'a', entityType: 'TITLE', description: 'Title Statement - Title proper' },
  '245$b': { tag: '245', subfieldCode: 'b', entityType: 'TITLE', description: 'Title Statement - Remainder of title / Subtitle' },
  '246$a': { tag: '246', subfieldCode: 'a', entityType: 'TITLE', description: 'Varying Form of Title - Title proper' },
  '600$a': { tag: '600', subfieldCode: 'a', entityType: 'PERSON', description: 'Subject Added Entry - Personal Name' },
  '610$a': { tag: '610', subfieldCode: 'a', entityType: 'ORGANIZATION', description: 'Subject Added Entry - Corporate Name' },
  '630$a': { tag: '630', subfieldCode: 'a', entityType: 'WORK', description: 'Subject Added Entry - Uniform Title' },
  '650$a': { tag: '650', subfieldCode: 'a', entityType: 'PHRASE', description: 'Subject Added Entry - Topical Term' },
  '651$a': { tag: '651', subfieldCode: 'a', entityType: 'PLACE', description: 'Subject Added Entry - Geographic Name' },
  '700$a': { tag: '700', subfieldCode: 'a', entityType: 'PERSON', description: 'Added Entry - Personal Name' },
  '710$a': { tag: '710', subfieldCode: 'a', entityType: 'ORGANIZATION', description: 'Added Entry - Corporate Name' },
  '730$a': { tag: '730', subfieldCode: 'a', entityType: 'WORK', description: 'Added Entry - Uniform Title' }
};

/**
 * Check whether a MARC tag and subfield code are in the Phase 5B pilot whitelist.
 */
export function getFieldPolicy(tag: string, subfieldCode: string): SupportedFieldSubfield | undefined {
  const key = `${tag}$${subfieldCode}`;
  return LOC_PILOT_FIELD_WHITELIST[key];
}
