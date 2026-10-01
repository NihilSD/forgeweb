'use client';
import type { PlacementQuiz } from '@forge/shared';
import { Alert, Button } from '@forge/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api-client';

interface Result {
  score: number;
  total: number;
  tags: { tag: string; correct: boolean }[];
}

export function PlacementForm({ questions }: { questions: PlacementQuiz['questions'] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      setResult(await api<Result>('/placement', { method: 'POST', body: { answers } }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not send your answers.');
    } finally {
      setPending(false);
    }
  }

  async function skip() {
    await api('/placement/skip', { method: 'POST' }).catch(() => undefined);
    router.push('/dashboard');
  }

  if (result) {
    const strong = [...new Set(result.tags.filter((t) => t.correct).map((t) => t.tag))];
    return (
      <div className="grid gap-4" data-testid="placement-result">
        <p className="text-lg font-medium">
          {result.score} of {result.total} correct
        </p>
        <p className="text-sm">
          {strong.length
            ? `Starting level 1 set for: ${strong.join(', ')}.`
            : 'No starting levels set. Everything starts from the beginning.'}
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/dashboard">Go to your dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/skills">See your skill map</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <ol className="grid gap-6">
        {questions.map((q, i) => (
          <li key={q.id}>
            <fieldset className="grid gap-2">
              <legend className="font-medium">
                {i + 1}. {q.prompt}
              </legend>
              {q.options.map((o, idx) => (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === idx}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: idx }))}
                  />
                  <span className="font-mono">{o}</span>
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ol>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Checking…' : 'See my starting level'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void skip()}>
          Skip the quiz
        </Button>
      </div>
    </form>
  );
}
