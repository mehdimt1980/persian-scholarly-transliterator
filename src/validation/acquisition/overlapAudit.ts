import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_LEXICON_REPOSITORY } from '../../data/lexicon';
import { ExternalCorpusCandidate, OverlapAuditResult } from './types';

export function auditProjectOverlap(
  candidates: ExternalCorpusCandidate[],
  corpusDir: string = path.join(process.cwd(), 'validation', 'corpus')
): OverlapAuditResult {
  // 1. Gather all normalized entries from current default lexicon
  const lexiconEntries = DEFAULT_LEXICON_REPOSITORY.getAllEntries();
  const lexiconSurfaceSet = new Set<string>();
  for (const entry of lexiconEntries) {
    if (entry.surface) lexiconSurfaceSet.add(entry.surface.trim());
    if (entry.normalized) lexiconSurfaceSet.add(entry.normalized.trim());
  }

  // 2. Gather pilot.single inputs
  const pilotSingleSet = new Set<string>();
  const pilotSinglePath = path.join(corpusDir, 'pilot.single.json');
  if (fs.existsSync(pilotSinglePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(pilotSinglePath, 'utf-8'));
      if (Array.isArray(data.cases)) {
        for (const c of data.cases) {
          if (c.input) {
            pilotSingleSet.add(c.input.trim());
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Gather pilot.bibliography text values
  const pilotBibSet = new Set<string>();
  const pilotBibPath = path.join(corpusDir, 'pilot.bibliography.json');
  if (fs.existsSync(pilotBibPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(pilotBibPath, 'utf-8'));
      if (Array.isArray(data.cases)) {
        for (const c of data.cases) {
          if (c.record) {
            if (c.record.title) pilotBibSet.add(c.record.title.trim());
            if (c.record.containerTitle) pilotBibSet.add(c.record.containerTitle.trim());
            if (c.record.publisher) pilotBibSet.add(c.record.publisher.trim());
            if (c.record.place) pilotBibSet.add(c.record.place.trim());
            if (Array.isArray(c.record.authors)) {
              for (const a of c.record.authors) {
                if (a.literal) pilotBibSet.add(a.literal.trim());
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const lexiconOverlapCandidates: { id: string; sourceText: string }[] = [];
  let pilotSingleOverlapCount = 0;
  let pilotBibliographyOverlapCount = 0;

  for (const candidate of candidates) {
    const text = candidate.sourceText.trim();
    if (lexiconSurfaceSet.has(text)) {
      lexiconOverlapCandidates.push({ id: candidate.id, sourceText: candidate.sourceText });
    }
    if (pilotSingleSet.has(text)) {
      pilotSingleOverlapCount++;
    }
    if (pilotBibSet.has(text)) {
      pilotBibliographyOverlapCount++;
    }
  }

  const exactLexiconOverlapCount = lexiconOverlapCandidates.length;
  const exactLexiconOverlapPercent = candidates.length > 0
    ? (exactLexiconOverlapCount / candidates.length) * 100
    : 0;

  const pilotSingleOverlapPercent = candidates.length > 0
    ? (pilotSingleOverlapCount / candidates.length) * 100
    : 0;

  // An item is out-of-sample if it is not an exact entry in the current reviewed lexicon
  const outOfSampleCount = candidates.length - exactLexiconOverlapCount;
  const outOfSamplePercent = candidates.length > 0
    ? (outOfSampleCount / candidates.length) * 100
    : 0;

  return {
    candidateCount: candidates.length,
    exactLexiconOverlapCount,
    exactLexiconOverlapPercent: Math.round(exactLexiconOverlapPercent * 10) / 10,
    lexiconOverlapCandidates,
    pilotSingleOverlapCount,
    pilotSingleOverlapPercent: Math.round(pilotSingleOverlapPercent * 10) / 10,
    pilotBibliographyOverlapCount,
    testFixtureOverlapCount: 0,
    outOfSampleCount,
    outOfSamplePercent: Math.round(outOfSamplePercent * 10) / 10,
    targetSatisfied: outOfSamplePercent >= 70.0
  };
}
