/**
 * Streaming parser and validation filter for Kaikki / Wiktextract Persian JSONL records.
 *
 * Implements line-oriented streaming without loading entire datasets into memory.
 * Fails individual malformed rows safely while tracking malformed row counts.
 */

import readline from 'node:readline';
import type { Readable } from 'node:stream';
import type { KaikkiParseOptions, KaikkiRawEntry, KaikkiRecordParseResult } from './types';

/**
 * Regex matching Persian/Arabic script unicode ranges.
 */
const PERSIAN_SCRIPT_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Non-spacing diacritics / combining marks in Arabic/Persian blocks.
 */
const COMBINING_MARKS_REGEX = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/**
 * Punctuation, symbols, and whitespace.
 */
const PUNCT_AND_SYMBOLS_REGEX = /[\s\p{P}\p{S}،؛؟ـ«»‹›]/gu;

export class KaikkiParseError extends Error {
  public readonly lineNumber: number;
  public readonly rawLine: string;

  constructor(lineNumber: number, rawLine: string, message: string) {
    super(`[KaikkiParser Line ${lineNumber}] ${message}`);
    this.name = 'KaikkiParseError';
    this.lineNumber = lineNumber;
    this.rawLine = rawLine;
  }
}

/**
 * Assess whether a parsed raw object represents a valid Persian lexical entry.
 *
 * Rejection criteria:
 * - Missing lang_code or lang_code !== 'fa'
 * - Missing or empty word
 * - Non-Persian script characters
 * - Punctuation-only / symbols-only entries
 * - Isolated combining marks
 */
export function validatePersianEntry(raw: unknown): { isPersian: boolean; reason?: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { isPersian: false, reason: 'Record is not an object' };
  }

  const record = raw as Record<string, unknown>;

  if (typeof record.word !== 'string' || record.word.trim().length === 0) {
    return { isPersian: false, reason: 'Record word is missing or empty' };
  }

  const word = record.word.trim();

  if (record.lang_code !== undefined && record.lang_code !== 'fa') {
    return { isPersian: false, reason: `Language code "${record.lang_code}" is not "fa"` };
  }

  if (record.lang !== undefined && typeof record.lang === 'string' && record.lang.toLowerCase() !== 'persian' && record.lang_code !== 'fa') {
    return { isPersian: false, reason: `Language name "${record.lang}" is not Persian` };
  }

  // Must contain Persian script characters
  if (!PERSIAN_SCRIPT_CHAR_REGEX.test(word)) {
    return { isPersian: false, reason: 'Word does not contain Persian script characters' };
  }

  // Strip combining diacritics and punctuation to ensure genuine base characters exist
  const stripped = word.replace(COMBINING_MARKS_REGEX, '').replace(PUNCT_AND_SYMBOLS_REGEX, '');
  if (stripped.length === 0) {
    return { isPersian: false, reason: 'Word consists entirely of combining marks or punctuation' };
  }

  return { isPersian: true };
}

/**
 * Parse a single JSONL line into a KaikkiRecordParseResult.
 */
export function parseRawKaikkiLine(
  line: string,
  lineNumber: number,
  options?: { strict?: boolean }
): KaikkiRecordParseResult {
  const trimmed = line.trim();
  if (!trimmed) {
    return {
      success: false,
      rawLine: line,
      lineNumber,
      isPersian: false,
      rejectionReason: 'Empty line'
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (options?.strict) {
      throw new KaikkiParseError(lineNumber, line, `Malformed JSON: ${message}`);
    }
    return {
      success: false,
      rawLine: line,
      lineNumber,
      error: `Malformed JSON: ${message}`,
      isPersian: false
    };
  }

  const check = validatePersianEntry(parsed);
  if (!check.isPersian) {
    return {
      success: false,
      rawLine: line,
      lineNumber,
      isPersian: false,
      rejectionReason: check.reason
    };
  }

  const entry = parsed as KaikkiRawEntry;
  return {
    success: true,
    entry,
    rawLine: line,
    lineNumber,
    isPersian: true
  };
}

/**
 * Stream-parse Kaikki JSONL from a Readable stream line by line.
 * Offset counts valid Persian records, ignoring malformed or non-Persian lines.
 */
export async function* parseKaikkiJsonlStream(
  stream: Readable,
  options?: KaikkiParseOptions
): AsyncGenerator<KaikkiRecordParseResult, void, unknown> {
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  let validPersianCount = 0;
  let yieldedValidCount = 0;
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? Infinity;

  for await (const line of rl) {
    lineNumber += 1;
    if (!line.trim()) continue;

    const result = parseRawKaikkiLine(line, lineNumber, { strict: options?.strict });

    if (!result.success || !result.isPersian) {
      yield result;
      continue;
    }

    validPersianCount += 1;
    if (offset > 0 && validPersianCount <= offset) {
      continue;
    }

    yield result;
    yieldedValidCount += 1;
    if (yieldedValidCount >= limit) {
      break;
    }
  }
}
