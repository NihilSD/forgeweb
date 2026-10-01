import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';
import { ConsentForm } from './consent-form';

export const metadata: Metadata = { title: 'Start a verified challenge' };

interface Item {
  slug: string;
  title: string;
  languages: string[];
  minutes: number;
}

export default async function ConsentPage({ params }: { params: Promise<{ slug: string }> }) {
  const me = await requireMe();
  const { slug } = await params;
  const res = await apiServer<{
    items: Item[];
    remainingThisWeek: number | null;
    activeAttemptId: string | null;
  }>('/verified');
  const item = res?.status === 200 ? res.data.items.find((i) => i.slug === slug) : undefined;
  if (!item || !res) notFound();
  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10">
      <header className="grid gap-1">
        <p className="text-sm text-muted-foreground">
          <Link href="/verified" className="underline">
            Verified challenges
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
        <p className="text-muted-foreground">
          You get {item.minutes} minutes. The timer starts as soon as you begin and keeps running if
          you leave.
        </p>
      </header>
      <ConsentForm
        slug={item.slug}
        languages={item.languages}
        preferred={me.languages}
        emailVerified={me.emailVerified}
        remaining={res.data.remainingThisWeek}
        activeAttemptId={res.data.activeAttemptId}
      />
    </div>
  );
}
