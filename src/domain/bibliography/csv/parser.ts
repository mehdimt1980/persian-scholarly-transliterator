/**
 * Strict RFC-4180 compliant CSV parser.
 * Handles quoted fields, embedded commas, embedded newlines (CRLF/LF), escaped quotes (""),
 * UTF-8 BOM, and enforces strict quote placement rules.
 */

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
  errors: string[];
  warnings: string[];
}

type ParserState =
  | 'FIELD_START'
  | 'UNQUOTED_FIELD'
  | 'QUOTED_FIELD'
  | 'AFTER_CLOSING_QUOTE';

export function parseCsvString(csvText: string): CsvParseResult {
  let input = csvText;
  // Strip UTF-8 BOM if present
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1);
  }

  const rows: string[][] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  let state: ParserState = 'FIELD_START';
  let currentRow: string[] = [];
  let currentField = '';
  let line = 1;
  let col = 1;
  let fieldStartLine = 1;

  let i = 0;
  const len = input.length;

  const pushField = () => {
    currentRow.push(currentField);
    currentField = '';
    state = 'FIELD_START';
  };

  const pushRow = () => {
    pushField();
    // Only push if the row is not completely empty (e.g. trailing newline at end of file)
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].length > 0)) {
      rows.push(currentRow);
    }
    currentRow = [];
    state = 'FIELD_START';
  };

  while (i < len) {
    const char = input[i];

    if (state === 'FIELD_START') {
      fieldStartLine = line;
      if (char === '"') {
        state = 'QUOTED_FIELD';
        i++;
        col++;
        continue;
      } else if (char === ',') {
        pushField();
        i++;
        col++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < len && input[i + 1] === '\n') {
          i++;
        }
        pushRow();
        line++;
        col = 1;
        i++;
        continue;
      } else if (char === '\n') {
        pushRow();
        line++;
        col = 1;
        i++;
        continue;
      } else {
        state = 'UNQUOTED_FIELD';
        currentField += char;
        i++;
        col++;
        continue;
      }
    } else if (state === 'UNQUOTED_FIELD') {
      if (char === '"') {
        errors.push(`Unexpected quote character inside unquoted field at line ${line}, column ${col}.`);
        currentField += char;
        i++;
        col++;
        continue;
      } else if (char === ',') {
        pushField();
        i++;
        col++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < len && input[i + 1] === '\n') {
          i++;
        }
        pushRow();
        line++;
        col = 1;
        i++;
        continue;
      } else if (char === '\n') {
        pushRow();
        line++;
        col = 1;
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        col++;
        continue;
      }
    } else if (state === 'QUOTED_FIELD') {
      if (char === '"') {
        if (i + 1 < len && input[i + 1] === '"') {
          // Escaped quote ""
          currentField += '"';
          i += 2;
          col += 2;
          continue;
        } else {
          // Closing quote
          state = 'AFTER_CLOSING_QUOTE';
          i++;
          col++;
          continue;
        }
      } else {
        if (char === '\n') {
          line++;
          col = 1;
        } else if (char === '\r') {
          if (i + 1 < len && input[i + 1] === '\n') {
            i++;
          }
          line++;
          col = 1;
        } else {
          col++;
        }
        currentField += char;
        i++;
        continue;
      }
    } else if (state === 'AFTER_CLOSING_QUOTE') {
      if (char === ',') {
        pushField();
        i++;
        col++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < len && input[i + 1] === '\n') {
          i++;
        }
        pushRow();
        line++;
        col = 1;
        i++;
        continue;
      } else if (char === '\n') {
        pushRow();
        line++;
        col = 1;
        i++;
        continue;
      } else {
        errors.push(`Unexpected character "${char}" after closing quote at line ${line}, column ${col}.`);
        currentField += char;
        state = 'UNQUOTED_FIELD';
        i++;
        col++;
        continue;
      }
    }
  }

  if (state === 'QUOTED_FIELD') {
    errors.push(`Unclosed quote in CSV data starting at line ${fieldStartLine}.`);
  }

  // Push final trailing field and row if any
  if (state !== 'FIELD_START' || currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return {
      headers: [],
      rows: [],
      errors,
      warnings
    };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  // Validate row widths against header width
  for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
    const row = dataRows[rIdx];
    if (row.length !== headers.length) {
      warnings.push(`Row ${rIdx + 2} has ${row.length} columns, expected ${headers.length}.`);
    }
  }

  return {
    headers,
    rows: dataRows,
    errors,
    warnings
  };
}
