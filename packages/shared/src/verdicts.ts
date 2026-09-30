/** Spec 6.2. The order is the precedence used when several tests fail differently. */
export const VERDICTS = [
  'accepted',
  'wrong_answer',
  'time_limit',
  'memory_limit',
  'output_limit',
  'runtime_error',
  'compile_error',
  'internal_error',
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABELS: Record<Verdict, string> = {
  accepted: 'Accepted',
  wrong_answer: 'Wrong Answer',
  time_limit: 'Time Limit',
  memory_limit: 'Memory Limit',
  output_limit: 'Output Limit',
  runtime_error: 'Runtime Error',
  compile_error: 'Compile Error',
  internal_error: 'Internal Error',
};

export interface Limits {
  timeMs: number;
  memoryMb: number;
  outputKb: number;
}

/** One unit of work for an executor (dev executor or sandboxed runner). */
export interface ExecTest {
  id: string;
  /** Function arguments for write-code / fix-code in general-purpose languages. */
  args?: unknown[];
  /** SQL: schema + data statements run before the user's query. Trusted (from the package). */
  setupSql?: string;
  /** Custom stdin-style input for "run with custom input" (arguments as JSON). */
}

export interface ExecRequest {
  language: 'python' | 'javascript' | 'typescript' | 'sql';
  code: string;
  /** Function to call (not used for SQL). */
  entry?: string;
  tests: ExecTest[];
  limits: Limits;
}

export type ExecStatus =
  | 'ok'
  | 'compile_error'
  | 'time_limit'
  | 'memory_limit'
  | 'output_limit'
  | 'runtime_error'
  | 'internal_error';

export interface ExecTestResult {
  id: string;
  /** Return value (JSON) or SQL rows (array of arrays of strings/null). */
  value?: unknown;
  /** SQL column names. */
  columns?: string[];
  error?: string;
  stdout?: string;
  timeMs: number;
  status: 'ok' | 'error' | 'time_limit' | 'memory_limit' | 'output_limit';
}

export interface ExecResult {
  status: ExecStatus;
  tests: ExecTestResult[];
  timeMs: number;
  memoryKb: number | null;
  message?: string;
}
