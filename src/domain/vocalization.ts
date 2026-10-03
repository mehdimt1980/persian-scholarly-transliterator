import { EvidenceCompatibility, LexicalReading, OrthographicVowelEvidence } from './types';

export type VocalizedResolution =
  | { kind: 'RESOLVED'; readings: [LexicalReading] }
  | { kind: 'AMBIGUOUS'; readings: LexicalReading[] }
  | { kind: 'CONFLICT'; readings: LexicalReading[] }
  | { kind: 'INSUFFICIENT'; readings: LexicalReading[] };

export function evaluateEvidenceCompatibility(reading: LexicalReading, evidence: OrthographicVowelEvidence[]): EvidenceCompatibility {
  const lexicalEvidence = evidence.filter((item) => !item.relationOnly);
  if (!lexicalEvidence.length) return 'UNKNOWN';
  let hasUnknown = false;
  for (const sourceVowel of lexicalEvidence) {
    const atPosition = reading.vocalization?.filter((item) => item.afterBaseIndex === sourceVowel.afterBaseIndex) ?? [];
    if (!atPosition.length) { hasUnknown = true; continue; }
    if (!atPosition.some((item) => item.vowel === sourceVowel.vowel)) return 'CONFLICT';
  }
  return hasUnknown ? 'UNKNOWN' : 'MATCH';
}

export function resolveVocalizedReadings(readings: LexicalReading[], evidence: OrthographicVowelEvidence[]): VocalizedResolution {
  const classified = readings.map((reading) => ({ reading, compatibility: evaluateEvidenceCompatibility(reading, evidence) }));
  const matches = classified.filter((item) => item.compatibility === 'MATCH').map((item) => item.reading);
  const unknown = classified.filter((item) => item.compatibility === 'UNKNOWN').map((item) => item.reading);
  if (matches.length === 1 && unknown.length === 0) return { kind: 'RESOLVED', readings: [matches[0]] };
  if (matches.length > 1 || (matches.length > 0 && unknown.length > 0)) return { kind: 'AMBIGUOUS', readings: [...matches, ...unknown] };
  if (unknown.length > 0) return { kind: 'INSUFFICIENT', readings: unknown };
  return { kind: 'CONFLICT', readings };
}
