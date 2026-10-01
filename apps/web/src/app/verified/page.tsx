import type { AttemptStatus, Difficulty } from '@forge/shared';
import { Alert, Badge, EmptyState } from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DifficultyBadge } from '@/components/difficulty-badge';
import { AttemptStatusBadge } from '@/components/attempt-status-badge';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Verified challenges',
  description: 'Timed, recorded challenges that prove your skills.',
};

interface VerifiedList {
  items: {
    slug: string;
    title: string;
    difficulty: string;
    track: string;
    languages: string[];
    minutes: number;
    best: AttemptStatus | null;
  }[];
  remainingThisWeek: number | null;
  activeAttemptId: string | null;
}

export default async function VerifiedPage() {
  await requireMe();
  const res = await apiServer<VerifiedList>('/verified');
  if (!res || res.status !== 200)
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Alert variant="destructive">Could not load verified challenges.</Alert>
      </div>
    );
  const { items, remainingThisWeek, activeAttemptId } = res.data;
  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-4 py-10">
      <header className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Verified challenges</h1>
        <p className="text-muted-foreground">
          Solve a unique version of a problem under time, with your session recorded, then answer a
          few short questions about your code. Verified results are what employers see.
        </p>
        <p className="text-sm">
          {remainingThisWeek === null
            ? 'Unlimited verified challenges with Pro.'
            : `${remainingThisWeek} of 3 free starts left this week.`}{' '}
          <Link href="/attempts" className="underline">
            Your attempts
          </Link>
        </p>
      </header>
      {activeAttemptId ? (
        <Alert>
          You have an attempt in progress.{' '}
          <Link href={`/attempts/${activeAttemptId}`} className="font-medium underline">
            Return to it
          </Link>
        </Alert>
      ) : null}
      {items.length === 0 ? (
        <EmptyState title="No verified challenges yet" description="Check back soon." />
      ) : (
        <ul className="grid gap-3">
          {items.map((c) => (
            <li key={c.slug} className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
              <div className="grid gap-1">
                <Link href={`/verified/${c.slug}`} className="font-medium underline">
                  {c.title}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <DifficultyBadge difficulty={c.difficulty as Difficulty} />
                  <Badge variant="outline">{c.track}</Badge>
                  <span>{c.minutes} minutes</span>
                </div>
              </div>
              {c.best ? <AttemptStatusBadge status={c.best} className="ml-auto" /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
