'use client';
import type { Hints, Progress } from '@forge/shared';
import { Alert, Button, Label, Skeleton, Textarea } from '@forge/ui';
import { Bookmark, BookmarkCheck, Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Markdown } from '@/components/markdown';
import { api, ApiClientError } from '@/lib/api-client';

export function useProgress(slug: string) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const reload = useCallback(async () => {
    setProgress(await api<Progress>(`/problems/${slug}/progress`));
  }, [slug]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { progress, setProgress, reload };
}

export function BookmarkToggle({
  slug,
  progress,
  onChange,
}: {
  slug: string;
  progress: Progress | null;
  onChange: () => void;
}) {
  if (!progress) return null;
  const on = progress.bookmarked;
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-pressed={on}
      aria-label={on ? 'Remove bookmark' : 'Bookmark this problem'}
      onClick={async () => {
        await api(`/problems/${slug}/bookmark`, { method: on ? 'DELETE' : 'PUT' });
        onChange();
      }}
    >
      {on ? (
        <BookmarkCheck className="h-4 w-4 text-primary" aria-hidden />
      ) : (
        <Bookmark className="h-4 w-4" aria-hidden />
      )}
    </Button>
  );
}

const LEVEL_LABELS = ['Nudge', 'Approach', 'Pseudocode', 'Solution'];

export function HintsPanel({ slug, onRevealed }: { slug: string; onRevealed: () => void }) {
  const [hints, setHints] = useState<Hints | null>(null);
  const [error, setError] = useState<{ message: string; upgrade: boolean } | null>(null);
  useEffect(() => {
    api<Hints>(`/problems/${slug}/hints`).then(setHints, () => undefined);
  }, [slug]);
  if (!hints) return <Skeleton className="m-4 h-24" />;
  const next = hints.levels.find((l) => !l.revealed);
  return (
    <div className="grid gap-3 p-4">
      <p className="text-sm text-muted-foreground">
        Hints go from a gentle nudge to the full solution. Each level used lowers the XP for this
        problem.
        {hints.remainingToday !== null
          ? ` ${hints.remainingToday} free hint levels left today.`
          : ''}
      </p>
      {hints.levels.map((l) => (
        <section
          key={l.level}
          className="rounded-md border p-3"
          aria-label={`Hint ${l.level}: ${LEVEL_LABELS[l.level - 1]}`}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Lightbulb className="h-4 w-4" aria-hidden /> {l.level}. {LEVEL_LABELS[l.level - 1]}
          </div>
          {l.revealed ? (
            <div className="mt-2" data-testid={`hint-${l.level}`}>
              <Markdown>{l.text ?? ''}</Markdown>
            </div>
          ) : null}
        </section>
      ))}
      {error ? (
        <Alert variant="destructive">
          {error.message}{' '}
          {error.upgrade ? (
            <Link href="/pricing" className="underline">
              See Pro
            </Link>
          ) : null}
        </Alert>
      ) : null}
      {next ? (
        <Button
          variant="outline"
          className="w-fit"
          onClick={async () => {
            setError(null);
            try {
              setHints(
                await api<Hints>(`/problems/${slug}/hints/${next.level}/reveal`, {
                  method: 'POST',
                }),
              );
              onRevealed();
            } catch (err) {
              if (err instanceof ApiClientError)
                setError({ message: err.message, upgrade: err.code === 'LIMIT_REACHED' });
            }
          }}
        >
          Show hint {next.level}: {LEVEL_LABELS[next.level - 1]}
        </Button>
      ) : null}
    </div>
  );
}

export function EditorialPanel({
  slug,
  progress,
  onGaveUp,
}: {
  slug: string;
  progress: Progress | null;
  onGaveUp: () => void;
}) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; upgrade: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!progress || (!progress.solved && !progress.gaveUp)) return;
    api<{ markdown: string }>(`/problems/${slug}/editorial`).then(
      (r) => setMarkdown(r.markdown),
      (err: unknown) => {
        if (err instanceof ApiClientError)
          setError({ message: err.message, upgrade: err.code === 'PLAN_REQUIRED' });
      },
    );
  }, [slug, progress]);
  if (!progress) return <Skeleton className="m-4 h-24" />;
  if (markdown) {
    return (
      <div className="p-4">
        <Markdown>{markdown}</Markdown>
      </div>
    );
  }
  return (
    <div className="grid gap-3 p-4">
      {error ? (
        <Alert>
          {error.message}{' '}
          {error.upgrade ? (
            <Link href="/pricing" className="underline">
              See Pro
            </Link>
          ) : null}
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">
          The editorial unlocks when you solve the problem or give up.
        </p>
      )}
      {!progress.solved && !progress.gaveUp ? (
        confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              Give up and read the editorial? You can still solve it afterwards, and it will come
              back for review.
            </span>
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                await api(`/problems/${slug}/give-up`, { method: 'POST' });
                onGaveUp();
              }}
            >
              Give up
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep trying
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="w-fit" onClick={() => setConfirming(true)}>
            Give up…
          </Button>
        )
      ) : null}
    </div>
  );
}

export function NotesPanel({ slug, initial }: { slug: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<'saved' | 'saving' | 'idle'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setText(initial), [initial]);
  return (
    <div className="grid gap-2 p-4">
      <Label htmlFor="notes">Private notes</Label>
      <Textarea
        id="notes"
        className="min-h-40"
        value={text}
        placeholder="Only you can see these."
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setState('saving');
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(async () => {
            await api(`/problems/${slug}/note`, { method: 'PUT', body: { text: v } }).catch(
              () => undefined,
            );
            setState('saved');
          }, 700);
        }}
      />
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}
      </span>
    </div>
  );
}
