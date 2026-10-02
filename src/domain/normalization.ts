import { NormalizationChange, NormalizationResult } from './types';

const ORTHOGRAPHIC_VARIANTS: Record<string, string> = { 'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ە': 'ه' };

export function normalizePersian(input: string): NormalizationResult {
  const nfc = input.normalize('NFC');
  const changes: NormalizationChange[] = [];
  let normalizedInput = '';
  for (let index = 0; index < nfc.length; index += 1) {
    const original = nfc[index];
    let normalized = ORTHOGRAPHIC_VARIANTS[original] ?? original;
    let kind: NormalizationChange['kind'] = 'orthographic-variant';
    let semanticRole: NormalizationChange['semanticRole'];
    if (original === 'ۀ') semanticRole = 'persian-heh-with-ye-above';
    if (original === 'ة') semanticRole = 'arabic-ta-marbuta';
    if (original === '\u200d') { normalized = '\u200c'; kind = 'joiner'; }
    if (normalized !== original || semanticRole) changes.push({ index, original, normalized, kind, semanticRole });
    normalizedInput += normalized;
  }
  const collapsed = normalizedInput.replace(/[ \t\r\n]+/g, ' ');
  if (collapsed !== normalizedInput) changes.push({ index: 0, original: normalizedInput, normalized: collapsed, kind: 'whitespace' });
  return { originalInput: input, normalizedInput: collapsed, changes };
}
