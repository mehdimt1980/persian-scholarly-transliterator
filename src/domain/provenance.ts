import { RuleDefinition } from './types';
export const RULES: Record<string, RuleDefinition> = {
  hamza: { id: 'IJMES-P-HAMZA', title: 'Hamza', description: 'Preserve hamza as ʾ in scholarly output.', authority: 'current-guide', reference: 'IJMES Translation and Transliteration Guide, Persian conventions.' },
  ayn: { id: 'IJMES-P-AYN', title: 'ʿAyn', description: 'Preserve ʿayn as ʿ in scholarly output.', authority: 'chart', reference: 'IJMES transliteration chart, Persian column.' },
  longA: { id: 'IJMES-P-LONG-A', title: 'Long a', description: 'Render long ā with a macron.', authority: 'chart', reference: 'IJMES transliteration chart.' },
  longI: { id: 'IJMES-P-LONG-I', title: 'Long i', description: 'Render long ī with a macron.', authority: 'chart', reference: 'IJMES transliteration chart.' },
  longU: { id: 'IJMES-P-LONG-U', title: 'Long u', description: 'Render long ū with a macron.', authority: 'chart', reference: 'IJMES transliteration chart.' },
  consonant: { id: 'IJMES-P-CONSONANT', title: 'Persian consonant mapping', description: 'Apply the Persian column of the IJMES chart.', authority: 'chart', reference: 'IJMES transliteration chart, Persian column.' },
  izafat: { id: 'IJMES-P-IZAFAT', title: 'Izāfat', description: 'Render a detected Persian izāfat as -i.', authority: 'linguistic-convention', reference: 'Current IJMES guide example: vilāyat-i faqīh.' },
  titleDiacritics: { id: 'IJMES-TITLE-DIACRITIC-REMOVAL', title: 'Title diacritic policy', description: 'Remove scholarly diacritics while preserving ʿayn and hamza.', authority: 'current-guide', reference: 'Current IJMES Translation and Transliteration Guide.' },
  titleCase: { id: 'IJMES-TITLE-CAPITALIZATION', title: 'English title capitalization', description: 'Format title output using English title capitalization.', authority: 'current-guide', reference: 'Current IJMES Translation and Transliteration Guide.' }
};
