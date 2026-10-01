import { type EditChange, normalizeEol } from '@forge/shared';

/** 0-based offset of a 1-based (line, column) position in an LF-only document. */
export function lfOffset(doc: string, line: number, column: number): number {
  let offset = 0;
  for (let l = 1; l < line; l++) {
    const nl = doc.indexOf('\n', offset);
    if (nl === -1) return doc.length;
    offset = nl + 1;
  }
  return Math.min(doc.length, offset + column - 1);
}

interface MonacoChange {
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  text: string;
}

/**
 * Converts Monaco changes to offsets in the LF form of the document *before* the event. Monaco's
 * own offsets count CR characters when the model uses CRLF; line/column positions don't.
 */
export function toLfChanges(doc: string, changes: readonly MonacoChange[]): EditChange[] {
  return changes.map((c) => {
    const start = lfOffset(doc, c.range.startLineNumber, c.range.startColumn);
    const end = lfOffset(doc, c.range.endLineNumber, c.range.endColumn);
    return { offset: start, length: end - start, text: normalizeEol(c.text) };
  });
}
