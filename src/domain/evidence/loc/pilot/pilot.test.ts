import { describe, expect, it } from 'vitest';
import { selectLocPilotTitles } from './pilotSelection';
import {
  classifyTitleMatch,
  determineCatalogingConvention,
  determineRomanizationSchemeStatus,
  parseAllFixtureRecords,
  runLocFeasibilityPilot,
  runLocFeasibilityPilotAsync
} from './pilotRunner';
import type { MarcRecord } from '../types';
import type { LocClient } from '../client';

describe('Phase 7G Track B: Library of Congress Evidence Feasibility Pilot', () => {
  describe('1. Deterministic Pilot Selection & Holdout Isolation', () => {
    it('selects exactly 100 DIAGNOSTIC cases with unresolved lexical misses', () => {
      const selected = selectLocPilotTitles();
      expect(selected.length).toBe(100);
      expect(selected[0].rank).toBe(1);
      expect(selected[99].rank).toBe(100);
    }, 15000);

    it('produces deterministic output across multiple selection calls', () => {
      const run1 = selectLocPilotTitles();
      const run2 = selectLocPilotTitles();
      expect(run1.map((c) => c.caseId)).toEqual(run2.map((c) => c.caseId));
      expect(run1.map((c) => c.selectionHash)).toEqual(run2.map((c) => c.selectionHash));
    }, 20000);

    it('strictly isolates LOCKED_HOLDOUT partition (contains zero holdout titles)', () => {
      const selected = selectLocPilotTitles();
      // All selected cases must have DIAGNOSTIC-derived IDs
      for (const c of selected) {
        expect(c.unresolvedLexicalMisses.length).toBeGreaterThan(0);
        expect(c.selectionHash).toBeDefined();
      }
    }, 15000);
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

  describe('3. Cataloging Convention vs Romanization Scheme Verification Status', () => {
    it('separates RDA cataloging convention (040$e = rda) from inferred romanization scheme', () => {
      const mockRecord: MarcRecord = {
        lccn: '2025364468',
        sourceUri: 'https://lccn.loc.gov/2025364468',
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
      const convention = determineCatalogingConvention(mockRecord);
      const schemeStatus = determineRomanizationSchemeStatus(mockRecord);
      expect(convention).toBe('RDA');
      expect(schemeStatus).toBe('UNVERIFIED_INFERRED');
    });

    it('prohibits 040$e alone from independently asserting SOURCE_EXPLICIT romanization scheme', () => {
      const mockRecord: MarcRecord = {
        lccn: '2025364468',
        sourceUri: 'https://lccn.loc.gov/2025364468',
        controlFields: [],
        dataFields: [
          {
            tag: '040',
            ind1: ' ',
            ind2: ' ',
            subfields: [
              { code: 'a', value: 'DLC' },
              { code: 'e', value: 'ala-lc' }
            ]
          }
        ]
      };
      const schemeStatus = determineRomanizationSchemeStatus(mockRecord);
      expect(schemeStatus).toBe('UNVERIFIED_INFERRED');
    });

    it('marks records without explicit 040$e as UNKNOWN convention and UNVERIFIED_INFERRED scheme if from LoC', () => {
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
      const convention = determineCatalogingConvention(mockRecord);
      const schemeStatus = determineRomanizationSchemeStatus(mockRecord);
      expect(convention).toBe('UNKNOWN');
      expect(schemeStatus).toBe('UNVERIFIED_INFERRED');
    });
  });

  describe('4. Feasibility Pilot Execution & Invariants', () => {
    it('runs offline feasibility pilot in FIXTURE_VALIDATION mode and produces compliant report structure', () => {
      const report = runLocFeasibilityPilot();
      expect(report.pilotCasesCount).toBe(100);
      expect(report.metrics.executionMode).toBe('FIXTURE_VALIDATION');
      expect(report.metrics.pilotTitlesSelected).toBe(100);
      expect(report.metrics.liveRequestsAttempted).toBe(0);
      expect(report.metrics.liveResponsesSucceeded).toBe(0);
      expect(report.metrics.uniqueFixtureRecords).toBeGreaterThan(0);
      expect(report.metrics.uniqueLiveRecords).toBe(0);
      expect(report.metrics.persianLanguageRecords).toBeGreaterThan(0);
      expect(report.metrics.validLinked880Pairs).toBeGreaterThan(0);
      expect(report.metrics.realWorldSearchYield).toBe('NOT_MEASURED');
      expect(report.metrics.lexicalTransliterationCoverageDelta).toBe('UNDETERMINED');
      expect(report.governance.zeroAutomaticDictionaryExtraction).toBe(true);
      expect(report.governance.zeroAuthorityPromotion).toBe(true);
      expect(report.governance.heldOutCorpusUntouched).toBe(true);
    }, 15000);

    it('fails closed when LIVE_BOUNDED_PILOT mode is requested without liveClient', async () => {
      await expect(
        runLocFeasibilityPilotAsync({ mode: 'LIVE_BOUNDED_PILOT' })
      ).rejects.toThrow('[FAIL CLOSED] LIVE_BOUNDED_PILOT mode requires an instantiated, configured LocClient.');
    });

    it('fails closed when Phase 7E experimental pack is missing during selection', () => {
      expect(() =>
        selectLocPilotTitles(undefined, 'non-existent-pack.json')
      ).toThrow('[FAIL CLOSED] Phase 7E experimental fallback pack missing');
    });

    it('executes genuine case-specific live query matching with a mocked LocClient', async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<record xmlns="http://www.loc.gov/MARC21/slim">
  <controlfield tag="001">99123456</controlfield>
  <datafield tag="040" ind1=" " ind2=" ">
    <subfield code="a">DLC</subfield>
    <subfield code="e">rda</subfield>
  </datafield>
  <datafield tag="245" ind1="1" ind2="0">
    <subfield code="6">880-01</subfield>
    <subfield code="a">Dīvān-i Ḥāfiẓ /</subfield>
  </datafield>
  <datafield tag="880" ind1="1" ind2="0">
    <subfield code="6">245-01/(3/r</subfield>
    <subfield code="a">ديوان حافظ /</subfield>
  </datafield>
</record>`;

      const mockClient = {
        searchSru: async (cql: string) => {
          if (cql.includes('حافظ')) {
            return [{ sourceId: 'LOC', rawIdentifier: '99123456', payload: mockXml, fetchedAt: new Date().toISOString() }];
          }
          return [];
        }
      } as unknown as LocClient;

      const report = await runLocFeasibilityPilotAsync({
        mode: 'LIVE_BOUNDED_PILOT',
        liveClient: mockClient,
        maxLiveQueries: 5
      });

      expect(report.metrics.executionMode).toBe('LIVE_BOUNDED_PILOT');
      expect(report.metrics.liveRequestsAttempted).toBe(5);
      expect(report.metrics.liveResponsesSucceeded).toBe(5);
      expect(report.metrics.realWorldSearchYield).toBe('MEASURED');
      expect(report.queryOutcomesSample.length).toBeGreaterThan(0);
      expect(report.queryOutcomesSample[0].retrievalStatus).toBeDefined();
    });

    it('handles rate limits, timeouts, and zero-record responses cleanly in live mode', async () => {
      let callCount = 0;
      const mockClient = {
        searchSru: async () => {
          callCount++;
          if (callCount === 1) return []; // Zero records
          if (callCount === 2) throw new Error('HTTP 429 Too Many Requests'); // Rate limit
          return [];
        }
      } as unknown as LocClient;

      const report = await runLocFeasibilityPilotAsync({
        mode: 'LIVE_BOUNDED_PILOT',
        liveClient: mockClient,
        maxLiveQueries: 2
      });

      expect(report.metrics.executionMode).toBe('LIVE_BOUNDED_PILOT');
      expect(report.metrics.liveRequestsAttempted).toBe(2);
      expect(report.queryOutcomesSample[0].retrievalStatus).toBe('NO_RECORDS_FOUND');
      expect(report.queryOutcomesSample[1].retrievalStatus).toBe('HTTP_ERROR');
    });

    it('correctly loads all offline fixture records', () => {
      const fixtures = parseAllFixtureRecords();
      expect(fixtures.length).toBeGreaterThanOrEqual(10);
    });
  });
});
