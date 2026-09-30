'use client';
import { LANGUAGE_LABELS, type Language, type ProblemDetail, type Submission } from '@forge/shared';
import { Alert, Badge, Button, Skeleton } from '@forge/ui';
import { CheckCircle2, ExternalLink, Play, Send } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ResultsPanel } from '@/app/problems/[slug]/solve/results-panel';
import { api, ApiClientError } from '@/lib/api-client';
import { execute } from '@/lib/submissions';

const CodeEditor = dynamic(
  () => import('@/components/editor/code-editor').then((m) => m.CodeEditor),
  {
    ssr: false,
    loading: () => <Skeleton className="h-48 w-full" />,
  },
);

/** A compact, runnable exercise embedded in a lesson (spec L6). */
export function LessonExercise({
  slug,
  signedIn,
  initiallySolved,
  onSolved,
}: {
  slug: string;
  signedIn: boolean;
  initiallySolved: boolean;
  onSolved: () => void;
}) {
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [language, setLanguage] = useState<Language | null>(null);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<'run' | 'submit' | null>(null);
  const [result, setResult] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [solved, setSolved] = useState(initiallySolved);
  const theme =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light';

  useEffect(() => {
    api<ProblemDetail>(`/problems/${slug}`)
      .then((p) => {
        setProblem(p);
        const lang = p.languages[0] as Language;
        setLanguage(lang);
        setCode(p.starters[lang] ?? '');
      })
      .catch(() => setError('Could not load this exercise.'));
  }, [slug]);

  async function go(kind: 'run' | 'submit') {
    if (!language || pending) return;
    setPending(kind);
    setError(null);
    try {
      const r = await execute(slug, kind, { language, code });
      setResult(r);
      if (kind === 'submit' && r.verdict === 'accepted') {
        setSolved(true);
        onSolved();
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setPending(null);
    }
  }

  if (!problem || !language) {
    return error ? (
      <Alert variant="destructive">{error}</Alert>
    ) : (
      <Skeleton className="my-6 h-64 w-full" />
    );
  }
  return (
    <section
      className="my-6 grid gap-3 rounded-lg border bg-card p-4"
      aria-label={`Exercise: ${problem.title}`}
      data-testid="lesson-exercise"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Exercise: {problem.title}</h3>
        {solved ? (
          <Badge variant="success">
            <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden /> Solved
          </Badge>
        ) : null}
        <Link
          href={`/problems/${slug}/solve`}
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground underline"
        >
          Open in full workspace <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      </div>
      {problem.languages.length > 1 ? (
        <select
          aria-label="Language"
          className="h-8 w-fit rounded-md border border-input bg-background px-2 text-sm"
          value={language}
          onChange={(e) => {
            const l = e.target.value as Language;
            setLanguage(l);
            setCode(problem.starters[l] ?? '');
          }}
        >
          {problem.languages.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_LABELS[l as Language]}
            </option>
          ))}
        </select>
      ) : null}
      <div className="h-56 overflow-hidden rounded-md border">
        <CodeEditor
          value={code}
          onChange={setCode}
          language={language}
          theme={theme}
          settings={{ fontSize: 14, keybindings: 'default' }}
          onRun={() => void go('run')}
          onSubmit={() => void go('submit')}
          label={`${problem.title} code editor`}
        />
      </div>
      {signedIn ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void go('run')}
            disabled={pending !== null}
          >
            <Play className="h-4 w-4" aria-hidden /> Run
          </Button>
          <Button size="sm" onClick={() => void go('submit')} disabled={pending !== null}>
            <Send className="h-4 w-4" aria-hidden /> Submit
          </Button>
        </div>
      ) : (
        <Alert>
          <Link href="/signup" className="underline">
            Create a free account
          </Link>{' '}
          to run your code.
        </Alert>
      )}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {pending || result ? (
        <div className="rounded-md border">
          <ResultsPanel result={result} pending={pending} isSql={language === 'sql'} />
        </div>
      ) : null}
    </section>
  );
}
