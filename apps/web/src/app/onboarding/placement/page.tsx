import type { PlacementQuiz } from '@forge/shared';
import { Alert } from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';
import { PlacementForm } from './placement-form';

export const metadata: Metadata = { title: 'Placement quiz' };

export default async function PlacementPage() {
  await requireMe();
  const res = await apiServer<PlacementQuiz>('/placement');
  const quiz = res?.status === 200 ? res.data : null;
  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Find your starting level</h1>
        <p className="text-muted-foreground">
          10 short questions. Right answers set a starting level on your skill map, so
          recommendations fit you. It isn&apos;t a test: skip anything you don&apos;t know.
        </p>
      </header>
      {!quiz || quiz.questions.length === 0 ? (
        <Alert>The placement quiz isn&apos;t available yet.</Alert>
      ) : quiz.status !== 'none' ? (
        <Alert>
          You&apos;ve already {quiz.status === 'taken' ? 'taken' : 'skipped'} the placement quiz.{' '}
          <Link href="/skills" className="underline">
            See your skill map
          </Link>
        </Alert>
      ) : (
        <PlacementForm questions={quiz.questions} />
      )}
    </div>
  );
}
