'use client';
import { applyChanges, normalizeEol, type Replay } from '@forge/shared';
import { Alert, Button, cn } from '@forge/ui';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const SPEEDS = [1, 2, 4, 8, 16] as const;

interface Mark {
  t: number;
  kind: 'paste' | 'focus' | 'fullscreen' | 'run' | 'submit' | 'followup';
  label: string;
}

const MARK_STYLE: Record<Mark['kind'], string> = {
  paste: 'bg-verdict-wrong',
  focus: 'bg-verdict-limit',
  fullscreen: 'bg-verdict-limit',
  run: 'bg-primary',
  submit: 'bg-verdict-accepted',
  followup: 'bg-foreground',
};

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Spec L8 step 5: replay of a verified attempt with play, pause, speed and a timeline of events. */
export function ReplayViewer({ replay }: { replay: Replay }) {
  // Document after each edit, so seeking is a binary search instead of a re-play.
  const { snapshots, consistent } = useMemo(() => {
    const snaps: { t: number; doc: string }[] = [{ t: 0, doc: normalizeEol(replay.starter) }];
    let doc: string | null = snaps[0]!.doc;
    for (const e of replay.events) {
      if (e.type !== 'edit' || doc === null) continue;
      doc = applyChanges(
        doc,
        e.changes.map((c) => ({ ...c, text: normalizeEol(c.text) })),
      );
      if (doc !== null) snaps.push({ t: e.t, doc });
    }
    const final = replay.finalCode === null ? null : normalizeEol(replay.finalCode).trimEnd();
    return {
      snapshots: snaps,
      consistent: doc !== null && (final === null || doc.trimEnd() === final),
    };
  }, [replay]);

  const marks = useMemo<Mark[]>(() => {
    const out: Mark[] = [];
    for (const e of replay.events) {
      if (e.type === 'paste')
        out.push({
          t: e.t,
          kind: 'paste',
          label: `Paste, ${e.length} characters, ${e.internal ? 'from inside the editor' : 'from outside'}`,
        });
      else if (e.type === 'blur') out.push({ t: e.t, kind: 'focus', label: 'Left the workspace' });
      else if (e.type === 'focus') out.push({ t: e.t, kind: 'focus', label: 'Came back' });
      else if (e.type === 'visibility')
        out.push({
          t: e.t,
          kind: 'focus',
          label: e.state === 'hidden' ? 'Tab hidden' : 'Tab visible',
        });
      else if (e.type === 'fullscreen_exit')
        out.push({ t: e.t, kind: 'fullscreen', label: 'Left full screen' });
    }
    for (const e of replay.serverEvents) {
      const t = Number(e.t ?? 0);
      if (e.type === 'run' || e.type === 'submit')
        out.push({
          t,
          kind: e.type,
          label: `${e.type === 'run' ? 'Run' : 'Submit'}: ${String(e.verdict ?? 'pending').replace('_', ' ')}${
            e.total ? ` (${String(e.passed)}/${String(e.total)})` : ''
          }`,
        });
      else if (e.type === 'followup')
        out.push({
          t,
          kind: 'followup',
          label: `Follow-up answered ${e.correct ? 'correctly' : 'incorrectly'}`,
        });
    }
    return out.sort((a, b) => a.t - b.t);
  }, [replay]);

  const duration = Math.max(replay.durationMs, snapshots.at(-1)?.t ?? 0, marks.at(-1)?.t ?? 0, 1);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);

  useEffect(() => {
    if (!playing) return;
    const step = 50;
    const timer = setInterval(() => {
      setPos((p) => {
        const next = Math.min(duration, p + step * speed);
        if (next >= duration) setPlaying(false);
        return next;
      });
    }, step);
    return () => clearInterval(timer);
  }, [playing, speed, duration]);

  const doc = useMemo(() => {
    let lo = 0;
    let hi = snapshots.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (snapshots[mid]!.t <= pos) lo = mid;
      else hi = mid - 1;
    }
    return snapshots[lo]!.doc;
  }, [snapshots, pos]);

  const times = [...new Set([0, ...snapshots.map((s) => s.t), ...marks.map((m) => m.t)])].sort(
    (a, b) => a - b,
  );
  const prev = () => setPos([...times].reverse().find((t) => t < pos) ?? 0);
  const next = () => setPos(times.find((t) => t > pos) ?? duration);

  return (
    <div className="grid gap-4" data-testid="replay-viewer">
      {!consistent ? (
        <Alert variant="destructive">
          The recorded edits do not reproduce the submitted code. Some of the session was not
          recorded.
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="outline" aria-label="Previous event" onClick={prev}>
          <SkipBack className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="outline"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            if (!playing && pos >= duration) setPos(0);
            setPlaying((v) => !v);
          }}
        >
          {playing ? (
            <Pause className="h-4 w-4" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
        </Button>
        <Button size="icon" variant="outline" aria-label="Next event" onClick={next}>
          <SkipForward className="h-4 w-4" aria-hidden />
        </Button>
        <span className="font-mono text-sm tabular-nums" aria-live="off">
          {fmt(pos)} / {fmt(duration)}
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Speed
          <select
            className="h-7 rounded-md border border-input bg-background px-1 text-xs"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-1">
        <div className="relative h-3" aria-hidden>
          {marks.map((m, i) => (
            <span
              key={i}
              className={cn('absolute top-0 h-3 w-1 rounded-sm', MARK_STYLE[m.kind])}
              style={{ left: `${(m.t / duration) * 100}%` }}
              title={m.label}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={duration}
          step={100}
          value={pos}
          onChange={(e) => {
            setPlaying(false);
            setPos(Number(e.target.value));
          }}
          aria-label="Replay position"
          aria-valuetext={fmt(pos)}
        />
      </div>
      <ol
        className="max-h-[28rem] overflow-auto rounded-md border bg-muted/40 py-2 font-mono text-sm"
        aria-label={`Code at ${fmt(pos)}`}
      >
        {doc.split('\n').map((line, i) => (
          <li key={i} className="flex gap-3 px-3">
            <span className="w-6 shrink-0 text-right text-muted-foreground">{i + 1}</span>
            <span className="whitespace-pre">{line || ' '}</span>
          </li>
        ))}
      </ol>
      <section aria-labelledby="timeline" className="grid gap-2">
        <h2 id="timeline" className="text-sm font-semibold">
          Timeline
        </h2>
        {marks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No runs, pastes or focus changes recorded.
          </p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {marks.map((m, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded px-2 py-1 text-left hover:bg-accent"
                  onClick={() => {
                    setPlaying(false);
                    setPos(m.t);
                  }}
                >
                  <span
                    className={cn('h-2 w-2 shrink-0 rounded-full', MARK_STYLE[m.kind])}
                    aria-hidden
                  />
                  <span className="font-mono tabular-nums text-muted-foreground">{fmt(m.t)}</span>
                  <span>{m.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {replay.followUps.length ? (
        <section aria-labelledby="followups" className="grid gap-2">
          <h2 id="followups" className="text-sm font-semibold">
            Follow-up answers
          </h2>
          <ul className="grid gap-2 text-sm">
            {replay.followUps.map((f) => (
              <li key={f.id} className="rounded-md border p-2">
                <p>{f.prompt}</p>
                <p className="text-muted-foreground">
                  Answer: <span className="font-mono">{f.answer ?? '(no answer)'}</span>
                  {f.correct === null ? '' : f.correct ? ' · correct' : ' · incorrect'}
                  {f.answeredMs !== null ? ` · ${Math.round(f.answeredMs / 1000)} s` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
