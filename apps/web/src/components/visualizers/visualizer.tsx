'use client';
import { Button, cn } from '@forge/ui';
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  bfsSteps,
  gridFillSteps,
  type GridStep,
  type GraphStep,
  type PointerStep,
  slidingWindowSteps,
  twoPointerSteps,
} from './steps';

const SPEEDS = [0.5, 1, 2] as const;

function usePlayer(length: number) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  useEffect(() => {
    // Respect reduced motion: no auto-play, the user steps manually.
    if (!playing) return;
    if (index >= length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => Math.min(length - 1, i + 1)), 900 / speed);
    return () => clearTimeout(t);
  }, [playing, index, length, speed]);
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { index, setIndex, playing, setPlaying, speed, setSpeed, reduced };
}

function Controls({
  p,
  length,
  note,
}: {
  p: ReturnType<typeof usePlayer>;
  length: number;
  note: string;
}) {
  return (
    <div className="grid gap-2">
      <p className="min-h-10 text-sm" aria-live="polite">
        <span className="text-muted-foreground">
          Step {p.index + 1} of {length}:
        </span>{' '}
        {note}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          aria-label="Previous step"
          onClick={() => p.setIndex((i) => Math.max(0, i - 1))}
        >
          <SkipBack className="h-4 w-4" aria-hidden />
        </Button>
        {!p.reduced ? (
          <Button
            size="icon"
            variant="outline"
            aria-label={p.playing ? 'Pause' : 'Play'}
            onClick={() => p.setPlaying((v) => !v)}
          >
            {p.playing ? (
              <Pause className="h-4 w-4" aria-hidden />
            ) : (
              <Play className="h-4 w-4" aria-hidden />
            )}
          </Button>
        ) : null}
        <Button
          size="icon"
          variant="outline"
          aria-label="Next step"
          onClick={() => p.setIndex((i) => Math.min(length - 1, i + 1))}
        >
          <SkipForward className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Restart"
          onClick={() => {
            p.setPlaying(false);
            p.setIndex(0);
          }}
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
        </Button>
        {!p.reduced ? (
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            Speed
            <select
              className="h-7 rounded-md border border-input bg-background px-1 text-xs"
              value={p.speed}
              onChange={(e) => p.setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}

function ArrayView({
  values,
  step,
  window: isWindow,
}: {
  values: number[];
  step: PointerStep;
  window?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap gap-1 font-mono text-sm"
      role="img"
      aria-label={`Array ${values.join(', ')}`}
    >
      {values.map((v, i) => (
        <div key={i} className="grid justify-items-center gap-1">
          <div
            className={cn(
              'grid h-10 w-10 place-items-center rounded-md border',
              step.highlight.includes(i) &&
                (isWindow
                  ? 'border-primary bg-accent'
                  : 'border-primary bg-primary text-primary-foreground'),
              step.done && step.highlight.includes(i) && 'border-success',
            )}
          >
            {v}
          </div>
          <div className="h-4 text-[10px] text-muted-foreground">
            {i === step.left ? 'L' : ''}
            {i === step.right ? 'R' : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

function PointerViz({ kind }: { kind: 'two-pointers' | 'sliding-window' }) {
  const data = useMemo(() => {
    if (kind === 'two-pointers') {
      const values = [2, 5, 7, 11, 14, 18, 21];
      return {
        values,
        steps: twoPointerSteps(values, 25) as PointerStep[],
        title: 'Find two values that sum to 25',
      };
    }
    const values = [3, 1, 2, 7, 1, 1, 4, 2];
    return {
      values,
      steps: slidingWindowSteps(values, 8) as PointerStep[],
      title: 'Longest run with total ≤ 8',
    };
  }, [kind]);
  const p = usePlayer(data.steps.length);
  const step = data.steps[p.index]!;
  return (
    <>
      <p className="text-sm font-medium">{data.title}</p>
      <ArrayView values={data.values} step={step} window={kind === 'sliding-window'} />
      <Controls p={p} length={data.steps.length} note={step.note} />
    </>
  );
}

const GRID = ['....', '.#..', '...#', '#...'];
const MAZE = ['S..#....', '.#.#.##.', '.#...#..', '.####.#.', '......#E'];

function GridViz() {
  const steps = useMemo(() => gridFillSteps(GRID), []);
  const p = usePlayer(steps.length);
  const step: GridStep = steps[p.index]!;
  return (
    <>
      <p className="text-sm font-medium">Routes into each cell = from above + from the left</p>
      <table className="border-collapse font-mono text-sm" aria-label="Routes table">
        <tbody>
          {step.table.map((row, r) => (
            <tr key={r}>
              {row.map((v, c) => (
                <td
                  key={c}
                  className={cn(
                    'h-10 w-10 border text-center',
                    GRID[r]![c] === '#' && 'bg-muted text-muted-foreground',
                    step.cell[0] === r &&
                      step.cell[1] === c &&
                      'bg-primary text-primary-foreground',
                  )}
                >
                  {GRID[r]![c] === '#' ? '#' : (v ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Controls p={p} length={steps.length} note={step.note} />
    </>
  );
}

function GraphViz() {
  const steps = useMemo(() => bfsSteps(MAZE), []);
  const p = usePlayer(steps.length);
  const step: GraphStep = steps[p.index]!;
  const inFrontier = (r: number, c: number) =>
    step.frontier.some(([fr, fc]) => fr === r && fc === c);
  return (
    <>
      <p className="text-sm font-medium">Breadth-first search: numbers are distances from S</p>
      <table className="border-collapse font-mono text-xs" aria-label="Maze">
        <tbody>
          {MAZE.map((row, r) => (
            <tr key={r}>
              {[...row].map((ch, c) => {
                const d = step.dist[r]![c]!;
                return (
                  <td
                    key={c}
                    className={cn(
                      'h-8 w-8 border text-center',
                      ch === '#' && 'bg-foreground/80',
                      inFrontier(r, c) && 'bg-accent',
                      step.current?.[0] === r &&
                        step.current?.[1] === c &&
                        'bg-primary text-primary-foreground',
                    )}
                  >
                    {ch === '#' ? '' : ch === 'S' || ch === 'E' ? ch : d >= 0 ? d : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <Controls p={p} length={steps.length} note={step.note} />
    </>
  );
}

export function Visualizer({ kind }: { kind: string }) {
  return (
    <figure
      className="my-6 grid gap-3 rounded-lg border bg-card p-4"
      aria-label={`${kind} visualization`}
    >
      {kind === 'two-pointers' || kind === 'sliding-window' ? (
        <PointerViz kind={kind} />
      ) : kind === 'grid-fill' ? (
        <GridViz />
      ) : kind === 'graph-search' ? (
        <GraphViz />
      ) : (
        <p className="text-sm text-muted-foreground">Unknown visualization.</p>
      )}
    </figure>
  );
}
