import type { Daily } from '@forge/shared';
import { Alert } from '@forge/ui';
import type { Metadata } from 'next';
import { DailyList } from '@/components/daily/daily-list';
import { apiServer } from '@/lib/api-server';

export const metadata: Metadata = {
  title: 'Daily challenge',
  description: 'One problem per track, every day.',
};

export default async function DailyPage() {
  const res = await apiServer<Daily>('/daily');
  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-10">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Daily challenge</h1>
        <p className="text-muted-foreground">
          One problem per track, the same for everyone, with your own instance. A new set starts at
          00:00 UTC.
        </p>
      </header>
      {res?.status === 200 ? (
        <>
          <p className="text-sm text-muted-foreground">
            Challenges for <time dateTime={res.data.date}>{res.data.date}</time> (UTC)
          </p>
          <DailyList daily={res.data} />
        </>
      ) : (
        <Alert variant="destructive">Could not load today&apos;s challenges.</Alert>
      )}
    </div>
  );
}
