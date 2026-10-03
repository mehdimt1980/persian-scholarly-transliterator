/**
 * RFC-4180 compliant CSV parser.
 * Handles quoted fields, embedded commas, embedded newlines (CRLF/LF), escaped quotes (""),
 * and UTF-8 BOM.
 */

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
  errors: string[];
}

export function parseCsvString(csvText: string): CsvParseResult {
  // Strip UTF-8 BOM if present
  let input = csvText;
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1);
  }

  const rows: string[][] = [];
  const errors: string[] = [];

  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = input.length;

  while (i < len) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && input[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < len && input[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (inQuotes) {
    errors.push('Unclosed quote in CSV data.');
  }

  // Push final field/row if present
  currentRow.push(currentField);
  if (currentRow.some((f) => f.length > 0)) {
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return {
      headers: [],
      rows: [],
      errors
    };
  }

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  return {
    headers,
    rows: dataRows,
    errors
  };
}
