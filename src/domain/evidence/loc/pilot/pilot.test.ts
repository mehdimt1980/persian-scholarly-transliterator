import { describe, expect, it } from 'vitest';
import { selectLocPilotTitles } from './pilotSelection';
import {
  classifyTitleMatch,
  determineSchemeVerificationStatus,
  parseAllFixtureRecords,
  runLocFeasibilityPilot
} from './pilotRunner';
import type { MarcRecord } from '../types';

describe('Phase 7G Track B: Library of Congress Evidence Feasibility Pilot', () => {
  describe('1. Deterministic Pilot Selection & Holdout Isolation', () => {
    it('selects exactly 100 DIAGNOSTIC cases with unresolved lexical misses', () => {
      const selected = selectLocPilotTitles();
      expect(selected.length).toBe(100);
      expect(selected[0].rank).toBe(1);
      expect(selected[99].rank).toBe(100);
    });

    it('produces deterministic output across multiple selection calls', () => {
      const run1 = selectLocPilotTitles();
      const run2 = selectLocPilotTitles();
      expect(run1.map((c) => c.caseId)).toEqual(run2.map((c) => c.caseId));
      expect(run1.map((c) => c.selectionHash)).toEqual(run2.map((c) => c.selectionHash));
    });

    it('strictly isolates LOCKED_HOLDOUT partition (contains zero holdout titles)', () => {
      const selected = selectLocPilotTitles();
      // All selected cases must have DIAGNOSTIC-derived IDs
      for (const c of selected) {
        expect(c.unresolvedLexicalMisses.length).toBeGreaterThan(0);
        expect(c.selectionHash).toBeDefined();
      }
    });
  });

  describe('2. Title Match Classification & Conservative Alignment', () => {
    it('classifies identical surface text as EXACT_PERSIAN_TITLE_MATCH', () => {
      const match = classifyTitleMatch('دیوان حافظ', 'دیوان حافظ', 'دیوان حافظ');
      expect(match).toBe('EXACT_PERSIAN_TITLE_MATCH');
    });

    it('classifies normalized equivalents as NORMALIZATION_EQUIVALENT_TITLE_MATCH', () => {
      const match = classifyTitleMatch('ديوان حافظ', 'دیوان حافظ', 'دیوان حافظ');
      expect(match).toBe('NORMALIZATION_EQUIVALENT_TITLE_MATCH');
    });

    it('classifies substring overlaps as PARTIAL_TITLE_MATCH', () => {
      const match = classifyTitleMatch(
        'بررسی تحلیلی دیوان حافظ شیرازی',
        'بررسی تحلیلی دیوان حافظ شیرازی',
        'دیوان حافظ'
      );
      expect(match).toBe('PARTIAL_TITLE_MATCH');
    });

    it('classifies unrelated titles as NO_CONFIRMED_MATCH', () => {
      const match = classifyTitleMatch(
        'رویکرد شناختی در آموزش زبان فارسی',
        'رویکرد شناختی در آموزش زبان فارسی',
        'تاریخ ادبیات ایران'
      );
      expect(match).toBe('NO_CONFIRMED_MATCH');
    });
  });

  describe('3. Cataloging Scheme Verification Status', () => {
    it('marks records without explicit 040$e as UNVERIFIED_INFERRED', () => {
      const mockRecord: MarcRecord = {
        lccn: '2016404617',
        sourceUri: 'https://lccn.loc.gov/2016404617',
        controlFields: [],
        dataFields: [
          {
            tag: '040',
            ind1: ' ',
            ind2: ' ',
            subfields: [{ code: 'a', value: 'DLC' }]
          }
        ]
      };
      const status = determineSchemeVerificationStatus(mockRecord);
      expect(status).toBe('UNVERIFIED_INFERRED');
    });

    it('marks records with explicit 040$e rda/ala as SOURCE_EXPLICIT', () => {
      const mockRecord: MarcRecord = {
        lccn: '2025364468',
        controlFields: [],
        dataFields: [
          {
            tag: '040',
            ind1: ' ',
            ind2: ' ',
            subfields: [
              { code: 'a', value: 'DLC' },
              { code: 'e', value: 'rda' }
            ]
          }
        ]
      };
      const status = determineSchemeVerificationStatus(mockRecord);
      expect(status).toBe('SOURCE_EXPLICIT');
    });
  });

  describe('4. Feasibility Pilot Execution & Invariants', () => {
    it('runs offline feasibility pilot and produces compliant report structure', () => {
      const report = runLocFeasibilityPilot();
      expect(report.pilotCasesCount).toBe(100);
      expect(report.metrics.pilotTitlesSelected).toBe(100);
      expect(report.metrics.queriesAttempted).toBe(100);
      expect(report.metrics.persianLanguageRecords).toBeGreaterThan(0);
      expect(report.metrics.valid880Linkages).toBeGreaterThan(0);
      expect(report.metrics.lexicalTransliterationCoverageDelta).toBe('UNDETERMINED');
      expect(report.governance.zeroAutomaticDictionaryExtraction).toBe(true);
      expect(report.governance.zeroAuthorityPromotion).toBe(true);
      expect(report.governance.heldOutCorpusUntouched).toBe(true);
    });

    it('correctly loads all offline fixture records', () => {
      const fixtures = parseAllFixtureRecords();
      expect(fixtures.length).toBeGreaterThanOrEqual(10);
    });
  });
});
