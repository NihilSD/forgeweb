/** The SQL harness makes psql print NULL as this sentinel (psql's CSV can't tell NULL from ''). */
export const SQL_NULL = '\u0001NULL\u0001';

/** Minimal RFC 4180 parser for `psql --csv` output; the NULL sentinel becomes null. */
export function parseCsv(text: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  let i = 0;
  const endField = () => {
    row.push(field === SQL_NULL && !wasQuoted ? null : field);
    field = '';
    wasQuoted = false;
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += ch;
      }
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      wasQuoted = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endField();
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
    i++;
  }
  if (field !== '' || wasQuoted || row.length) {
    endField();
    rows.push(row);
  }
  return rows;
}
