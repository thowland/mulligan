// A small RFC 4180 reader (spec §6.9): quoted fields with doubled quotes, line breaks inside
// quotes, CRLF or LF records. Excel's optional `sep=;` first line selects the delimiter.

export interface CsvTable {
  delimiter: string;
  rows: string[][];
}

export class CsvError extends Error {}

/**
 * Parses CSV text. The delimiter is `,` unless the file starts with an Excel `sep=X` line or the
 * header line contains semicolons but no commas (Excel in many European locales).
 */
export function parseCsv(text: string): CsvTable {
  let body = text;
  let delimiter = ',';
  const sep = /^sep=(.)\r?\n/.exec(body);
  if (sep) {
    delimiter = sep[1]!;
    body = body.slice(sep[0].length);
  } else {
    const header = body.slice(0, body.search(/\r?\n|$/));
    if (header.includes(';') && !header.includes(',')) delimiter = ';';
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let atFieldStart = true;
  let i = 0;
  while (i < body.length) {
    const char = body[i]!;
    if (quoted) {
      if (char === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        // After a closing quote only a delimiter or the end of the record may follow.
        const next = body[i];
        if (next !== undefined && next !== delimiter && next !== '\n' && next !== '\r') {
          throw new CsvError(
            `Unexpected character after a closing quote on line ${rows.length + 1}.`,
          );
        }
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
      i += 1;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = '';
      atFieldStart = true;
      i += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      atFieldStart = true;
      i += char === '\r' && body[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += char;
    atFieldStart = false;
    i += 1;
  }
  if (quoted) throw new CsvError('A quoted value is not closed before the end of the file.');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines carry no records.
  return { delimiter, rows: rows.filter((r) => !(r.length === 1 && r[0] === '')) };
}
