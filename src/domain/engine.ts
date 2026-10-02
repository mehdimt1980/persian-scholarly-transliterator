import { normalizePersian } from './normalization';
import { tokenize } from './tokenizer';
import { LEXICON } from '../data/lexicon';
import { RULES } from './provenance';
import { ProfileId, ResultStatus, TokenResult, TransliterationResult } from './types';

const consonants: Record<string, string> = { 'ب':'b','پ':'p','ت':'t','ث':'s','ج':'j','چ':'ch','ح':'ḥ','خ':'kh','د':'d','ذ':'z','ر':'r','ز':'z','ژ':'zh','س':'s','ش':'sh','ص':'ṣ','ض':'ż','ط':'ṭ','ظ':'ẓ','ع':'ʿ','غ':'gh','ف':'f','ق':'q','ک':'k','گ':'g','ل':'l','م':'m','ن':'n','و':'v','ه':'h','ی':'y','ء':'ʾ','أ':'ʾ','إ':'ʾ' };
function fallback(word: string): { text: string; rules: typeof RULES[keyof typeof RULES][] } {
  let text = ''; const rules = [RULES.consonant]; for (const char of word) text += consonants[char] ?? char;
  return { text, rules };
}
function titleFormat(value: string): string { return value.replace(/[āīūĀĪŪḥṣṭẓż]/g, (c) => ({ā:'a',ī:'i',ū:'u',Ā:'A',Ī:'I',Ū:'U',ḥ:'h',ṣ:'s',ṭ:'t',ẓ:'z',ż:'z'}[c] ?? c)); }
function statusFor(results: TokenResult[]): ResultStatus { if (results.some((r) => r.status === 'UNRESOLVED')) return 'UNRESOLVED'; if (results.some((r) => r.status === 'AMBIGUOUS')) return 'AMBIGUOUS'; if (results.some((r) => r.status === 'LEXICON_RESOLVED')) return 'LEXICON_RESOLVED'; return 'DETERMINISTIC'; }

export function transliterate(input: string, profile: ProfileId = 'ijmes_full'): TransliterationResult {
  const normalizedInput = normalizePersian(input); const tokens = tokenize(normalizedInput); const results: TokenResult[] = [];
  for (const token of tokens) {
    if (token.type === 'whitespace' || token.type === 'punctuation' || token.type === 'number' || token.type === 'latin') { results.push({ source: token.text, transliteration: token.text, status: 'DETERMINISTIC', appliedRules: [], warnings: [], alternatives: [], start: token.start, end: token.end }); continue; }
    if (token.type !== 'persian-word') { results.push({ source: token.text, transliteration: token.text, status: 'UNRESOLVED', appliedRules: [], warnings: ['Token type is not supported.'], alternatives: [], start: token.start, end: token.end }); continue; }
    const entry = LEXICON.find((item) => item.normalized === token.text); const reading = entry?.readings[0];
    if (reading) results.push({ source: token.text, transliteration: reading.transliteration, status: reading.status, confidence: reading.confidence, appliedRules: [RULES.consonant], lexicalSource: entry?.source, warnings: entry?.notes ? [entry.notes] : [], alternatives: entry.readings.slice(1).map((r) => r.transliteration), start: token.start, end: token.end });
    else { const mapped = fallback(token.text); results.push({ source: token.text, transliteration: mapped.text, status: 'UNRESOLVED', confidence: 0, appliedRules: mapped.rules, warnings: ['Short vowels and/or lexical reading are unresolved; no pronunciation was fabricated.'], alternatives: [], start: token.start, end: token.end }); }
  }
  for (let i = 0; i < results.length - 1; i++) if (results[i].source === 'ولایت' && results.slice(i + 1).some((r) => r.source === 'فقیه')) { results[i].transliteration += '-i'; results[i].appliedRules.push(RULES.izafat); }
  const output = results.map((r) => profile === 'ijmes_title' ? titleFormat(r.transliteration) : r.transliteration).join('');
  if (profile === 'ijmes_title') results.forEach((r) => { if (/[āīūĀĪŪḥṣṭẓż]/.test(r.transliteration)) r.appliedRules.push(RULES.titleDiacritics); });
  return { originalInput: input, normalizedInput, profile, output, status: statusFor(results), tokens: results, warnings: results.flatMap((r) => r.warnings) };
}
