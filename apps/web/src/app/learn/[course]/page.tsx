import { Badge, Button } from '@forge/ui';
import { CheckCircle2, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiServer } from '@/lib/api-server';

type CourseDetail = {
  slug: string;
  title: string;
  description: string;
  lessonCount: number;
  completedCount: number;
  lessons: { slug: string; title: string; order: number; completed: boolean; locked: boolean }[];
};

async function load(slug: string) {
  const res = await apiServer<CourseDetail>(`/courses/${encodeURIComponent(slug)}`);
  return res?.status === 200 ? res.data : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string }>;
}): Promise<Metadata> {
  const c = await load((await params).course);
  return { title: c?.title ?? 'Course' };
}

export default async function CoursePage({ params }: { params: Promise<{ course: string }> }) {
  const c = await load((await params).course);
  if (!c) notFound();
  const next = c.lessons.find((l) => !l.completed && !l.locked);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/learn" className="text-sm text-muted-foreground hover:underline">
        ← All courses
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{c.title}</h1>
      <p className="mt-1 text-muted-foreground">{c.description}</p>
      {next ? (
        <Button asChild className="mt-6">
          <Link href={`/learn/${c.slug}/${next.slug}`}>
            {c.completedCount ? 'Continue' : 'Start the course'}
          </Link>
        </Button>
      ) : null}
      <ol className="mt-8 grid gap-2">
        {c.lessons.map((l) => (
          <li key={l.slug}>
            <Link
              href={`/learn/${c.slug}/${l.slug}`}
              className="flex items-center gap-3 rounded-md border p-3 hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="w-6 text-sm text-muted-foreground">{l.order}.</span>
              <span className="font-medium">{l.title}</span>
              <span className="ml-auto flex items-center gap-2">
                {l.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-success" aria-label="Completed" />
                ) : null}
                {l.locked ? (
                  <Badge variant="outline">
                    <Lock className="mr-1 h-3 w-3" aria-hidden /> Pro
                  </Badge>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
