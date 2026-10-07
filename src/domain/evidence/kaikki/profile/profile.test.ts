/**
 * Phase 7E Profile Recovery Test Suite.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LEXICON_REPOSITORY } from '../../../../data/lexicon';
import { synthesizeCandidateFromEvidence } from '../../candidate';
import { extractKaikkiObservations } from '../extractor';
import { KaikkiCandidateSchemeAggregator } from '../scheme/aggregator';
import {
  FIXTURE_EXPLICIT_CLASSICAL,
  FIXTURE_EXPLICIT_IRANIAN,
  FIXTURE_PAIRED_IMAM,
  FIXTURE_PAIRED_JEHAD,
  FIXTURE_SINGLE_TYPOGRAPHIC_MARKER_ONLY,
  FIXTURE_STRUCTURAL_TEMPLATE_LINK,
  FIXTURE_TWO_UNRELATED_ROMANIZATIONS
} from './fixtures';
import { WiktionaryProfileRecoveryEngine } from './recovery';

describe('Phase 7E: Wiktionary Romanization Profile Recovery', () => {
  const recoveryEngine = new WiktionaryProfileRecoveryEngine();
  const aggregator = new KaikkiCandidateSchemeAggregator();

  it('Tier A: preserves explicit Iranian profile with EXPLICIT origin', () => {
    const fixture = FIXTURE_EXPLICIT_IRANIAN;
    const recoveryMap = recoveryEngine.recoverProfilesForEntry(fixture.rawEntry, fixture.observations);

    expect(recoveryMap.size).toBe(1);
    const rec = recoveryMap.get(fixture.observations[0].evidence.id);
    expect(rec).toBeDefined();
    expect(rec!.originalProfile).toBe('IRANIAN');
    expect(rec!.recoveredProfile).toBe('IRANIAN');
    expect(rec!.profileOrigin).toBe('EXPLICIT');
    expect(rec!.recoveryStatus).toBe('EXPLICIT');
    expect(rec!.method).toBe('EXPLICIT_ROMANIZATION_TAG');
  });

  it('Tier A: preserves explicit Classical profile with EXPLICIT origin', () => {
    const fixture = FIXTURE_EXPLICIT_CLASSICAL;
    const recoveryMap = recoveryEngine.recoverProfilesForEntry(fixture.rawEntry, fixture.observations);

    expect(recoveryMap.size).toBe(1);
    const rec = recoveryMap.get(fixture.observations[0].evidence.id);
    expect(rec).toBeDefined();
    expect(rec!.originalProfile).toBe('CLASSICAL_DARI');
    expect(rec!.recoveredProfile).toBe('CLASSICAL_DARI');
    expect(rec!.profileOrigin).toBe('EXPLICIT');
    expect(rec!.recoveryStatus).toBe('EXPLICIT');
    expect(rec!.method).toBe('EXPLICIT_ROMANIZATION_TAG');
  });

  it('Tier B: structurally links template argument metadata', () => {
    const fixture = FIXTURE_STRUCTURAL_TEMPLATE_LINK;
    const recoveryMap = recoveryEngine.recoverProfilesForEntry(fixture.rawEntry, fixture.observations);

    expect(recoveryMap.size).toBe(2);
    const recCls = recoveryMap.get(fixture.observations[0].evidence.id);
    const recIra = recoveryMap.get(fixture.observations[1].evidence.id);

    expect(recCls).toBeDefined();
    expect(recCls!.recoveredProfile).toBe('CLASSICAL_DARI');
    expect(recCls!.profileOrigin).toBe('RECOVERED_STRUCTURAL');
    expect(recCls!.method).toBe('STRUCTURAL_TEMPLATE_LINK');

    expect(recIra).toBeDefined();
    expect(recIra!.recoveredProfile).toBe('IRANIAN');
    expect(recIra!.profileOrigin).toBe('RECOVERED_STRUCTURAL');
    expect(recIra!.method).toBe('STRUCTURAL_TEMPLATE_LINK');
  });

  it('Tier C: recovers paired Classical and Iranian correspondence (imām / emâm)', () => {
    const fixture = FIXTURE_PAIRED_IMAM;
    const recoveryMap = recoveryEngine.recoverProfilesForEntry(fixture.rawEntry, fixture.observations);

    expect(recoveryMap.size).toBe(2);
    const recCls = recoveryMap.get(fixture.observations[0].evidence.id);
    const recIra = recoveryMap.get(fixture.observations[1].evidence.id);

    expect(recCls).toBeDefined();
    expect(recCls!.originalProfile).toBe('UNCLASSIFIED');
    expect(recCls!.recoveredProfile).toBe('CLASSICAL_DARI');
    expect(recCls!.profileOrigin).toBe('RECOVERED_PAIRED');
    expect(recCls!.method).toBe('PAIRED_SCHEME_CORRESPONDENCE');

    expect(recIra).toBeDefined();
    expect(recIra!.originalProfile).toBe('UNCLASSIFIED');
    expect(recIra!.recoveredProfile).toBe('IRANIAN');
    expect(recIra!.profileOrigin).toBe('RECOVERED_PAIRED');
    expect(recIra!.method).toBe('PAIRED_SCHEME_CORRESPONDENCE');
  });

  it('Tier C: recovers paired Classical and Iranian correspondence (jihād / jehâd)', () => {
    const fixture = FIXTURE_PAIRED_JEHAD;
    const recoveryMap = recoveryEngine.recoverProfilesForEntry(fixture.rawEntry, fixture.observations);

    expect(recoveryMap.size).toBe(2);
    const recCls = recoveryMap.get(fixture.observations[0].evidence.id);
    const recIra = recoveryMap.get(fixture.observations[1].evidence.id);

    expect(recCls!.recoveredProfile).toBe('CLASSICAL_DARI');
    expect(recIra!.recoveredProfile).toBe('IRANIAN');
  });

  it('Single typographic marker alone remains UNCLASSIFIED (prohibited heuristic shortcut)', () => {
    const fixture = FIXTURE_SINGLE_TYPOGRAPHIC_MARKER_ONLY;
    const recoveryMap = recoveryEngine.recoverProfilesForEntry(fixture.rawEntry, fixture.observations);

    const rec = recoveryMap.get(fixture.observations[0].evidence.id);
    expect(rec).toBeDefined();
    expect(rec!.originalProfile).toBe('UNCLASSIFIED');
    expect(rec!.recoveredProfile).toBe('UNCLASSIFIED');
    expect(rec!.recoveryStatus).toBe('UNRECOVERABLE');
    expect(rec!.blockers.some((b) => b.kind === 'PROFILE_RECOVERY_NO_SIGNAL')).toBe(true);
  });

  it('Two unrelated romanizations with incompatible skeletons remain UNCLASSIFIED', () => {
    const fixture = FIXTURE_TWO_UNRELATED_ROMANIZATIONS;
    const recoveryMap = recoveryEngine.recoverProfilesForEntry(fixture.rawEntry, fixture.observations);

    for (const obs of fixture.observations) {
      const rec = recoveryMap.get(obs.evidence.id);
      expect(rec!.recoveredProfile).toBe('UNCLASSIFIED');
      expect(rec!.recoveryStatus).toBe('UNRECOVERABLE');
    }
  });

  it('Prohibits cross-record pairing', () => {
    const obsA = extractKaikkiObservations({
      word: 'امام',
      pos: 'noun',
      forms: [{ form: 'imām', tags: ['romanization'] }]
    })[0];
    const obsB = extractKaikkiObservations({
      word: 'امام',
      pos: 'noun',
      forms: [{ form: 'emâm', tags: ['romanization'] }]
    })[0];
    obsA.evidence.sourceRecordId = 'rec-1';
    obsB.evidence.sourceRecordId = 'rec-2';

    const recoveryMap = recoveryEngine.recoverProfilesForEntry({ word: 'امام' }, [obsA, obsB]);
    expect(recoveryMap.get(obsA.evidence.id)!.recoveredProfile).toBe('UNCLASSIFIED');
    expect(recoveryMap.get(obsB.evidence.id)!.recoveredProfile).toBe('UNCLASSIFIED');
  });

  it('Prohibits cross-etymology pairing', () => {
    const obsA = extractKaikkiObservations({
      word: 'امام',
      pos: 'noun',
      etymology_number: 1,
      forms: [{ form: 'imām', tags: ['romanization'] }]
    })[0];
    const obsB = extractKaikkiObservations({
      word: 'امام',
      pos: 'noun',
      etymology_number: 2,
      forms: [{ form: 'emâm', tags: ['romanization'] }]
    })[0];

    const recoveryMap = recoveryEngine.recoverProfilesForEntry({ word: 'امام' }, [obsA, obsB]);
    expect(recoveryMap.get(obsA.evidence.id)!.recoveredProfile).toBe('UNCLASSIFIED');
    expect(recoveryMap.get(obsB.evidence.id)!.recoveredProfile).toBe('UNCLASSIFIED');
  });

  it('Source-order invariance: reversing observations yields identical recovery results and interpretations', () => {
    const forwardObs = [...FIXTURE_PAIRED_IMAM.observations];
    const reverseObs = [...FIXTURE_PAIRED_IMAM.observations].reverse();

    const forwardRecovery = recoveryEngine.recoverProfilesForEntry(FIXTURE_PAIRED_IMAM.rawEntry, forwardObs);
    const reverseRecovery = recoveryEngine.recoverProfilesForEntry(FIXTURE_PAIRED_IMAM.rawEntry, reverseObs);

    const candForward = synthesizeCandidateFromEvidence('امام', forwardObs.map((o) => o.evidence));
    const candReverse = synthesizeCandidateFromEvidence('امام', reverseObs.map((o) => o.evidence));

    const analysisForward = aggregator.analyzeCandidate(candForward, forwardObs, undefined, {
      profileRecoveries: forwardRecovery
    });
    const analysisReverse = aggregator.analyzeCandidate(candReverse, reverseObs, undefined, {
      profileRecoveries: reverseRecovery
    });

    expect(analysisForward.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
    expect(analysisReverse.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
    expect(analysisForward.consensusTargetHypothesis).toBe('imām');
    expect(analysisReverse.consensusTargetHypothesis).toBe('imām');
  });

  it('Raw source metadata immutability: original evidence and metadata are never mutated', () => {
    const rawObs = JSON.parse(JSON.stringify(FIXTURE_PAIRED_IMAM.observations));
    const obsCopy = JSON.parse(JSON.stringify(rawObs));

    recoveryEngine.recoverProfilesForEntry(FIXTURE_PAIRED_IMAM.rawEntry, rawObs);
    expect(rawObs).toEqual(obsCopy);
  });

  it('Governance invariant: production fallback pack remains unchanged', () => {
    const prodPackPath = path.resolve('src/data/generated/kaikki-fallback.v1.json');
    expect(fs.existsSync(prodPackPath)).toBe(true);
    const content = fs.readFileSync(prodPackPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.manifest.packVersion).toBe('1.0.0');
    expect(Object.keys(parsed.entries).length).toBe(4);
  });

  it('Governance invariant: zero authoritative lexicon mutations', () => {
    expect(DEFAULT_LEXICON_REPOSITORY.getAllEntries().length).toBe(58);
    const entry = DEFAULT_LEXICON_REPOSITORY.findByNormalized('ولایت');
    expect(entry).toBeDefined();
    expect(entry!.readings[0].canonical).toBe('vilāyat');
  });
});
