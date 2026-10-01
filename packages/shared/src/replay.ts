import type { AttemptEvent, EditChange } from './schemas/attempts.js';

/**
 * Applies one edit event to a document. Monaco reports the changes of one event against the text
 * *before* the event, so they are applied from the highest offset down (non-overlapping ranges).
 * Returns null if a change does not fit the document (the log does not match the text).
 */
export function applyChanges(doc: string, changes: readonly EditChange[]): string | null {
  let out = doc;
  for (const c of [...changes].sort((a, b) => b.offset - a.offset)) {
    if (c.offset + c.length > out.length) return null;
    out = out.slice(0, c.offset) + c.text + out.slice(c.offset + c.length);
  }
  return out;
}

/** Rebuilds the editor text from the starter and the recorded edits (null if inconsistent). */
export function replayDocument(starter: string, events: readonly AttemptEvent[]): string | null {
  let doc: string | null = normalizeEol(starter);
  for (const e of events) {
    if (e.type !== 'edit' || doc === null) continue;
    doc = applyChanges(
      doc,
      e.changes.map((c) => ({ ...c, text: normalizeEol(c.text) })),
    );
  }
  return doc;
}

/** Editors may use CRLF on Windows; compare and replay with LF only. */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}
