const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]!))];
}

/** Fills {{name}} placeholders. Throws on a missing value so broken packages fail validation. */
export function render(template: string, params: Record<string, string | number>): string {
  return template.replace(PLACEHOLDER, (_, name: string) => {
    if (!(name in params)) throw new Error(`Unresolved placeholder {{${name}}}`);
    return String(params[name]);
  });
}

export interface Section {
  title: string;
  body: string;
}

/** Splits markdown on level-2 headings. */
export function sections(markdown: string): Section[] {
  const out: Section[] = [];
  let current: Section | null = null;
  for (const line of markdown.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (current) out.push(current);
      current = { title: m[1]!, body: '' };
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  if (current) out.push(current);
  return out.map((s) => ({ ...s, body: s.body.trim() }));
}

export const HINT_LEVELS = ['nudge', 'approach', 'pseudocode', 'solution'] as const;
export const EDITORIAL_SECTIONS = [
  'idea',
  'why it works',
  'complexity',
  'common mistakes',
] as const;

/** hints.md: exactly four `## ` sections named Nudge, Approach, Pseudocode, Solution (in order). */
export function parseHints(markdown: string): string[] {
  const s = sections(markdown);
  const names = s.map((x) => x.title.toLowerCase().replace(/^\d+[.)]\s*/, ''));
  if (s.length !== 4 || names.some((n, i) => n !== HINT_LEVELS[i])) {
    throw new Error(
      `hints.md must have exactly 4 sections: ${HINT_LEVELS.join(', ')} (found: ${names.join(', ') || 'none'})`,
    );
  }
  if (s.some((x) => x.body.length === 0)) throw new Error('hints.md has an empty level');
  return s.map((x) => x.body);
}

export function checkEditorial(markdown: string): void {
  const names = sections(markdown).map((x) => x.title.toLowerCase());
  const missing = EDITORIAL_SECTIONS.filter((n) => !names.includes(n));
  if (missing.length) throw new Error(`editorial.md is missing sections: ${missing.join(', ')}`);
}
