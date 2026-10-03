import { LexicalEntry } from './types';

export interface LexiconIntegrityReport {
  valid: boolean;
  errors: string[];
}

export class LexiconRepository {
  private readonly entriesById: Map<string, LexicalEntry> = new Map();
  private readonly entriesByNormalized: Map<string, LexicalEntry[]> = new Map();
  private readonly allEntries: LexicalEntry[];

  constructor(entries: LexicalEntry[]) {
    this.allEntries = [...entries];
    for (const entry of this.allEntries) {
      if (this.entriesById.has(entry.id)) {
        console.warn(`Duplicate lexical entry ID detected during index construction: ${entry.id}`);
      }
      this.entriesById.set(entry.id, entry);

      const existingList = this.entriesByNormalized.get(entry.normalized) ?? [];
      existingList.push(entry);
      this.entriesByNormalized.set(entry.normalized, existingList);
    }
  }

  public findById(id: string): LexicalEntry | undefined {
    return this.entriesById.get(id);
  }

  public findByNormalized(normalized: string): LexicalEntry | undefined {
    const list = this.entriesByNormalized.get(normalized);
    return list && list.length > 0 ? list[0] : undefined;
  }

  public findAllByNormalized(normalized: string): LexicalEntry[] {
    return this.entriesByNormalized.get(normalized) ?? [];
  }

  public getAllEntries(): LexicalEntry[] {
    return [...this.allEntries];
  }

  public validateIntegrity(): LexiconIntegrityReport {
    const errors: string[] = [];
    const seenIds = new Set<string>();

    for (const entry of this.allEntries) {
      if (!entry.id || entry.id.trim() === '') {
        errors.push(`Lexical entry with surface "${entry.surface}" lacks a valid non-empty id.`);
      } else if (seenIds.has(entry.id)) {
        errors.push(`Duplicate lexical entry id "${entry.id}".`);
      } else {
        seenIds.add(entry.id);
      }

      if (!entry.surface || entry.surface.trim() === '') {
        errors.push(`Entry "${entry.id}" has empty surface form.`);
      }

      if (!entry.normalized || entry.normalized.trim() === '') {
        errors.push(`Entry "${entry.id}" has empty normalized form.`);
      }

      if (!entry.readings || entry.readings.length === 0) {
        errors.push(`Entry "${entry.id}" has no readings.`);
      } else {
        const seenCanonicals = new Set<string>();
        for (const reading of entry.readings) {
          if (!reading.canonical || reading.canonical.trim() === '') {
            errors.push(`Entry "${entry.id}" contains an empty canonical reading.`);
          } else if (seenCanonicals.has(reading.canonical)) {
            errors.push(`Entry "${entry.id}" has duplicate canonical reading "${reading.canonical}".`);
          } else {
            seenCanonicals.add(reading.canonical);
          }

          if (!reading.source && (!reading.sources || reading.sources.length === 0)) {
            errors.push(`Reading "${reading.canonical}" in entry "${entry.id}" lacks source citation metadata.`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
