import { describe, expect, it } from 'vitest';
import { RULES } from './provenance';
import { LexicalReading, OrthographicVowelEvidence } from './types';
import { evaluateEvidenceCompatibility, resolveVocalizedReadings } from './vocalization';

const kasra: OrthographicVowelEvidence[] = [{ mark: 'KASRA', vowel: 'i', sourceOffset: 1, afterBaseIndex: 0, rule: RULES.orthKasra, relationOnly: false }];
const reading = (canonical: string, vowel?: 'a' | 'i' | 'u'): LexicalReading => ({ canonical, confidence: 0.5, source: 'test', vocalization: vowel ? [{ afterBaseIndex: 0, vowel }] : undefined });

describe('tri-state explicit-vowel compatibility', () => {
  it('returns MATCH for the same position and vowel', () => expect(evaluateEvidenceCompatibility(reading('kirm', 'i'), kasra)).toBe('MATCH'));
  it('returns CONFLICT for the same position and a different vowel', () => expect(evaluateEvidenceCompatibility(reading('karam', 'a'), kasra)).toBe('CONFLICT'));
  it('returns UNKNOWN when metadata is absent at the source position', () => expect(evaluateEvidenceCompatibility(reading('kitāb'), kasra)).toBe('UNKNOWN'));
  it('does not select a MATCH when a competing reading remains UNKNOWN', () => {
    const result = resolveVocalizedReadings([reading('kirm', 'i'), reading('kirām')], kasra);
    expect(result.kind).toBe('AMBIGUOUS');
    expect(result.readings.map((item) => item.canonical)).toEqual(['kirm', 'kirām']);
  });
});
