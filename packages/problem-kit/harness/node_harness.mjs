// Forge Node.js harness (JavaScript, and TypeScript after transpiling).
//
// Runs the user's function against each test and streams one result line per test to the real
// stdout, prefixed with a marker (user prints are captured separately). It never sees expected
// outputs: comparison happens outside, in the grader. An infinite synchronous loop cannot be
// interrupted from inside; the executor's progress watchdog kills the process and marks the test
// in progress as Time Limit.
//
// Usage: node node_harness.mjs <request.json> <solution.mjs>
import { readFileSync, writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

// Submitted code sees a minimal environment (base images set variables we don't need).
const KEEP_ENV = new Set(['PATH', 'LANG', 'HOME', 'NODE_ENV']);
for (const key of Object.keys(process.env)) if (!KEEP_ENV.has(key)) delete process.env[key];

const MARKER = '\x1eFORGE\x1f';
const [requestPath, solutionPath] = process.argv.slice(2);
const request = JSON.parse(readFileSync(requestPath, 'utf8'));
const writeLine = (line) => writeSync(1, MARKER + line + '\n');
const emit = (obj) => writeLine(JSON.stringify(obj));

function jsonable(value, depth = 0) {
  if (depth > 200) throw new Error('Value is nested too deeply');
  if (value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (value instanceof Set) return [...value].map((v) => jsonable(v, depth + 1));
  if (value instanceof Map)
    return Object.fromEntries([...value].map(([k, v]) => [String(k), jsonable(v, depth + 1)]));
  if (Array.isArray(value)) return value.map((v) => jsonable(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonable(v, depth + 1)]));
  }
  return value;
}

function shortError(err) {
  if (!(err instanceof Error)) return String(err).slice(0, 2000);
  const frames = (err.stack ?? '').split('\n').filter((l) => l.includes('solution.mjs'));
  return [`${err.name}: ${err.message}`, ...frames.slice(0, 4)].join('\n').slice(0, 2000);
}

let printed = '';
const write = (chunk) => {
  printed += typeof chunk === 'string' ? chunk : String(chunk);
  return true;
};
const format = (args) =>
  args.map((a) => (typeof a === 'string' ? a : (JSON.stringify(a) ?? String(a)))).join(' ');
const realWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = write;
console.log = (...args) => write(format(args) + '\n');
console.info = console.log;
console.warn = console.log;
console.error = console.log;
console.debug = console.log;

let fn;
try {
  await import(pathToFileURL(solutionPath).href);
  fn = globalThis.__forgeEntry;
} catch (err) {
  const type = err instanceof SyntaxError ? 'compile_error' : 'load_error';
  emit({ type, error: shortError(err) });
  process.exit(0);
}
if (typeof fn !== 'function') {
  emit({ type: 'load_error', error: `Define a function named ${request.entry}.` });
  process.exit(0);
}

const limitMs = request.limits.timeMs;
const outputLimit = request.limits.outputKb * 1024;
emit({ type: 'start' });

for (const test of request.tests) {
  printed = '';
  const started = performance.now();
  const result = { type: 'test', id: test.id };
  try {
    let value = fn(...structuredClone(test.args ?? []));
    if (value && typeof value.then === 'function') {
      value = await Promise.race([
        value,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(Object.assign(new Error('timeout'), { forgeTimeout: true })),
            limitMs,
          ),
        ),
      ]);
    }
    result.status = 'ok';
    result.value = jsonable(value);
  } catch (err) {
    if (err && err.forgeTimeout) result.status = 'time_limit';
    else if (err instanceof RangeError && /call stack/i.test(err.message)) {
      result.status = 'error';
      result.error = 'RangeError: Maximum call stack size exceeded';
    } else {
      result.status = 'error';
      result.error = shortError(err);
    }
  }
  result.timeMs = Math.round((performance.now() - started) * 1000) / 1000;
  if (printed.length > outputLimit) {
    result.status = 'output_limit';
    printed = printed.slice(0, 1000);
  }
  result.stdout = printed.slice(0, 4000);
  let line;
  try {
    line = JSON.stringify(result);
  } catch {
    delete result.value;
    result.status = 'error';
    result.error = 'Your function returned a value that cannot be converted to JSON.';
    line = JSON.stringify(result);
  }
  if (line.length > outputLimit + 8192) {
    line = JSON.stringify({
      type: 'test',
      id: test.id,
      status: 'output_limit',
      timeMs: result.timeMs,
    });
  }
  writeLine(line);
}
emit({ type: 'done' });
process.stdout.write = realWrite;
process.exit(0);
