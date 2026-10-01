import { applyChanges } from '@forge/shared';
import { describe, expect, it } from 'vitest';
import { lfOffset, toLfChanges } from './edit-offsets';

const range = (sl: number, sc: number, el: number, ec: number) => ({
  startLineNumber: sl,
  startColumn: sc,
  endLineNumber: el,
  endColumn: ec,
});

describe('attempt recorder offsets', () => {
  it('maps line/column positions to LF offsets', () => {
    const doc = 'ab\ncde\n\nf';
    expect(lfOffset(doc, 1, 1)).toBe(0);
    expect(lfOffset(doc, 2, 2)).toBe(4);
    expect(lfOffset(doc, 3, 1)).toBe(7);
    expect(lfOffset(doc, 4, 2)).toBe(9);
  });

  it('records CRLF editor changes so an LF replay reproduces the text', () => {
    let doc = 'def f():\n    pass\n';
    // Monaco with CRLF: insert two lines at the end of line 1, text uses \r\n.
    const changes = toLfChanges(doc, [{ range: range(1, 9, 1, 9), text: '\r\n    x = 1\r\n' }]);
    doc = applyChanges(doc, changes)!;
    expect(doc).toBe('def f():\n    x = 1\n\n    pass\n');
    // Replace "pass" on line 4.
    doc = applyChanges(doc, toLfChanges(doc, [{ range: range(4, 5, 4, 9), text: 'return x' }]))!;
    expect(doc).toBe('def f():\n    x = 1\n\n    return x\n');
  });

  it('handles several changes in one event against the old document', () => {
    const doc = 'a\nb\nc\n';
    const changes = toLfChanges(doc, [
      { range: range(3, 1, 3, 1), text: '# ' },
      { range: range(1, 1, 1, 1), text: '# ' },
    ]);
    expect(applyChanges(doc, changes)).toBe('# a\nb\n# c\n');
  });
});
