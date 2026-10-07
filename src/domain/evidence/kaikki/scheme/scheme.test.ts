import { describe, it, expect } from 'vitest';
import { WiktionaryPersianProfileClassifier, classifyWiktionaryProfile } from './profileClassifier';
import { WiktionaryPersianSchemeInterpreter } from './interpreter';
import { KaikkiCandidateSchemeAggregator } from './aggregator';
import { alignPersianScriptWithWiktionary } from './aligner';
import { computeMetadataFingerprint, generateKaikkiInterpretationId } from './identity';
import {
  evaluateCandidateAgainstReviewedLexicon,
  computeKaikkiInterpretationReport
} from './statistics';
import { KaikkiEvidenceConnector } from '../connector';
import { PHASE7B_SAMPLE_FIXTURES_PATH } from './fixtures';
import { DEFAULT_LEXICON_REPOSITORY } from '../../../../data/lexicon';
import type { LexicalEvidence, LexicalCandidate } from '../../types';
import type { KaikkiEvidenceMetadata, KaikkiExtractedObservation } from '../types';
import type { KaikkiCandidateSchemeAnalysis } from './types';

describe('Phase 7B: Wiktionary Persian Scheme Interpretation & IJMES Hypothesis Generation', () => {
  const classifier = new WiktionaryPersianProfileClassifier();
  const interpreter = new WiktionaryPersianSchemeInterpreter();
  const aggregator = new KaikkiCandidateSchemeAggregator();

  function makeObservation(params: {
    evidenceId: string;
    persianForm: string;
    observedRomanization: string | null;
    romanizationTags?: string[];
    varietyTags?: string[];
    isLemma?: boolean;
    sourceFormIndex?: number;
  }): KaikkiExtractedObservation {
    const evidence: LexicalEvidence = {
      id: params.evidenceId,
      sourceType: 'LEXICOGRAPHIC_DATASET',
      sourceRecordId: 'fa:noun:0',
      sourceUri: `https://en.wiktionary.org/wiki/${encodeURIComponent(params.persianForm)}`,
      sourceField: `forms[${params.sourceFormIndex ?? 0}]`,
      persianForm: params.persianForm,
      observedRomanization: params.observedRomanization,
      romanizationScheme: 'LOCAL',
      entityType: 'WORD',
      context: 'gloss',
      status: 'OBSERVED',
      provenance: {
        sourceId: 'KAIKKI_ENWIKTIONARY_FA',
        sourceTitle: 'Kaikki / English Wiktionary Persian',
        sourceOrganization: 'Kaikki.org / Wiktextract / Wikimedia Foundation',
        retrievalMethod: 'BULK_DATA',
        retrievedAt: '2026-10-07T00:00:00Z',
        extractorVersion: '1.0.0'
      }
    };

    const metadata: KaikkiEvidenceMetadata = {
      rawSourceWord: params.persianForm,
      normalizedForm: params.persianForm,
      lemmaStatus: params.isLemma === false ? 'NON_LEMMA_FORM' : 'LEMMA',
      sourceFormIndex: params.sourceFormIndex ?? 0,
      ipaObservations: [],
      varietyTags: params.varietyTags ?? [],
      romanizationTags: params.romanizationTags ?? [],
      sourceSenseIds: [],
      glosses: ['gloss']
    };

    return {
      evidence,
      metadata,
      rawSourceWord: params.persianForm,
      normalizedForm: params.persianForm
    };
  }

  function makeCandidate(params: {
    candidateId: string;
    persianForm: string;
    evidenceIds: string[];
    overrides?: Partial<LexicalCandidate>;
  }): LexicalCandidate {
    return {
      id: params.candidateId,
      persianForm: params.persianForm,
      normalizedForm: params.persianForm,
      evidenceIds: params.evidenceIds,
      conflicts: [],
      entityType: 'WORD',
      derivationProvenance: {
        derivedAt: '2026-10-07T00:00:00Z',
        strategy: 'SINGLE_EVIDENCE'
      },
      proposedCanonical: null,
      status: 'UNREVIEWED',
      ...params.overrides
    };
  }

  describe('1. Profile Classifier (Per-Observation Tags Only, No Entry-Global Fallback)', () => {
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

    it('does NOT infer profile from entry-global variety tags when romanization is untagged', () => {
      const metadata: Partial<KaikkiEvidenceMetadata> = {
        romanizationTags: [],
        varietyTags: ['Iranian-Persian', 'Tehrani']
      };
      expect(classifyWiktionaryProfile(metadata)).toBe('UNCLASSIFIED');
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

  describe('2. Script-Aware Aligner & Bidirectional Consonant Compatibility', () => {
    it('reconstructs Arabic-derived and distinct Persian consonants from script when compatible', () => {
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

    it('rejects incompatible Roman consonants against Persian script (adversarial testing)', () => {
      // صبر with zabr: ص requires s-class consonant, not z
      const sabrBad = alignPersianScriptWithWiktionary('صبر', 'zabr', 'CLASSICAL_DARI');
      expect(sabrBad.success).toBe(false);
      expect(sabrBad.blockerKind).toBe('SOURCE_SCRIPT_ALIGNMENT_FAILED');

      // حال with khal: ح requires h-class consonant, not kh
      const halBad = alignPersianScriptWithWiktionary('حال', 'khal', 'CLASSICAL_DARI');
      expect(halBad.success).toBe(false);
      expect(halBad.blockerKind).toBe('SOURCE_SCRIPT_ALIGNMENT_FAILED');

      // کتاب with setab: ک requires k, not s
      const ketabBad = alignPersianScriptWithWiktionary('کتاب', 'setâb', 'IRANIAN');
      expect(ketabBad.success).toBe(false);
      expect(ketabBad.blockerKind).toBe('SOURCE_SCRIPT_ALIGNMENT_FAILED');
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

    it('enforces Iranian long vowels (i backed by ی, u backed by و) and rejects unanchored i/u', () => {
      const shir = alignPersianScriptWithWiktionary('شیر', 'šir', 'IRANIAN');
      expect(shir.success).toBe(true);
      expect(shir.ijmesHypothesis).toBe('shīr');

      const nur = alignPersianScriptWithWiktionary('نور', 'nur', 'IRANIAN');
      expect(nur.success).toBe(true);
      expect(nur.ijmesHypothesis).toBe('nūr');

      // Unanchored i in Iranian: کتاب with kitâb (Iranian short kasrah is e; unanchored i is disallowed)
      const unanchoredI = alignPersianScriptWithWiktionary('کتاب', 'kitâb', 'IRANIAN');
      expect(unanchoredI.success).toBe(false);
      expect(unanchoredI.blockerKind).toBe('SOURCE_SCRIPT_ALIGNMENT_FAILED');

      // Unanchored u in Iranian: پل with pul (Iranian short dammah is o; unanchored u is disallowed)
      const unanchoredU = alignPersianScriptWithWiktionary('پل', 'pul', 'IRANIAN');
      expect(unanchoredU.success).toBe(false);
      expect(unanchoredU.blockerKind).toBe('SOURCE_SCRIPT_ALIGNMENT_FAILED');
    });

    it('correctly handles word-initial Alif vowel carriers without index drift', () => {
      // ایران (initial alif + ya)
      const iran = alignPersianScriptWithWiktionary('ایران', 'irân', 'IRANIAN');
      expect(iran.success).toBe(true);
      expect(iran.ijmesHypothesis).toBe('īrān');

      // اسلام (initial alif + e/i)
      const eslam = alignPersianScriptWithWiktionary('اسلام', 'eslâm', 'IRANIAN');
      expect(eslam.success).toBe(true);
      expect(eslam.ijmesHypothesis).toBe('islām');

      // امید (initial alif + o/u)
      const omid = alignPersianScriptWithWiktionary('امید', 'omid', 'IRANIAN');
      expect(omid.success).toBe(true);
      expect(omid.ijmesHypothesis).toBe('umīd');

      // اثر (initial alif + a)
      const asar = alignPersianScriptWithWiktionary('اثر', 'asar', 'IRANIAN');
      expect(asar.success).toBe(true);
      expect(asar.ijmesHypothesis).toBe('asar');
    });

    it('profile-gates diphthongs and applies correct source rules', () => {
      // Iranian ow -> aw
      const rowshan = alignPersianScriptWithWiktionary('روشن', 'rowshan', 'IRANIAN');
      expect(rowshan.success).toBe(true);
      expect(rowshan.ijmesHypothesis).toBe('rawshan');
      expect(rowshan.appliedRuleIds).toContain('WIKT_IRANIAN_DIPHTHONG_OW_TO_AW');

      // Classical aw -> aw
      const rowshanCl = alignPersianScriptWithWiktionary('روشن', 'rawshan', 'CLASSICAL_DARI');
      expect(rowshanCl.success).toBe(true);
      expect(rowshanCl.ijmesHypothesis).toBe('rawshan');
      expect(rowshanCl.appliedRuleIds).toContain('WIKT_CLASSICAL_DIPHTHONG_AW');
      expect(rowshanCl.appliedRuleIds).not.toContain('WIKT_IRANIAN_DIPHTHONG_OW_TO_AW');

      // Iranian ey -> ay
      const peygham = alignPersianScriptWithWiktionary('پیغام', 'peyğâm', 'IRANIAN');
      expect(peygham.success).toBe(true);
      expect(peygham.ijmesHypothesis).toBe('payghām');
      expect(peygham.appliedRuleIds).toContain('WIKT_IRANIAN_DIPHTHONG_EY_TO_AY');
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

  describe('3. Observation-Level Interpretation & Intrinsic Metadata Binding', () => {
    it('interprets Classical observation into deterministic IJMES hypothesis', () => {
      const obs = makeObservation({
        evidenceId: 'EV_1',
        persianForm: 'گفتار',
        observedRomanization: 'guftār',
        romanizationTags: ['Classical-Persian']
      });
      const interp = interpreter.interpretEvidence(obs);
      expect(interp.status).toBe('DIRECT_EQUIVALENT');
      expect(interp.targetHypothesis).toBe('guftār');
      expect(interp.sourceProfile).toBe('CLASSICAL_DARI');
      expect(interp.ruleSetVersion).toBe('1.0.0');
    });

    it('interprets Iranian observation into deterministic IJMES hypothesis', () => {
      const obs = makeObservation({
        evidenceId: 'EV_2',
        persianForm: 'گفتار',
        observedRomanization: 'goftâr',
        romanizationTags: ['Iranian-Persian']
      });
      const interp = interpreter.interpretEvidence(obs);
      expect(interp.status).toBe('DETERMINISTIC_EQUIVALENT');
      expect(interp.targetHypothesis).toBe('guftār');
      expect(interp.sourceProfile).toBe('IRANIAN');
    });

    it('fails closed with INSUFFICIENT_SOURCE_METADATA on metadata/evidence Persian mismatch', () => {
      const obs = makeObservation({
        evidenceId: 'EV_MISMATCH',
        persianForm: 'گفتار',
        observedRomanization: 'guftār',
        romanizationTags: ['Classical-Persian']
      });
      // Forge mismatched metadata
      obs.metadata.rawSourceWord = 'کتاب';
      const interp = interpreter.interpretEvidence(obs);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.blockers[0]?.kind).toBe('INSUFFICIENT_SOURCE_METADATA');
    });

    it('blocks untagged observation with UNCLASSIFIED_WIKTIONARY_PROFILE', () => {
      const obs = makeObservation({
        evidenceId: 'EV_UNTAGGED',
        persianForm: 'گفتار',
        observedRomanization: 'goftār',
        romanizationTags: []
      });
      const interp = interpreter.interpretEvidence(obs);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.blockers[0]?.kind).toBe('UNCLASSIFIED_WIKTIONARY_PROFILE');
      expect(interp.targetHypothesis).toBeNull();
    });

    it('blocks non-lemma evidence with NON_LEMMA_SOURCE_FORM', () => {
      const obs = makeObservation({
        evidenceId: 'EV_NONLEMMA',
        persianForm: 'گفتن',
        observedRomanization: 'goftan',
        romanizationTags: ['Iranian-Persian'],
        isLemma: false
      });
      const interp = interpreter.interpretEvidence(obs);
      expect(interp.status).toBe('CONTEXT_REQUIRED');
      expect(interp.blockers[0]?.kind).toBe('NON_LEMMA_SOURCE_FORM');
    });
  });

  describe('4. Candidate-Level Exact Closure & Persian Identity Validation', () => {
    it('demonstrates UNANIMOUS_DETERMINISTIC convergence on گفتار (guftār)', () => {
      const obs1 = makeObservation({
        evidenceId: 'EV_1',
        persianForm: 'گفتار',
        observedRomanization: 'guftār',
        romanizationTags: ['Classical-Persian']
      });

      const obs2 = makeObservation({
        evidenceId: 'EV_2',
        persianForm: 'گفتار',
        observedRomanization: 'goftâr',
        romanizationTags: ['Iranian-Persian']
      });

      const candidate = makeCandidate({
        candidateId: 'CAND_GOFTAR',
        persianForm: 'گفتار',
        evidenceIds: ['EV_1', 'EV_2']
      });

      const analysis = aggregator.analyzeCandidate(candidate, [obs1, obs2], interpreter);

      expect(analysis.consensusStatus).toBe('UNANIMOUS_DETERMINISTIC');
      expect(analysis.consensusTargetHypothesis).toBe('guftār');
      expect(analysis.deterministicTargetHypotheses).toEqual(['guftār']);
      expect(analysis.interpretations.length).toBe(2);
    });

    it('enforces true exact evidence closure and rejects extra evidence (superset violation)', () => {
      const obs1 = makeObservation({
        evidenceId: 'EV_1',
        persianForm: 'گفتار',
        observedRomanization: 'guftār',
        romanizationTags: ['Classical-Persian']
      });

      const obs2 = makeObservation({
        evidenceId: 'EV_2',
        persianForm: 'گفتار',
        observedRomanization: 'goftâr',
        romanizationTags: ['Iranian-Persian']
      });

      const obsExtra = makeObservation({
        evidenceId: 'EV_EXTRA',
        persianForm: 'گفتار',
        observedRomanization: 'guftār',
        romanizationTags: ['Classical-Persian']
      });

      const candidate = makeCandidate({
        candidateId: 'CAND_GOFTAR',
        persianForm: 'گفتار',
        evidenceIds: ['EV_1', 'EV_2'] // Only EV_1 and EV_2
      });

      expect(() => {
        aggregator.analyzeCandidate(candidate, [obs1, obs2, obsExtra], interpreter);
      }).toThrow(/Exact evidence closure violation/);
    });

    it('enforces Persian identity and rejects evidence from a different word', () => {
      const obsKetab = makeObservation({
        evidenceId: 'EV_KETAB',
        persianForm: 'کتاب',
        observedRomanization: 'ketâb',
        romanizationTags: ['Iranian-Persian']
      });

      const candidateGoftar = makeCandidate({
        candidateId: 'CAND_GOFTAR',
        persianForm: 'گفتار',
        evidenceIds: ['EV_KETAB']
      });

      expect(() => {
        aggregator.analyzeCandidate(candidateGoftar, [obsKetab], interpreter);
      }).toThrow(/does not match candidate.*normalized form/);
    });
  });

  describe('5. Metadata Fingerprint Hardening & Deterministic Identity', () => {
    it('produces identical fingerprint regardless of tag array ordering', () => {
      const meta1: KaikkiEvidenceMetadata = {
        rawSourceWord: 'گفتار',
        normalizedForm: 'گفتار',
        lemmaStatus: 'LEMMA',
        sourceFormIndex: 0,
        ipaObservations: [],
        varietyTags: [],
        romanizationTags: ['Iranian-Persian', 'Tehrani'],
        sourceSenseIds: [],
        glosses: []
      };

      const meta2: KaikkiEvidenceMetadata = {
        ...meta1,
        romanizationTags: ['Tehrani', 'Iranian-Persian'] // reversed order
      };

      expect(computeMetadataFingerprint(meta1)).toBe(computeMetadataFingerprint(meta2));
    });

    it('produces different fingerprint and interpretation ID when profile tag changes', () => {
      const metaIranian: KaikkiEvidenceMetadata = {
        rawSourceWord: 'گفتار',
        normalizedForm: 'گفتار',
        lemmaStatus: 'LEMMA',
        sourceFormIndex: 0,
        ipaObservations: [],
        varietyTags: [],
        romanizationTags: ['Iranian-Persian'],
        sourceSenseIds: [],
        glosses: []
      };

      const metaClassical: KaikkiEvidenceMetadata = {
        ...metaIranian,
        romanizationTags: ['Classical-Persian']
      };

      const fpIranian = computeMetadataFingerprint(metaIranian);
      const fpClassical = computeMetadataFingerprint(metaClassical);
      expect(fpIranian).not.toBe(fpClassical);

      const idIranian = generateKaikkiInterpretationId({
        evidenceId: 'EV_1',
        sourceProfile: 'IRANIAN',
        sourceMetadataFingerprint: fpIranian,
        targetScheme: 'IJMES',
        interpreterVersion: '1.0.0',
        ruleSetVersion: '1.0.0',
        persianForm: 'گفتار',
        observedRomanization: 'goftâr'
      });

      const idClassical = generateKaikkiInterpretationId({
        evidenceId: 'EV_1',
        sourceProfile: 'CLASSICAL_DARI',
        sourceMetadataFingerprint: fpClassical,
        targetScheme: 'IJMES',
        interpreterVersion: '1.0.0',
        ruleSetVersion: '1.0.0',
        persianForm: 'گفتار',
        observedRomanization: 'guftār'
      });

      expect(idIranian).not.toBe(idClassical);
    });
  });

  describe('6. Read-Only Lexicon Evaluation & Metrics', () => {
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

  describe('7. End-to-End Pipeline on Phase 7B Sample Dataset', () => {
    it('processes sample JSONL fixtures and generates interpretation report with mandatory zero metrics', async () => {
      const connector = new KaikkiEvidenceConnector();
      const parseResult = await connector.processFile(PHASE7B_SAMPLE_FIXTURES_PATH, { strict: true });

      const candidates = parseResult.candidates ?? [];
      const observations = parseResult.observations ?? [];

      expect(candidates.length).toBeGreaterThan(0);
      expect(observations.length).toBeGreaterThan(0);

      const observationMap = new Map(observations.map((o) => [o.evidence.id, o]));
      const candidateAnalyses: KaikkiCandidateSchemeAnalysis[] = [];

      for (const candidate of candidates) {
        const candidateObservations: KaikkiExtractedObservation[] = [];
        for (const eId of candidate.evidenceIds) {
          const obs = observationMap.get(eId);
          if (obs) candidateObservations.push(obs);
        }
        const analysis = aggregator.analyzeCandidate(candidate, candidateObservations, interpreter);
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
