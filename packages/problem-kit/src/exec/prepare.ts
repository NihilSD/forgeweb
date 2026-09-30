import { transform } from 'esbuild';

export type PreparedSource =
  { ok: true; filename: string; source: string } | { ok: false; error: string };

/**
 * Turns submitted code into the file the harness loads. TypeScript is transpiled with esbuild
 * (spec 6.1: "a fast transpiler") outside the sandbox; esbuild only parses, never executes.
 * JavaScript gets a trailer that exposes the entry function to the harness.
 */
export async function prepareSource(
  language: string,
  code: string,
  entry: string | undefined,
): Promise<PreparedSource> {
  if (language === 'python') return { ok: true, filename: 'solution.py', source: code };
  if (language === 'sql') return { ok: true, filename: 'solution.sql', source: code };
  if (!entry) return { ok: false, error: 'No entry function configured.' };

  let js = code;
  if (language === 'typescript') {
    try {
      const out = await transform(code, {
        loader: 'ts',
        format: 'esm',
        target: 'es2022',
        sourcefile: 'solution.ts',
      });
      js = out.code;
    } catch (err) {
      const errors =
        (err as { errors?: { text: string; location?: { line: number } }[] }).errors ?? [];
      const msg = errors
        .map((e) => `${e.text}${e.location ? ` (line ${e.location.line})` : ''}`)
        .join('\n');
      return { ok: false, error: msg || 'TypeScript could not be compiled.' };
    }
  }
  const trailer = `\n;globalThis.__forgeEntry = typeof ${entry} !== 'undefined' ? ${entry} : undefined;\n`;
  return { ok: true, filename: 'solution.mjs', source: js + trailer };
}
