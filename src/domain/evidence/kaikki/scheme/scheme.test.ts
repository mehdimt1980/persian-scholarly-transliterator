import { describe, it, expect } from 'vitest';
import { WiktionaryPersianProfileClassifier } from './profileClassifier';
import { WiktionaryPersianSchemeInterpreter } from './interpreter';
import { KaikkiCandidateSchemeAggregator } from './aggregator';
import { alignPersianScriptWithWiktionary } from './aligner';
import {
  evaluateCandidateAgainstReviewedLexicon,
  computeKaikkiInterpretationReport
} from './statistics';
import { KaikkiEvidenceConnector } from '../connector';
import { PHASE7B_SAMPLE_FIXTURES_PATH } from './fixtures';
import { DEFAULT_LEXICON_REPOSITORY } from '../../../../data/lexicon';
import type { LexicalEvidence, LexicalCandidate } from '../../types';
import type { KaikkiCandidateSchemeAnalysis } from './types';

describe('Phase 7B: Wiktionary Persian Scheme Interpretation & IJMES Hypothesis Generation', () => {
  const classifier = new WiktionaryPersianProfileClassifier();
  const interpreter = new WiktionaryPersianSchemeInterpreter();
  const aggregator = new KaikkiCandidateSchemeAggregator();

  describe('1. Profile Classifier (Strict Evidence-Based, No Typographic Guessing)', () => {
    it('classifies Classical / Dari tags correctly', () => {
      expect(classifier.classifyProfile(['Classical-Persian'])).toBe('CLASSICAL_DARI');
      expect(classifier.classifyProfile(['Dari'])).toBe('CLASSICAL_DARI');
      expect(classifier.classifyProfile(['Hazaragi'])).toBe('CLASSICAL_DARI');
    });

    it('classifies Iranian / Tehrani tags correctly', () => {
      expect(classifier.classifyProfile(['Iranian-Persian'])).toBe('IRANIAN');
      expect(classifier.classifyProfile(['Tehrani'])).toBe('IRANIAN');
      expect(classifier.classifyProfile(['Iran'])).toBe('IRANIAN');
    });

    it('fails closed to UNCLASSIFIED for untagged entries even if â or ā is present', () => {
      expect(classifier.classifyProfile([])).toBe('UNCLASSIFIED');
      expect(classifier.classifyProfile(undefined)).toBe('UNCLASSIFIED');
      expect(classifier.classifyProfile(['common', 'noun'])).toBe('UNCLASSIFIED');
    });

    it('fails closed to CONFLICTING if both Classical and Iranian tags are present', () => {
      expect(classifier.classifyProfile(['Classical-Persian', 'Iranian-Persian'])).toBe('CONFLICTING');
      expect(classifier.classifyProfile(['Dari', 'Tehrani'])).toBe('CONFLICTING');
    });
  });

  describe('2. Script-Aware Aligner & Consonantal / Glottal Reconstruction', () => {
    it('reconstructs Arabic-derived and distinct Persian consonants from script', () => {
      // ح vs ه
      const ha = alignPersianScriptWithWiktionary('حال', 'hâl', 'IRANIAN');
      expect(ha.success).toBe(true);
      expect(ha.ijmesHypothesis).toBe('ḥāl');

      // ص vs س
      const sabr = alignPersianScriptWithWiktionary('صبر', 'sabr', 'CLASSICAL_DARI');
      expect(sabr.success).toBe(true);
      expect(sabr.ijmesHypothesis).toBe('ṣabr');

      // ض vs ز vs ظ vs ذ
      const zarb = alignPersianScriptWithWiktionary('ضرب', 'zarb', 'CLASSICAL_DARI');
      expect(zarb.success).toBe(true);
      expect(zarb.ijmesHypothesis).toBe('żarb');

      const nazar = alignPersianScriptWithWiktionary('نظر', 'nazar', 'CLASSICAL_DARI');
      expect(nazar.success).toBe(true);
      expect(nazar.ijmesHypothesis).toBe('naẓar');

      // ط vs ت
      const talab = alignPersianScriptWithWiktionary('طلب', 'talab', 'CLASSICAL_DARI');
      expect(talab.success).toBe(true);
      expect(talab.ijmesHypothesis).toBe('ṭalab');

      // ق vs غ
      const qalam = alignPersianScriptWithWiktionary('قلم', 'qalam', 'CLASSICAL_DARI');
      expect(qalam.success).toBe(true);
      expect(qalam.ijmesHypothesis).toBe('qalam');

      const gham = alignPersianScriptWithWiktionary('غم', 'ġam', 'CLASSICAL_DARI');
      expect(gham.success).toBe(true);
      expect(gham.ijmesHypothesis).toBe('gham');
    });

    it('reconstructs multi-character consonants (kh, sh, ch, zh)', () => {
      const khana = alignPersianScriptWithWiktionary('خواب', 'khwāb', 'CLASSICAL_DARI');
      expect(khana.success).toBe(true);
      expect(khana.ijmesHypothesis).toBe('khwāb');

      const shab = alignPersianScriptWithWiktionary('شب', 'shab', 'CLASSICAL_DARI');
      expect(shab.success).toBe(true);
      expect(shab.ijmesHypothesis).toBe('shab');

      const chashm = alignPersianScriptWithWiktionary('چشم', 'cheshm', 'IRANIAN');
      expect(chashm.success).toBe(true);
      expect(chashm.ijmesHypothesis).toBe('chishm');

      const zhal = alignPersianScriptWithWiktionary('ژاله', 'žâle', 'IRANIAN');
      // ends with silent heh -> blocked
      expect(zhal.success).toBe(false);
      expect(zhal.blockerKind).toBe('AMBIGUOUS_FINAL_HEH');
    });

    it('reconstructs ʿayn and hamza from Persian script', () => {
      const ayn = alignPersianScriptWithWiktionary('علم', 'elm', 'IRANIAN');
      expect(ayn.success).toBe(true);
      expect(ayn.ijmesHypothesis).toBe('ʿilm');

      const hamza = alignPersianScriptWithWiktionary('تألیف', 'ta\'lif', 'IRANIAN');
      expect(hamza.success).toBe(true);
      expect(hamza.ijmesHypothesis).toBe('taʾlīf');
    });

    it('correctly maps Iranian short vowels (e -> i, o -> u) and long â -> ā', () => {
      const del = alignPersianScriptWithWiktionary('دل', 'del', 'IRANIAN');
      expect(del.success).toBe(true);
      expect(del.ijmesHypothesis).toBe('dil');

      const pol = alignPersianScriptWithWiktionary('پل', 'pol', 'IRANIAN');
      expect(pol.success).toBe(true);
      expect(pol.ijmesHypothesis).toBe('pul');

      const abad = alignPersianScriptWithWiktionary('آباد', 'âbâd', 'IRANIAN');
      expect(abad.success).toBe(true);
      expect(abad.ijmesHypothesis).toBe('ābād');
    });

    it('distinguishes Iranian long vowels (i backed by ی, u backed by و)', () => {
      const shir = alignPersianScriptWithWiktionary('شیر', 'šir', 'IRANIAN');
      expect(shir.success).toBe(true);
      expect(shir.ijmesHypothesis).toBe('shīr');

      const nur = alignPersianScriptWithWiktionary('نور', 'nur', 'IRANIAN');
      expect(nur.success).toBe(true);
      expect(nur.ijmesHypothesis).toBe('nūr');
    });

    it('handles Iranian diphthongs (ow -> aw, ey -> ay)', () => {
      const rowshan = alignPersianScriptWithWiktionary('روشن', 'rowshan', 'IRANIAN');
      expect(rowshan.success).toBe(true);
      expect(rowshan.ijmesHypothesis).toBe('rawshan');

      const peygham = alignPersianScriptWithWiktionary('پیغام', 'peyğâm', 'IRANIAN');
      expect(peygham.success).toBe(true);
      expect(peygham.ijmesHypothesis).toBe('payghām');
    });

    it('blocks unsupported majhūl symbols ē and ō in Classical profile', () => {
      const sher = alignPersianScriptWithWiktionary('شیر', 'šēr', 'CLASSICAL_DARI');
      expect(sher.success).toBe(false);
      expect(sher.blockerKind).toBe('UNSUPPORTED_WIKTIONARY_SYMBOL');

      const roz = alignPersianScriptWithWiktionary('روز', 'rōz', 'CLASSICAL_DARI');
      expect(roz.success).toBe(false);
      expect(roz.blockerKind).toBe('UNSUPPORTED_WIKTIONARY_SYMBOL');
    });

    it('blocks ambiguous silent final heh', () => {
      const khane = alignPersianScriptWithWiktionary('خانه', 'xâne', 'IRANIAN');
      expect(khane.success).toBe(false);
      expect(khane.blockerKind).toBe('AMBIGUOUS_FINAL_HEH');
    });
  });

  describe('3. Observation-Level Interpretation', () => {
    function makeEvidence(overrides: Partial<LexicalEvidence> & { rawMetadata?: Record<string, unknown> }): LexicalEvidence {
      const meta = overrides.rawMetadata ?? {
        rawSourceWord: 'گفتار',
        romanizationTags: ['Classical-Persian'],
        lemmaStatus: 'LEMMA'
      };

      return {
        id: 'EV_TEST_01',
        sourceType: 'LEXICOGRAPHIC_DATASET',
        sourceRecordId: null,
        sourceUri: null,
        sourceField: null,
        persianForm: 'گفتار',
        observedRomanization: 'guftār',
        romanizationScheme: 'LOCAL',
        entityType: 'WORD',
        context: null,
        status: 'OBSERVED',
        provenance: {
          sourceId: 'KAIKKI_ENWIKTIONARY_FA',
          retrievalMethod: 'BULK_DATA',
          retrievedAt: '2026-10-07T00:00:00Z'
        },
        ...overrides,
        rawMetadata: meta
      } as LexicalEvidence;
    }

    it('interprets Classical observation into deterministic IJMES hypothesis', () => {
      const ev = makeEvidence({
        observedRomanization: 'guftār',
        rawMetadata: {
          rawSourceWord: 'گفتار',
          romanizationTags: ['Classical-Persian'],
          lemmaStatus: 'LEMMA'
        }
      });
      const interp = interpreter.interpretEvidence(ev);
      expect(interp.status).toBe('DIRECT_EQUIVALENT');
      expect(interp.targetHypothesis).toBe('guftār');
      expect(interp.sourceProfile).toBe('CLASSICAL_DARI');
      expect(interp.ruleSetVersion).toBe('1.0.0');
    });

    it('interprets Iranian observation into deterministic IJMES hypothesis', () => {
      const ev = makeEvidence({
        observedRomanization: 'goftâr',
        rawMetadata: {
          rawSourceWord: 'گفتار',
          romanizationTags: ['Iranian-Persian'],
          lemmaStatus: 'LEMMA'
        }
      });
      const interp = interpreter.interpretEvidence(ev);
      expect(interp.status).toBe('DETERMINISTIC_EQUIVALENT');
      expect(interp.targetHypothesis).toBe('guftār');
      expect(interp.sourceProfile).toBe('IRANIAN');
    });

    it('blocks untagged observation with UNCLASSIFIED_WIKTIONARY_PROFILE', () => {
      const ev = makeEvidence({
        observedRomanization: 'goftār',
        rawMetadata: {
          rawSourceWord: 'گفتار',
          romanizationTags: [],
          lemmaStatus: 'LEMMA'
        }
      });
      const interp = interpreter.interpretEvidence(ev);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.blockers[0]?.kind).toBe('UNCLASSIFIED_WIKTIONARY_PROFILE');
      expect(interp.targetHypothesis).toBeNull();
    });

    it('blocks conflicting tags observation with CONFLICTING_WIKTIONARY_PROFILE', () => {
      const ev = makeEvidence({
        observedRomanization: 'goftār',
        rawMetadata: {
          rawSourceWord: 'گفتار',
          romanizationTags: ['Classical-Persian', 'Iranian-Persian'],
          lemmaStatus: 'LEMMA'
        }
      });
      const interp = interpreter.interpretEvidence(ev);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.blockers[0]?.kind).toBe('CONFLICTING_WIKTIONARY_PROFILE');
      expect(interp.targetHypothesis).toBeNull();
    });

    it('blocks non-lemma evidence with NON_LEMMA_SOURCE_FORM', () => {
      const ev = makeEvidence({
        rawMetadata: {
          rawSourceWord: 'گفتن',
          romanizationTags: ['Classical-Persian'],
          lemmaStatus: 'NON_LEMMA_FORM',
          formOf: 'گفتن'
        }
      });
      const interp = interpreter.interpretEvidence(ev);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.blockers[0]?.kind).toBe('NON_LEMMA_SOURCE_FORM');
    });
  });

  describe('4. Candidate-Level Consensus Aggregation & Zero-Authority Boundary', () => {
    function makeCandidate(evidenceIds: string[], overrides: Partial<LexicalCandidate> = {}): LexicalCandidate {
      return {
        id: 'CAND_GOFTAR',
        persianForm: 'گفتار',
        normalizedForm: 'گفتار',
        evidenceIds,
        conflicts: [],
        entityType: 'WORD',
        derivationProvenance: {
          derivedAt: '2026-10-07T00:00:00Z',
          strategy: 'SINGLE_EVIDENCE'
        },
        proposedCanonical: null,
        status: 'UNREVIEWED',
        ...overrides
      };
    }

    it('demonstrates UNANIMOUS_DETERMINISTIC convergence on گفتار (guftār)', () => {
      const ev1: LexicalEvidence = {
        id: 'EV_1',
        sourceType: 'LEXICOGRAPHIC_DATASET',
        sourceRecordId: null,
        sourceUri: null,
        sourceField: null,
        persianForm: 'گفتار',
        observedRomanization: 'guftār',
        romanizationScheme: 'LOCAL',
        entityType: 'WORD',
        context: null,
        status: 'OBSERVED',
        provenance: {
          sourceId: 'KAIKKI_ENWIKTIONARY_FA',
          retrievalMethod: 'BULK_DATA',
          retrievedAt: '2026-10-07T00:00:00Z'
        },
        rawMetadata: {
          rawSourceWord: 'گفتار',
          romanizationTags: ['Classical-Persian'],
          lemmaStatus: 'LEMMA'
        }
      } as LexicalEvidence;

      const ev2: LexicalEvidence = {
        id: 'EV_2',
        sourceType: 'LEXICOGRAPHIC_DATASET',
        sourceRecordId: null,
        sourceUri: null,
        sourceField: null,
        persianForm: 'گفتار',
        observedRomanization: 'goftâr',
        romanizationScheme: 'LOCAL',
        entityType: 'WORD',
        context: null,
        status: 'OBSERVED',
        provenance: {
          sourceId: 'KAIKKI_ENWIKTIONARY_FA',
          retrievalMethod: 'BULK_DATA',
          retrievedAt: '2026-10-07T00:00:00Z'
        },
        rawMetadata: {
          rawSourceWord: 'گفتار',
          romanizationTags: ['Iranian-Persian'],
          lemmaStatus: 'LEMMA'
        }
      } as LexicalEvidence;

      const candidate = makeCandidate(['EV_1', 'EV_2']);
      const analysis = aggregator.analyzeCandidate(candidate, [ev1, ev2], interpreter);

      expect(analysis.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
      expect(analysis.consensusTargetHypothesis).toBe('guftār');
      expect(analysis.deterministicTargetHypotheses).toEqual(['guftār']);
      expect(analysis.interpretations.length).toBe(2);
    });

    it('detects CONFLICTING_DETERMINISTIC when multiple hypotheses emerge', () => {
      const ev1: LexicalEvidence = {
        id: 'EV_K1',
        sourceType: 'LEXICOGRAPHIC_DATASET',
        sourceRecordId: null,
        sourceUri: null,
        sourceField: null,
        persianForm: 'کشت',
        observedRomanization: 'kasht',
        romanizationScheme: 'LOCAL',
        entityType: 'WORD',
        context: null,
        status: 'OBSERVED',
        provenance: {
          sourceId: 'KAIKKI_ENWIKTIONARY_FA',
          retrievalMethod: 'BULK_DATA',
          retrievedAt: '2026-10-07T00:00:00Z'
        },
        rawMetadata: {
          rawSourceWord: 'کشت',
          romanizationTags: ['Classical-Persian'],
          lemmaStatus: 'LEMMA'
        }
      } as LexicalEvidence;

      const ev2: LexicalEvidence = {
        id: 'EV_K2',
        sourceType: 'LEXICOGRAPHIC_DATASET',
        sourceRecordId: null,
        sourceUri: null,
        sourceField: null,
        persianForm: 'کشت',
        observedRomanization: 'kisht',
        romanizationScheme: 'LOCAL',
        entityType: 'WORD',
        context: null,
        status: 'OBSERVED',
        provenance: {
          sourceId: 'KAIKKI_ENWIKTIONARY_FA',
          retrievalMethod: 'BULK_DATA',
          retrievedAt: '2026-10-07T00:00:00Z'
        },
        rawMetadata: {
          rawSourceWord: 'کشت',
          romanizationTags: ['Classical-Persian'],
          lemmaStatus: 'LEMMA'
        }
      } as LexicalEvidence;

      const candidate = makeCandidate(['EV_K1', 'EV_K2'], { persianForm: 'کشت', normalizedForm: 'کشت' });
      const analysis = aggregator.analyzeCandidate(candidate, [ev1, ev2], interpreter);

      expect(analysis.consensusStatus).toBe('CONFLICTING_DETERMINISTIC');
      expect(analysis.consensusTargetHypothesis).toBeNull();
      expect(analysis.deterministicTargetHypotheses).toEqual(['kasht', 'kisht']);
    });

    it('classifies consensus as PARTIAL when valid hypothesis coexists with unclassified evidence', () => {
      const ev1: LexicalEvidence = {
        id: 'EV_P1',
        sourceType: 'LEXICOGRAPHIC_DATASET',
        sourceRecordId: null,
        sourceUri: null,
        sourceField: null,
        persianForm: 'دل',
        observedRomanization: 'del',
        romanizationScheme: 'LOCAL',
        entityType: 'WORD',
        context: null,
        status: 'OBSERVED',
        provenance: {
          sourceId: 'KAIKKI_ENWIKTIONARY_FA',
          retrievalMethod: 'BULK_DATA',
          retrievedAt: '2026-10-07T00:00:00Z'
        },
        rawMetadata: {
          rawSourceWord: 'دل',
          romanizationTags: ['Iranian-Persian'],
          lemmaStatus: 'LEMMA'
        }
      } as LexicalEvidence;

      const ev2: LexicalEvidence = {
        id: 'EV_P2',
        sourceType: 'LEXICOGRAPHIC_DATASET',
        sourceRecordId: null,
        sourceUri: null,
        sourceField: null,
        persianForm: 'دل',
        observedRomanization: 'del',
        romanizationScheme: 'LOCAL',
        entityType: 'WORD',
        context: null,
        status: 'OBSERVED',
        provenance: {
          sourceId: 'KAIKKI_ENWIKTIONARY_FA',
          retrievalMethod: 'BULK_DATA',
          retrievedAt: '2026-10-07T00:00:00Z'
        },
        rawMetadata: {
          rawSourceWord: 'دل',
          romanizationTags: [],
          lemmaStatus: 'LEMMA'
        }
      } as LexicalEvidence;

      const candidate = makeCandidate(['EV_P1', 'EV_P2'], { persianForm: 'دل', normalizedForm: 'دل' });
      const analysis = aggregator.analyzeCandidate(candidate, [ev1, ev2], interpreter);

      expect(analysis.consensusStatus).toBe('PARTIAL');
      expect(analysis.consensusTargetHypothesis).toBeNull();
      expect(analysis.deterministicTargetHypotheses).toEqual(['dil']);
    });

    it('enforces exact candidate.evidenceIds closure and rejects foreign evidence', () => {
      const ev1: LexicalEvidence = {
        id: 'EV_1',
        sourceType: 'LEXICOGRAPHIC_DATASET',
        sourceRecordId: null,
        sourceUri: null,
        sourceField: null,
        persianForm: 'گفتار',
        observedRomanization: 'guftār',
        romanizationScheme: 'LOCAL',
        entityType: 'WORD',
        context: null,
        status: 'OBSERVED',
        provenance: {
          sourceId: 'KAIKKI_ENWIKTIONARY_FA',
          retrievalMethod: 'BULK_DATA',
          retrievedAt: '2026-10-07T00:00:00Z'
        },
        rawMetadata: {
          rawSourceWord: 'گفتار',
          romanizationTags: ['Classical-Persian'],
          lemmaStatus: 'LEMMA'
        }
      } as LexicalEvidence;

      const candidate = makeCandidate(['EV_1', 'EV_MISSING']);
      expect(() => {
        aggregator.analyzeCandidate(candidate, [ev1], interpreter);
      }).toThrow(/not found in the supplied evidence source/);
    });
  });

  describe('5. Read-Only Lexicon Evaluation & Metrics', () => {
    it('compares candidate hypotheses against DEFAULT_LEXICON_REPOSITORY without mutating', () => {
      const mockAnalysis: KaikkiCandidateSchemeAnalysis = {
        id: 'ANALYSIS_TEST_01',
        candidateId: 'CAND_GOFTAR',
        persianForm: 'گفتار',
        deterministicTargetHypotheses: ['guftār'],
        consensusStatus: 'UNANIMOUS_DETERMINISTIC',
        consensusTargetHypothesis: 'guftār',
        rawSourceConflicts: [],
        rawCandidateStatus: 'UNREVIEWED',
        blockers: [],
        appliedRuleIds: [],
        aggregatorVersion: '1.0.0',
        interpretations: []
      };

      const initialLexiconSize = DEFAULT_LEXICON_REPOSITORY.getAllEntries().length;
      const evalResult = evaluateCandidateAgainstReviewedLexicon(mockAnalysis);

      expect(DEFAULT_LEXICON_REPOSITORY.getAllEntries().length).toBe(initialLexiconSize);
      expect(evalResult.outcome).toBe('EXACT_MATCH');
      expect(evalResult.lexiconCanonical).toBe('guftār');
    });
  });

  describe('6. End-to-End Pipeline on Phase 7B Sample Dataset', () => {
    it('processes sample JSONL fixtures and generates interpretation report with mandatory zero metrics', async () => {
      const connector = new KaikkiEvidenceConnector();
      const parseResult = await connector.processFile(PHASE7B_SAMPLE_FIXTURES_PATH, { strict: true });

      const candidates = parseResult.candidates ?? [];
      const evidence = parseResult.evidence ?? [];

      expect(candidates.length).toBeGreaterThan(0);
      expect(evidence.length).toBeGreaterThan(0);

      const candidateAnalyses: KaikkiCandidateSchemeAnalysis[] = [];

      for (const candidate of candidates) {
        const analysis = aggregator.analyzeCandidate(candidate, evidence, interpreter);
        candidateAnalyses.push(analysis);
      }

      const report = computeKaikkiInterpretationReport({
        analyses: candidateAnalyses
      });

      expect(report.totalObservations).toBeGreaterThan(0);
      expect(report.totalCandidates).toBeGreaterThan(0);
      expect(report.promotionCount).toBe(0);
      expect(report.authoritativeLexiconChanges).toBe(0);
      expect(report.runtimeOutputChanges).toBe(0);

      // Verify sample items structure
      expect(report.samples.length).toBeGreaterThan(0);
      for (const sample of report.samples) {
        expect(sample.authoritative).toBe(false);
      }
    });
  });
});
