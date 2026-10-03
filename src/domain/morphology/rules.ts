import { RULES } from '../provenance';
import { ProductiveSuffixRule } from './types';

export const PRODUCTIVE_SUFFIX_RULES: ProductiveSuffixRule[] = [
  { id: 'plural-ha', surfaceForms: ['ها'], morphemeType: 'PLURAL_HA', hostCategories: ['noun', 'proper-noun'], canonicalRendering: 'hā', allowWithoutZwnj: false, rule: RULES.morphPluralHa },
  { id: 'superlative-tarin', surfaceForms: ['ترین'], morphemeType: 'SUPERLATIVE_TARIN', hostCategories: ['adjective'], canonicalRendering: 'tarīn', allowWithoutZwnj: false, rule: RULES.morphSuperlativeTarin },
  { id: 'comparative-tar', surfaceForms: ['تر'], morphemeType: 'COMPARATIVE_TAR', hostCategories: ['adjective'], canonicalRendering: 'tar', allowWithoutZwnj: false, rule: RULES.morphComparativeTar },
  { id: 'possessive-1pl', surfaceForms: ['مان'], morphemeType: 'POSSESSIVE_1PL', hostCategories: ['noun', 'proper-noun'], canonicalRendering: 'mān', allowWithoutZwnj: true, rule: RULES.morphPossessive1pl },
  { id: 'possessive-2pl', surfaceForms: ['تان'], morphemeType: 'POSSESSIVE_2PL', hostCategories: ['noun', 'proper-noun'], canonicalRendering: 'tān', allowWithoutZwnj: true, rule: RULES.morphPossessive2pl },
  { id: 'possessive-3pl', surfaceForms: ['شان'], morphemeType: 'POSSESSIVE_3PL', hostCategories: ['noun', 'proper-noun'], canonicalRendering: 'shān', allowWithoutZwnj: true, rule: RULES.morphPossessive3pl },
  { id: 'possessive-1sg', surfaceForms: ['م'], morphemeType: 'POSSESSIVE_1SG', hostCategories: ['noun', 'proper-noun'], canonicalRendering: 'am', allowWithoutZwnj: true, rule: RULES.morphPossessive1sg },
  { id: 'possessive-2sg', surfaceForms: ['ت'], morphemeType: 'POSSESSIVE_2SG', hostCategories: ['noun', 'proper-noun'], canonicalRendering: 'at', allowWithoutZwnj: true, rule: RULES.morphPossessive2sg },
  { id: 'possessive-3sg', surfaceForms: ['ش'], morphemeType: 'POSSESSIVE_3SG', hostCategories: ['noun', 'proper-noun'], canonicalRendering: 'ash', allowWithoutZwnj: true, rule: RULES.morphPossessive3sg }
];
