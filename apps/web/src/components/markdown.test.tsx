/**
 * Phase L12: user-supplied markdown (statements, notes, appeals, lessons) must never produce
 * executable HTML (CLAUDE.md: sanitize all user-generated markdown, no raw HTML rendering).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from './markdown';

const render = (md: string) => renderToStaticMarkup(<Markdown>{md}</Markdown>);

describe('Markdown sanitising', () => {
  const ATTACKS = [
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(1)">',
    '<svg onload=alert(1)>',
    '<iframe src="https://evil.example"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    '[click](javascript:alert(1))',
    '[click](JaVaScRiPt:alert(1))',
    '[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    '[click](vbscript:msgbox(1))',
    '![x](javascript:alert(1))',
    '[proto](//evil.example/path)',
    '<style>body{display:none}</style>',
    '<form action="https://evil.example"><input name=p></form>',
  ];

  for (const attack of ATTACKS) {
    it(`neutralises ${attack.slice(0, 40)}`, () => {
      const html = render(attack);
      expect(html).not.toMatch(/<script|<iframe|<svg|<style|<form|<input|onerror=|onload=/i);
      expect(html).not.toMatch(/href="(javascript|data|vbscript):/i);
      expect(html).not.toMatch(/src="(javascript|data):/i);
      expect(html).not.toMatch(/href="\/\//);
    });
  }

  it('keeps ordinary markdown, safe links and code', () => {
    const html = render('**bold** [docs](https://example.com) [rules](/security/rules)\n\n`a < b`');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('href="/security/rules"');
    expect(html).toContain('<code>a &lt; b</code>');
  });
});
