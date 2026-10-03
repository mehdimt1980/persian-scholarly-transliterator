import { LexicalEntry } from './types';

export interface LexiconIntegrityReport {
  valid: boolean;
  errors: string[];
}

export class LexiconIntegrityError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super(`Lexicon repository failed integrity validation with ${errors.length} error(s):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    this.name = 'LexiconIntegrityError';
    this.errors = errors;
  }
}

export class LexiconRepository {
  private readonly entriesById: Map<string, LexicalEntry> = new Map();
  private readonly entriesByNormalized: Map<string, LexicalEntry> = new Map();
  private readonly allEntries: LexicalEntry[];
  private readonly integrityReport: LexiconIntegrityReport;

  constructor(entries: LexicalEntry[]) {
    this.allEntries = [...entries];
    this.integrityReport = this.computeIntegrity();

    // Populate lookup indices only when integrity checks pass to prevent arbitrary first/last ordering authority
    if (this.integrityReport.valid) {
      for (const entry of this.allEntries) {
        this.entriesById.set(entry.id, entry);
        this.entriesByNormalized.set(entry.normalized, entry);
      }
    }
  }

  public assertValid(): void {
    if (!this.integrityReport.valid) {
      throw new LexiconIntegrityError(this.integrityReport.errors);
    }
  }

  public findById(id: string): LexicalEntry | undefined {
    this.assertValid();
    return this.entriesById.get(id);
  }

  public findByNormalized(normalized: string): LexicalEntry | undefined {
    this.assertValid();
    return this.entriesByNormalized.get(normalized);
  }

  public getAllEntries(): LexicalEntry[] {
    return [...this.allEntries];
  }

  public validateIntegrity(): LexiconIntegrityReport {
    return this.integrityReport;
  }

  private computeIntegrity(): LexiconIntegrityReport {
    const errors: string[] = [];
    const seenIds = new Set<string>();
    const seenNormalized = new Set<string>();

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
      } else if (seenNormalized.has(entry.normalized)) {
        errors.push(`Duplicate lexical entry normalized form "${entry.normalized}" detected; all readings for the same normalized form must reside inside a single LexicalEntry.`);
      } else {
        seenNormalized.add(entry.normalized);
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
