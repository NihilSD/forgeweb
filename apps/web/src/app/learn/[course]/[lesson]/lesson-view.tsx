'use client';
import type { Lesson } from '@forge/shared';
import { Alert, Button } from '@forge/ui';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { LessonBody } from '@/components/lesson/lesson-body';
import { api, ApiClientError } from '@/lib/api-client';

export function LessonView({ lesson, signedIn }: { lesson: Lesson; signedIn: boolean }) {
  const [solved, setSolved] = useState<Record<string, boolean>>(
    Object.fromEntries(lesson.exercises.map((e) => [e.slug, e.solved])),
  );
  const [completed, setCompleted] = useState(lesson.completed);
  const [error, setError] = useState<string | null>(null);
  const allSolved = lesson.exercises.every((e) => solved[e.slug]);

  async function complete() {
    setError(null);
    try {
      await api(`/courses/${lesson.courseSlug}/lessons/${lesson.slug}/complete`, {
        method: 'POST',
      });
      setCompleted(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href={`/learn/${lesson.courseSlug}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {lesson.courseTitle}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {lesson.order}. {lesson.title}
      </h1>
      <div className="mt-6">
        <LessonBody
          body={lesson.body}
          signedIn={signedIn}
          solved={solved}
          onSolved={(slug) => setSolved((s) => ({ ...s, [slug]: true }))}
        />
      </div>
      <div className="mt-8 grid gap-3 border-t pt-6">
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {completed ? (
          <p className="flex items-center gap-2 text-success" data-testid="lesson-completed">
            <CheckCircle2 className="h-5 w-5" aria-hidden /> Lesson completed
          </p>
        ) : signedIn ? (
          <Button className="w-fit" onClick={() => void complete()} disabled={!allSolved}>
            Mark lesson complete
          </Button>
        ) : null}
        {!completed && !allSolved && signedIn ? (
          <p className="text-sm text-muted-foreground">
            Solve the exercise to complete this lesson.
          </p>
        ) : null}
        <nav className="flex justify-between text-sm" aria-label="Lesson navigation">
          {lesson.previous ? (
            <Link href={`/learn/${lesson.courseSlug}/${lesson.previous}`} className="underline">
              ← Previous lesson
            </Link>
          ) : (
            <span />
          )}
          {lesson.next ? (
            <Link href={`/learn/${lesson.courseSlug}/${lesson.next}`} className="underline">
              Next lesson →
            </Link>
          ) : null}
        </nav>
      </div>
    </article>
  );
}
