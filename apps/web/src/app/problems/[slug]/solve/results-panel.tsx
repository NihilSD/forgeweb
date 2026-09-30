'use client';
import { type Submission, VERDICT_LABELS, type Verdict } from '@forge/shared';
import { Badge, EmptyState, Skeleton } from '@forge/ui';
import { CheckCircle2, Lock, XCircle } from 'lucide-react';

const VERDICT_VARIANT: Record<Verdict, 'success' | 'danger' | 'warning' | 'error'> = {
  accepted: 'success',
  wrong_answer: 'danger',
  time_limit: 'warning',
  memory_limit: 'warning',
  output_limit: 'warning',
  runtime_error: 'error',
  compile_error: 'error',
  internal_error: 'error',
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <Badge variant={VERDICT_VARIANT[verdict]} data-testid="verdict">
      {VERDICT_LABELS[verdict]}
    </Badge>
  );
}

const show = (v: unknown) =>
  typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v, null, 0);

function RowsTable({
  rows,
  columns,
  label,
}: {
  rows: unknown;
  columns?: string[] | undefined;
  label: string;
}) {
  if (!Array.isArray(rows)) return <code>{show(rows)}</code>;
  return (
    <div className="overflow-x-auto">
      <table className="text-xs" aria-label={label}>
        {columns ? (
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} className="border px-2 py-1 text-left font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {(rows as unknown[][]).slice(0, 50).map((r, i) => (
            <tr key={i}>
              {(Array.isArray(r) ? r : [r]).map((cell, j) => (
                <td key={j} className="border px-2 py-1 font-mono">
                  {cell === null ? (
                    <span className="text-muted-foreground">NULL</span>
                  ) : (
                    String(cell)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {(rows as unknown[]).length > 50 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Showing 50 of {(rows as unknown[]).length} rows.
        </p>
      ) : null}
    </div>
  );
}

export function ResultsPanel({
  result,
  pending,
  isSql,
}: {
  result: Submission | null;
  pending: 'run' | 'submit' | null;
  isSql: boolean;
}) {
  if (pending) {
    return (
      <div className="grid gap-2 p-4" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">
          {pending === 'run' ? 'Running your code…' : 'Submitting…'}
        </p>
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    );
  }
  if (!result) {
    return (
      <EmptyState
        className="m-4"
        title="No results yet"
        description="Run your code against the visible tests (Ctrl/⌘ + Enter) or submit it (Ctrl/⌘ + Shift + Enter)."
      />
    );
  }
  return (
    <div className="grid gap-3 p-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        {result.verdict ? <VerdictBadge verdict={result.verdict} /> : null}
        <span className="text-sm text-muted-foreground">
          {result.kind === 'submit' ? 'Submission' : 'Run'}
          {result.testsTotal !== null
            ? ` · ${result.testsPassed}/${result.testsTotal} tests passed`
            : ''}
          {result.runtimeMs !== null ? ` · ${result.runtimeMs} ms` : ''}
          {result.memoryKb !== null ? ` · ${Math.round(result.memoryKb / 1024)} MB` : ''}
        </span>
      </div>
      {result.verdict === 'internal_error' ? (
        <p className="text-sm">
          Something went wrong on our side. This result doesn&apos;t count against you. Please try
          again.
        </p>
      ) : null}
      {result.message ? (
        <pre
          className="whitespace-pre-wrap rounded-md border border-destructive/40 bg-muted p-3 font-mono text-xs"
          data-testid="result-message"
        >
          {result.message}
        </pre>
      ) : null}
      {result.customOutput ? (
        <div className="grid gap-2 rounded-md border p-3 text-sm">
          <div>
            <span className="text-muted-foreground">Returned: </span>
            <code className="font-mono" data-testid="custom-output">
              {show(result.customOutput.value)}
            </code>
          </div>
          {result.customOutput.stdout ? (
            <pre className="whitespace-pre-wrap font-mono text-xs">
              {result.customOutput.stdout}
            </pre>
          ) : null}
          {result.customOutput.error ? (
            <pre className="whitespace-pre-wrap font-mono text-xs text-destructive">
              {result.customOutput.error}
            </pre>
          ) : null}
        </div>
      ) : null}
      <ul className="grid gap-2">
        {result.tests.map((t) => (
          <li key={t.id} className="rounded-md border p-3 text-sm" data-testid="test-result">
            <div className="flex items-center gap-2">
              {t.passed ? (
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" aria-hidden />
              )}
              <span className="font-medium">{t.category}</span>
              {!t.visible ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" aria-hidden /> hidden test
                </span>
              ) : null}
              <span className="ml-auto text-xs text-muted-foreground">
                {t.passed ? 'passed' : VERDICT_LABELS[t.verdict]} · {t.timeMs} ms
              </span>
            </div>
            {t.visible && !t.passed ? (
              <div className="mt-2 grid gap-2 font-mono text-xs">
                {t.args && !isSql ? (
                  <div>input: {t.args.map((a) => show(a)).join(', ')}</div>
                ) : null}
                {isSql ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 font-sans text-muted-foreground">Expected</div>
                      <RowsTable rows={t.expected} label="Expected rows" />
                    </div>
                    <div>
                      <div className="mb-1 font-sans text-muted-foreground">Your result</div>
                      {'actual' in t ? (
                        <RowsTable rows={t.actual} columns={t.columns} label="Your rows" />
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-success">expected: {show(t.expected)}</div>
                    <div className="text-destructive">
                      received: {'actual' in t ? show(t.actual) : '—'}
                    </div>
                  </>
                )}
                {t.error ? (
                  <pre className="whitespace-pre-wrap text-destructive">{t.error}</pre>
                ) : null}
                {t.stdout ? (
                  <pre className="whitespace-pre-wrap text-muted-foreground">
                    stdout: {t.stdout}
                  </pre>
                ) : null}
              </div>
            ) : null}
            {t.visible && t.passed && isSql && 'actual' in t ? (
              <div className="mt-2">
                <RowsTable rows={t.actual} columns={t.columns} label="Your rows" />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
