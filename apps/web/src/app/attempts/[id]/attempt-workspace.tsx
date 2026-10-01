'use client';
import type { Attempt, Submission } from '@forge/shared';
import { Alert, Button, cn } from '@forge/ui';
import { Maximize, Play, Send, Timer } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ResultsPanel } from '@/app/problems/[slug]/solve/results-panel';
import { CodeEditor, type StandaloneEditor } from '@/components/editor/code-editor';
import { Markdown } from '@/components/markdown';
import { api, ApiClientError } from '@/lib/api-client';
import { AttemptRecorder } from '@/lib/attempt-recorder';
import { pollSubmission } from '@/lib/submissions';
import { formatClock, useCountdown, useSkew } from './use-clock';

/** Spec 7.1 step 3: full-screen, timed workspace. No hints, notes, editorial or AI. */
export function AttemptWorkspace({
  attempt,
  theme,
  onChange,
}: {
  attempt: Attempt;
  theme: 'dark' | 'light';
  onChange: () => Promise<Attempt>;
}) {
  const [code, setCode] = useState(attempt.starter);
  const [pending, setPending] = useState<'run' | 'submit' | null>(null);
  const [result, setResult] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const skew = useSkew(attempt.serverNow);
  const left = useCountdown(attempt.endsAt, skew);
  const timeUp = left === 0;
  const codeRef = useRef(code);
  codeRef.current = code;

  const recorder = useMemo(
    () => new AttemptRecorder(attempt.id, Date.parse(attempt.startedAt) - skew),
    [attempt.id, attempt.startedAt, skew],
  );

  useEffect(() => {
    recorder.start();
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      void recorder.flush();
      recorder.stop();
    };
  }, [recorder]);

  useEffect(() => {
    if (timeUp) void recorder.flush().then(onChange);
  }, [timeUp, recorder, onChange]);

  async function go(kind: 'run' | 'submit') {
    if (pending || timeUp) return;
    setPending(kind);
    setError(null);
    try {
      // Everything typed so far reaches the server before the code does.
      await recorder.flush();
      const started = await api<Submission>(`/attempts/${attempt.id}/${kind}`, {
        method: 'POST',
        body: { code: codeRef.current },
      });
      const done = await pollSubmission(started.id);
      setResult(done);
      if (kind === 'submit' && done.verdict === 'accepted') {
        // The server moves the attempt to its follow-up questions once grading is stored.
        for (let i = 0; i < 40; i++) {
          const next = await onChange();
          if (next.status !== 'in_progress') return;
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setPending(null);
    }
  }

  const urgent = left < 5 * 60_000;
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col" data-testid="attempt-workspace">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <h1 className="font-semibold">{attempt.problemTitle}</h1>
        <span className="text-xs text-muted-foreground">Verified attempt · recording</span>
        <div
          className={cn(
            'ml-auto flex items-center gap-1 font-mono text-sm tabular-nums',
            urgent && 'text-verdict-wrong',
          )}
          role="timer"
          aria-label={`Time left ${formatClock(left)}`}
        >
          <Timer className="h-4 w-4" aria-hidden /> {formatClock(left)}
        </div>
        {!fullscreen ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void document.documentElement.requestFullscreen?.().catch(() => undefined)
            }
          >
            <Maximize className="h-4 w-4" aria-hidden /> Full screen
          </Button>
        ) : null}
      </div>
      {timeUp ? <Alert className="m-4">Time is up. Your attempt is closed.</Alert> : null}
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section
          aria-label="Problem statement"
          className="max-h-[calc(100vh-7rem)] overflow-auto border-b p-4 md:border-r md:border-b-0"
        >
          <Markdown>{attempt.statement}</Markdown>
        </section>
        <div className="flex min-h-[28rem] flex-col">
          <div className="min-h-0 flex-1">
            <CodeEditor
              value={code}
              onChange={setCode}
              language={attempt.language}
              theme={theme}
              settings={{ fontSize: 14, keybindings: 'default' }}
              onRun={() => void go('run')}
              onSubmit={() => void go('submit')}
              label={`${attempt.problemTitle} code editor`}
              onEditorMount={(editor: StandaloneEditor) => recorder.attach(editor)}
            />
          </div>
          <div className="flex items-center gap-2 border-t px-4 py-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void go('run')}
              disabled={pending !== null || timeUp}
            >
              <Play className="h-4 w-4" aria-hidden /> Run
            </Button>
            <Button
              size="sm"
              onClick={() => void go('submit')}
              disabled={pending !== null || timeUp}
            >
              <Send className="h-4 w-4" aria-hidden /> Submit
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Ctrl/⌘ + Enter runs · Ctrl/⌘ + Shift + Enter submits
            </span>
          </div>
          {error ? (
            <Alert variant="destructive" className="m-2">
              {error}
            </Alert>
          ) : null}
          {pending || result ? (
            <div className="max-h-72 overflow-auto border-t">
              <ResultsPanel result={result} pending={pending} isSql={attempt.language === 'sql'} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
