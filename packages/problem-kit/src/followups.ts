import { canonical } from './compare.js';
import { createRng } from './rng.js';
import type { FollowUpQuestion } from './schema.js';

/**
 * Line numbers (1-based) of `code` that a "change" question accepts: lines matching `pattern`
 * and not matching `exclude` (both regular expression sources, matched per line).
 */
export function matchingLines(code: string, pattern: string, exclude?: string): number[] {
  const re = new RegExp(pattern);
  const ex = exclude ? new RegExp(exclude) : null;
  const out: number[] = [];
  code.split(/\r?\n/).forEach((line, i) => {
    if (re.test(line) && !ex?.test(line)) out.push(i + 1);
  });
  return out;
}

const QUESTION_ID = /^[a-z0-9-]{1,40}$/;

/**
 * Static checks on the questions a package produces for a given solution: every question must be
 * answerable from that code. Returns human-readable problems (empty = fine).
 */
export function checkFollowUps(questions: FollowUpQuestion[], code: string): string[] {
  const errors: string[] = [];
  if (questions.length < 2) errors.push(`needs at least 2 follow-ups, got ${questions.length}`);
  const ids = new Set<string>();
  for (const q of questions) {
    const where = `follow-up "${q.id}"`;
    if (!QUESTION_ID.test(q.id)) errors.push(`${where}: id must match ${QUESTION_ID}`);
    if (ids.has(q.id)) errors.push(`${where}: duplicate id`);
    ids.add(q.id);
    if (!q.prompt.trim()) errors.push(`${where}: empty prompt`);
    const a = q.answer;
    if (a.type === 'static' && q.options && !q.options.includes(a.value))
      errors.push(`${where}: answer is not one of its options`);
    if (a.type === 'run' && !Array.isArray(a.args)) errors.push(`${where}: args must be an array`);
    if (a.type === 'run' && a.mode === 'passes' && q.options?.join() !== 'Yes,No')
      errors.push(`${where}: "passes" questions must offer exactly Yes / No`);
    if (a.type === 'lines') {
      if (q.kind !== 'change') errors.push(`${where}: line answers are for "change" questions`);
      try {
        if (matchingLines(code, a.pattern, a.exclude).length === 0)
          errors.push(`${where}: pattern matches no line of the solution`);
      } catch (err) {
        errors.push(`${where}: bad pattern (${(err as Error).message})`);
      }
    }
  }
  if (!questions.some((q) => q.kind === 'predict' || q.answer.type === 'run'))
    errors.push('at least one follow-up must be graded by running the code');
  return errors;
}

/** Probe test ids carry this prefix so they never mix with the package's own tests. */
export const PROBE_PREFIX = 'fu-';

/**
 * Spec 7.1: 2–3 follow-ups per attempt. Deterministic for a seed; always includes a question graded
 * by running the code, then prefers kinds not yet picked.
 */
export function selectFollowUps(
  questions: FollowUpQuestion[],
  seed: number,
  max = 3,
): FollowUpQuestion[] {
  const shuffled = createRng(seed).shuffle(questions);
  const picked: FollowUpQuestion[] = [];
  const run = shuffled.find((q) => q.answer.type === 'run');
  if (run) picked.push(run);
  for (const q of shuffled) {
    if (picked.length >= max) break;
    if (!picked.includes(q) && !picked.some((p) => p.kind === q.kind)) picked.push(q);
  }
  for (const q of shuffled) {
    if (picked.length >= max) break;
    if (!picked.includes(q)) picked.push(q);
  }
  return picked;
}

/** Extra tests that run the user's own code on the follow-up inputs (with the submission). */
export function probeTests(questions: FollowUpQuestion[]): { id: string; args: unknown[] }[] {
  return questions.flatMap((q) =>
    q.answer.type === 'run' ? [{ id: `${PROBE_PREFIX}${q.id}`, args: q.answer.args }] : [],
  );
}

export type FollowUpExpected =
  | { type: 'value'; value: unknown }
  | { type: 'choice'; value: string }
  | { type: 'lines'; lines: number[] };

export interface ProbeResult {
  status: string;
  value?: unknown;
}

/**
 * The accepted answer, from the user's own code. Null when the question can't be asked fairly
 * (the probe failed, or no line of their code matches a change question).
 */
export function expectedAnswer(
  q: FollowUpQuestion,
  code: string,
  probe: ProbeResult | undefined,
): FollowUpExpected | null {
  const a = q.answer;
  if (a.type === 'static') return { type: 'choice', value: a.value };
  if (a.type === 'lines') {
    const lines = matchingLines(code, a.pattern, a.exclude);
    return lines.length ? { type: 'lines', lines } : null;
  }
  if (!probe) return null;
  if (a.mode === 'value')
    return probe.status === 'ok' ? { type: 'value', value: probe.value } : null;
  const passes = probe.status === 'ok' && canonical(probe.value) === canonical(a.expected);
  return { type: 'choice', value: passes ? 'Yes' : 'No' };
}

/**
 * Reads a typed answer leniently: JSON, or Python-style literals (True/False/None, single quotes,
 * tuples). Anything else is kept as a plain string.
 */
export function parseLooseValue(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    // fall through
  }
  const py = t
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
    .replace(/'/g, '"')
    .replace(/\(/g, '[')
    .replace(/\)/g, ']')
    .replace(/,\s*([\]}])/g, '$1');
  try {
    return JSON.parse(py);
  } catch {
    return t;
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number')
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  return canonical(a) === canonical(b);
}

export function gradeFollowUp(expected: FollowUpExpected, answer: string): boolean {
  const given = answer.trim();
  if (expected.type === 'choice') return given.toLowerCase() === expected.value.toLowerCase();
  if (expected.type === 'lines') {
    const n = Number(given.replace(/^line\s*/i, ''));
    return Number.isInteger(n) && expected.lines.includes(n);
  }
  const value = parseLooseValue(given);
  if (sameValue(value, expected.value)) return true;
  // A string result typed without quotes.
  return typeof expected.value === 'string' && given.replace(/^["']|["']$/g, '') === expected.value;
}
