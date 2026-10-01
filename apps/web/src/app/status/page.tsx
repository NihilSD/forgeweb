import { Alert } from '@forge/ui';
import type { Metadata } from 'next';
import { apiServer } from '@/lib/api-server';

export const metadata: Metadata = {
  title: 'Status',
  description: 'Whether Forge and its code runners are working right now.',
};

interface Status {
  api: 'ok';
  database: 'ok' | 'down';
  runners: 'ok' | 'down';
  time: string;
}

const ROWS: [keyof Omit<Status, 'time'>, string][] = [
  ['api', 'Website and API'],
  ['database', 'Accounts and progress'],
  ['runners', 'Running and grading code'],
];

export default async function StatusPage() {
  const res = await apiServer<Status>('/status');
  const status = res?.status === 200 ? res.data : null;
  const allOk = status && ROWS.every(([k]) => status[k] === 'ok');
  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Status</h1>
        <p className="text-muted-foreground">
          {status === null
            ? 'Forge is not reachable right now. We have been alerted.'
            : allOk
              ? 'Everything is working.'
              : 'Some parts of Forge are not working. We have been alerted.'}
        </p>
      </header>
      {status === null ? (
        <Alert variant="destructive">The API did not answer.</Alert>
      ) : (
        <ul className="grid divide-y rounded-lg border">
          {ROWS.map(([key, label]) => (
            <li key={key} className="flex items-center justify-between px-4 py-3">
              <span>{label}</span>
              <span
                className={
                  status[key] === 'ok'
                    ? 'font-medium text-emerald-700 dark:text-emerald-400'
                    : 'font-medium text-red-700 dark:text-red-400'
                }
              >
                {status[key] === 'ok' ? 'Working' : 'Down'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {status && (
        <p className="text-sm text-muted-foreground">
          Checked at{' '}
          <time dateTime={status.time}>{status.time.slice(0, 19).replace('T', ' ')}</time> UTC.
        </p>
      )}
    </div>
  );
}
