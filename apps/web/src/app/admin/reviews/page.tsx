import type { AttemptStatus } from '@forge/shared';
import { Alert, EmptyState } from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AttemptStatusBadge } from '@/components/attempt-status-badge';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';

export const metadata: Metadata = { title: 'Admin · Reviews' };

interface Item {
  attemptId: string;
  user: string;
  problemTitle: string;
  status: AttemptStatus;
  integrityScore: number | null;
  appealReason: string | null;
  submittedAt: string | null;
}

export default async function ReviewQueuePage() {
  const me = await requireMe();
  if (me.role !== 'moderator' && me.role !== 'superadmin') redirect('/dashboard');
  const res = await apiServer<{ items: Item[]; error?: { message: string } }>(
    '/admin/attempts/queue',
  );
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
        <p className="text-sm text-muted-foreground">
          Attempts scored below 40 and appeals. Watch the replay, then decide.
        </p>
      </header>
      {res?.status !== 200 ? (
        <Alert variant="destructive">
          {res?.data.error?.message ?? 'Could not load the queue.'}
        </Alert>
      ) : res.data.items.length === 0 ? (
        <EmptyState title="Nothing to review" description="New reviews and appeals appear here." />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Attempt</th>
              <th className="font-medium">User</th>
              <th className="font-medium">Status</th>
              <th className="font-medium">Score</th>
              <th className="font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {res.data.items.map((i) => (
              <tr key={i.attemptId} className="border-t">
                <td className="py-2">
                  <Link href={`/admin/reviews/${i.attemptId}`} className="underline">
                    {i.problemTitle}
                  </Link>
                  {i.appealReason ? (
                    <p className="line-clamp-1 text-xs text-muted-foreground">{i.appealReason}</p>
                  ) : null}
                </td>
                <td>{i.user}</td>
                <td>
                  <AttemptStatusBadge status={i.status} />
                </td>
                <td>{i.integrityScore ?? '—'}</td>
                <td>{i.submittedAt ? i.submittedAt.slice(0, 16).replace('T', ' ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
