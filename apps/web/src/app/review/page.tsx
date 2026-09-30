import { Alert, Badge, Button, EmptyState } from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';

export const metadata: Metadata = { title: 'Review queue' };

type Item = { slug: string; title: string; stage: number; dueAt: string; due: boolean };

export default async function ReviewPage() {
  await requireMe();
  const res = await apiServer<{ items: Item[] } | { error: { code: string } }>('/me/review');
  const locked = res?.status === 402;
  const items = res?.status === 200 ? (res.data as { items: Item[] }).items : [];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Problems you struggled with come back after 2, 7 and 21 days, so they stick.
      </p>
      {locked ? (
        <Alert className="mt-6">
          The review queue is part of Forge Pro.{' '}
          <Link href="/pricing" className="underline">
            See Pro
          </Link>
        </Alert>
      ) : items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="Nothing to review"
          description="Problems you needed several tries or hints for will appear here."
          action={
            <Button asChild variant="outline">
              <Link href="/problems">Practise a problem</Link>
            </Button>
          }
        />
      ) : (
        <ul className="mt-6 grid gap-2">
          {items.map((i) => (
            <li key={i.slug} className="flex items-center gap-3 rounded-md border p-3">
              <Link href={`/problems/${i.slug}/solve`} className="font-medium hover:underline">
                {i.title}
              </Link>
              <span className="text-xs text-muted-foreground">review {i.stage + 1} of 3</span>
              <span className="ml-auto">
                {i.due ? (
                  <Badge variant="warning">Due now</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Due {new Date(i.dueAt).toLocaleDateString()}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
