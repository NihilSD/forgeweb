import type { Lesson } from '@forge/shared';
import { Alert, Button } from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiServer } from '@/lib/api-server';
import { getMe } from '@/lib/session';
import { LessonView } from './lesson-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string; lesson: string }>;
}): Promise<Metadata> {
  const { lesson } = await params;
  return { title: lesson.replace(/-/g, ' ') };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ course: string; lesson: string }>;
}) {
  const { course, lesson } = await params;
  const [res, me] = await Promise.all([
    apiServer<Lesson | { error: { code: string; message: string } }>(
      `/courses/${encodeURIComponent(course)}/lessons/${encodeURIComponent(lesson)}`,
    ),
    getMe(),
  ]);
  if (res?.status === 402) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Alert>This lesson is part of Forge Pro. The first lessons of every course are free.</Alert>
        <div className="mt-4 flex gap-2">
          <Button asChild>
            <Link href="/pricing">See Pro</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/learn/${course}`}>Back to the course</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (!res || res.status !== 200) notFound();
  return <LessonView lesson={res.data as Lesson} signedIn={Boolean(me)} />;
}
