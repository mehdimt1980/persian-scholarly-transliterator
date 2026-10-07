/**
 * Metadata Observability Audit Runner for Phase 7E.
 *
 * Measures presence and cardinality of upstream Wiktextract fields across the dataset.
 */

import fs from 'node:fs';
import path from 'node:path';
import { forEachJsonlRow } from '../scale/stream';
import { extractRawRomanizations } from '../extractor';
import type { KaikkiRawEntry } from '../types';
import type { MetadataObservabilityAudit } from './types';
import { DISCRIMINATIVE_IRANIAN_VOWELS, DISCRIMINATIVE_CLASSICAL_VOWELS } from './signatures';

export class MetadataObservabilityAuditor {
  public async runAudit(inputFilePath: string): Promise<MetadataObservabilityAudit> {
    const resolvedPath = path.resolve(inputFilePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Audit input file not found: ${resolvedPath}`);
    }

    let totalPersianRecords = 0;
    let totalFormsCount = 0;
    let totalRomanizationObservations = 0;

    const formsTagsCardinality: Record<string, number> = {};
    const formsRawTagsCardinality: Record<string, number> = {};
    let formsWithSourceField = 0;
    let formsWithHeadNr = 0;

    let recordsWithSounds = 0;
    let totalSoundBlocks = 0;
    const soundTagsCardinality: Record<string, number> = {};
    const soundRawTagsCardinality: Record<string, number> = {};
    let soundsWithForm = 0;
    let soundsWithText = 0;
    let soundsWithNote = 0;

    let recordsWithHeadTemplates = 0;
    const headTemplateNamesCardinality: Record<string, number> = {};
    let recordsWithEtymologyTemplates = 0;

    let recordsWithSenses = 0;
    const sensesTagsCardinality: Record<string, number> = {};

    let recordsWith1Romanization = 0;
    let recordsWith2Romanizations = 0;
    let recordsWith3PlusRomanizations = 0;
    let pairedDiscriminatingCandidates = 0;

    let romanizationMatchesSoundForm = 0;
    let romanizationSharesHeadNrWithSound = 0;
    let headTemplateContainsExplicitRom = 0;

    await forEachJsonlRow(resolvedPath, (_rowNum, line) => {
      let record: KaikkiRawEntry;
      try {
        record = JSON.parse(line) as KaikkiRawEntry;
      } catch {
        return;
      }

      if (record.lang_code !== 'fa' && record.lang !== 'Persian') {
        return;
      }

      totalPersianRecords += 1;

      // 1. Forms audit
      const rawRoms = extractRawRomanizations(record);
      totalRomanizationObservations += rawRoms.length;

      if (rawRoms.length === 1) recordsWith1Romanization += 1;
      else if (rawRoms.length === 2) recordsWith2Romanizations += 1;
      else if (rawRoms.length >= 3) recordsWith3PlusRomanizations += 1;

      if (Array.isArray(record.forms)) {
        totalFormsCount += record.forms.length;
        for (const form of record.forms) {
          if (form.tags) {
            for (const t of form.tags) {
              formsTagsCardinality[t] = (formsTagsCardinality[t] ?? 0) + 1;
            }
          }
          if (form.raw_tags) {
            for (const t of form.raw_tags) {
              formsRawTagsCardinality[t] = (formsRawTagsCardinality[t] ?? 0) + 1;
            }
          }
          if (form.source) formsWithSourceField += 1;
          if (form.head_nr !== undefined) formsWithHeadNr += 1;
        }
      }

      // Check paired discriminating potential in multi-rom records
      if (rawRoms.length >= 2) {
        let hasIranianSig = false;
        let hasClassicalSig = false;
        for (const r of rawRoms) {
          const val = r.value.toLowerCase();
          for (const v of DISCRIMINATIVE_IRANIAN_VOWELS) {
            if (val.includes(v)) hasIranianSig = true;
          }
          for (const v of DISCRIMINATIVE_CLASSICAL_VOWELS) {
            if (val.includes(v)) hasClassicalSig = true;
          }
        }
        if (hasIranianSig && hasClassicalSig) {
          pairedDiscriminatingCandidates += 1;
        }
      }

      // 2. Sounds audit
      if (Array.isArray(record.sounds) && record.sounds.length > 0) {
        recordsWithSounds += 1;
        totalSoundBlocks += record.sounds.length;

        const soundForms = new Set<string>();
        for (const sound of record.sounds) {
          if (sound.tags) {
            for (const t of sound.tags) {
              soundTagsCardinality[t] = (soundTagsCardinality[t] ?? 0) + 1;
            }
          }
          if (sound.raw_tags) {
            for (const t of sound.raw_tags) {
              soundRawTagsCardinality[t] = (soundRawTagsCardinality[t] ?? 0) + 1;
            }
          }
          if ((sound as any).form) {
            soundsWithForm += 1;
            soundForms.add(String((sound as any).form).toLowerCase().trim());
          }
          if (sound.text) soundsWithText += 1;
          if (sound.note) soundsWithNote += 1;
        }

        // Linkage check: do romanizations match sound.form?
        for (const r of rawRoms) {
          if (soundForms.has(r.value.toLowerCase().trim())) {
            romanizationMatchesSoundForm += 1;
          }
        }
      }

      // 3. Head & Etymology Templates
      if (Array.isArray(record.head_templates) && record.head_templates.length > 0) {
        recordsWithHeadTemplates += 1;
        for (const tmpl of record.head_templates) {
          if (tmpl && typeof tmpl === 'object' && 'name' in tmpl) {
            const name = String((tmpl as any).name);
            headTemplateNamesCardinality[name] = (headTemplateNamesCardinality[name] ?? 0) + 1;

            // Check if template contains tr or transliteration
            if ('args' in tmpl && tmpl.args && typeof tmpl.args === 'object') {
              const args = tmpl.args as Record<string, unknown>;
              if (args.tr || args.tr2 || args.cls || args.ira) {
                headTemplateContainsExplicitRom += 1;
              }
            }
          }
        }
      }

      if (Array.isArray(record.etymology_templates) && record.etymology_templates.length > 0) {
        recordsWithEtymologyTemplates += 1;
      }

      // 4. Senses audit
      if (Array.isArray(record.senses) && record.senses.length > 0) {
        recordsWithSenses += 1;
        for (const s of record.senses) {
          if (s.tags) {
            for (const t of s.tags) {
              sensesTagsCardinality[t] = (sensesTagsCardinality[t] ?? 0) + 1;
            }
          }
        }
      }
    });

    const totalMultiRomanizationRecords = recordsWith2Romanizations + recordsWith3PlusRomanizations;

    return {
      totalPersianRecords,
      totalFormsCount,
      totalRomanizationObservations,
      formsTagsCardinality,
      formsRawTagsCardinality,
      formsWithSourceField,
      formsWithHeadNr,
      recordsWithSounds,
      totalSoundBlocks,
      soundTagsCardinality,
      soundRawTagsCardinality,
      soundsWithForm,
      soundsWithText,
      soundsWithNote,
      recordsWithHeadTemplates,
      headTemplateNamesCardinality,
      recordsWithEtymologyTemplates,
      recordsWithSenses,
      sensesTagsCardinality,
      multiRomanizationCohort: {
        recordsWith1Romanization,
        recordsWith2Romanizations,
        recordsWith3PlusRomanizations,
        totalMultiRomanizationRecords,
        pairedDiscriminatingCandidates
      },
      structuralLinkagePotentials: {
        romanizationMatchesSoundForm,
        romanizationSharesHeadNrWithSound,
        headTemplateContainsExplicitRom
      }
    };
  }
}
