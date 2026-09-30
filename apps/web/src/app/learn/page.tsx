import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState } from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { apiServer } from '@/lib/api-server';

export const metadata: Metadata = {
  title: 'Learn',
  description: 'Short courses and pattern lessons with runnable exercises.',
};

type CourseSummary = {
  slug: string;
  title: string;
  description: string;
  kind: 'course' | 'patterns';
  lessonCount: number;
  completedCount: number;
};

export default async function LearnPage() {
  const res = await apiServer<{ items: CourseSummary[] }>('/courses');
  const items = res?.status === 200 ? res.data.items : [];
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Learn</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Short lessons, each with an exercise you run right on the page.
      </p>
      {items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No courses yet"
          description="Courses appear here once they are published."
        />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {items.map((c) => (
            <Link
              key={c.slug}
              href={`/learn/${c.slug}`}
              className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Card className="h-full transition-colors hover:border-primary/60">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>{c.title}</CardTitle>
                    {c.kind === 'patterns' ? <Badge variant="secondary">Patterns</Badge> : null}
                  </div>
                  <CardDescription>{c.description}</CardDescription>
                  <p className="pt-2 text-xs text-muted-foreground">
                    {c.completedCount}/{c.lessonCount} lessons completed
                  </p>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
