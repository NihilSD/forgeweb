import type { AttemptStatus } from '@forge/shared';
import { EmptyState } from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AttemptStatusBadge } from '@/components/attempt-status-badge';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';

export const metadata: Metadata = { title: 'Your verified attempts' };

interface Item {
  id: string;
  problemTitle: string;
  status: AttemptStatus;
  startedAt: string;
  integrityScore: number | null;
}

export default async function AttemptsPage() {
  await requireMe();
  const res = await apiServer<{ items: Item[] }>('/attempts');
  const items = res?.status === 200 ? res.data.items : [];
  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Your verified attempts</h1>
      {items.length === 0 ? (
        <EmptyState
          title="No attempts yet"
          description="Verified challenges prove your skills to employers."
          action={
            <Link href="/verified" className="underline">
              Browse verified challenges
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-2">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <Link href={`/attempts/${a.id}`} className="font-medium underline">
                {a.problemTitle}
              </Link>
              <time className="text-xs text-muted-foreground" dateTime={a.startedAt}>
                {new Date(a.startedAt).toUTCString().slice(5, 22)} UTC
              </time>
              <AttemptStatusBadge status={a.status} className="ml-auto" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
