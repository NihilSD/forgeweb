'use client';
import type { Attempt, FollowUpView } from '@forge/shared';
import { Alert, Button, Input, Label, cn } from '@forge/ui';
import { Timer } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiClientError } from '@/lib/api-client';
import { AttemptRecorder } from '@/lib/attempt-recorder';
import { formatClock, useCountdown, useSkew } from './use-clock';

/** Spec 7.1 step 5: 2–3 questions about the user's own code, 90 seconds each. */
export function FollowUps({
  attempt,
  onDone,
}: {
  attempt: Attempt;
  onDone: () => Promise<Attempt>;
}) {
  const [question, setQuestion] = useState<FollowUpView | null>(null);
  const skew = useSkew(attempt.serverNow);
  const [error, setError] = useState<string | null>(null);

  // Focus changes still count during the questions.
  const recorder = useMemo(
    () => new AttemptRecorder(attempt.id, Date.parse(attempt.startedAt) - skew),
    [attempt.id, attempt.startedAt, skew],
  );
  useEffect(() => {
    recorder.start();
    return () => {
      void recorder.flush();
      recorder.stop();
    };
  }, [recorder]);

  const next = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ question: FollowUpView | null }>(`/attempts/${attempt.id}/followup`);
      if (res.question) setQuestion(res.question);
      else {
        await recorder.flush();
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
        await onDone();
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load the next question.');
    }
  }, [attempt.id, onDone, recorder]);

  useEffect(() => {
    void next();
  }, [next]);

  return (
    <div className="mx-auto grid max-w-2xl gap-4 px-4 py-10" data-testid="follow-ups">
      <header className="grid gap-1">
        <p className="text-sm text-muted-foreground">{attempt.problemTitle} · Accepted</p>
        <h1 className="text-2xl font-semibold tracking-tight">A few questions about your code</h1>
        <p className="text-sm text-muted-foreground">
          Each question has 90 seconds. They are about the solution you just submitted.
        </p>
      </header>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {question ? (
        <Question
          key={question.id}
          attemptId={attempt.id}
          q={question}
          skew={skew}
          onAnswered={next}
        />
      ) : null}
    </div>
  );
}

function Question({
  attemptId,
  q,
  skew,
  onAnswered,
}: {
  attemptId: string;
  q: FollowUpView;
  skew: number;
  onAnswered: () => Promise<void>;
}) {
  const [answer, setAnswer] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = useCountdown(q.deadline, skew);

  useEffect(() => {
    // Out of time: the server records it as unanswered; move on.
    if (left === 0 && !pending) void onAnswered();
  }, [left, pending, onAnswered]);

  async function send() {
    if (!answer.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      await api(`/attempts/${attemptId}/followup`, {
        method: 'POST',
        body: { questionId: q.id, answer },
      });
      await onAnswered();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not send your answer.');
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-4 rounded-lg border p-4"
      data-testid="follow-up"
      data-kind={q.kind}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          Question {q.index} of {q.total}
        </span>
        <span
          className={cn(
            'ml-auto flex items-center gap-1 font-mono tabular-nums',
            left < 20_000 && 'text-verdict-wrong',
          )}
          role="timer"
          aria-label={`Time left ${formatClock(left)}`}
        >
          <Timer className="h-4 w-4" aria-hidden /> {formatClock(left)}
        </span>
      </div>
      <p className="font-medium" id={`q-${q.id}`}>
        {q.prompt}
      </p>
      {q.code ? (
        <NumberedCode code={q.code} onPick={(n) => setAnswer(String(n))} picked={answer} />
      ) : null}
      {q.options ? (
        <fieldset className="grid gap-2" aria-labelledby={`q-${q.id}`}>
          <legend className="sr-only">Choose one answer</legend>
          {q.options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`answer-${q.id}`}
                value={o}
                checked={answer === o}
                onChange={() => setAnswer(o)}
              />
              {o}
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="grid gap-1">
          <Label htmlFor={`answer-${q.id}`}>
            {q.kind === 'change' ? 'Line number' : 'Your answer'}
          </Label>
          <Input
            id={`answer-${q.id}`}
            value={answer}
            inputMode={q.kind === 'change' ? 'numeric' : 'text'}
            autoComplete="off"
            onChange={(e) => setAnswer(e.target.value)}
            className="font-mono"
          />
        </div>
      )}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button type="submit" className="w-fit" disabled={!answer.trim() || pending}>
        {pending ? 'Sending…' : 'Answer'}
      </Button>
    </form>
  );
}

function NumberedCode({
  code,
  onPick,
  picked,
}: {
  code: string;
  onPick: (n: number) => void;
  picked: string;
}) {
  return (
    <ol
      className="overflow-auto rounded-md border bg-muted/40 py-2 font-mono text-sm"
      aria-label="Your submitted code"
    >
      {code.split('\n').map((line, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => onPick(i + 1)}
            aria-label={`Line ${i + 1}: ${line.trim() || 'empty'}`}
            aria-pressed={picked === String(i + 1)}
            className={cn(
              'flex w-full gap-3 px-3 text-left hover:bg-accent',
              picked === String(i + 1) && 'bg-accent',
            )}
          >
            <span className="w-6 shrink-0 text-right text-muted-foreground">{i + 1}</span>
            <span className="whitespace-pre">{line || ' '}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
