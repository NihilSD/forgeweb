'use client';

import type { RatingHistoryItem } from '@forge/shared';
import { useEffect, useId, useRef, useState } from 'react';

const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * Rating after each rated event (one series, so no legend: the heading names it). A crosshair
 * snaps to the nearest event on hover; arrow keys move it when the chart has focus. The same data
 * is available as a table below the chart.
 */
export function RatingChart({ history, label }: { history: RatingHistoryItem[]; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  // Drawn at the container's real width, so text stays 11px on phones instead of shrinking.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setW(Math.max(280, Math.round(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 180 : 220;
  if (history.length === 0) return null;

  const values = history.map((h) => h.rating);
  const lo = Math.floor((Math.min(...values) - 25) / 50) * 50;
  const hi = Math.ceil((Math.max(...values) + 25) / 50) * 50;
  const ticks: number[] = [];
  const step = hi - lo > 400 ? 200 : hi - lo > 200 ? 100 : 50;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);

  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (history.length === 1 ? iw / 2 : (i / (history.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - ((v - lo) / (hi - lo)) * ih;
  const path = history
    .map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.rating).toFixed(1)}`)
    .join('');
  const last = history.length - 1;
  const point = active ?? null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < history.length; i++) {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    }
    setActive(best);
  }

  function onKey(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const cur = active ?? last;
      setActive(Math.max(0, Math.min(last, cur + (e.key === 'ArrowLeft' ? -1 : 1))));
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  }

  const tip = point !== null ? history[point]! : null;
  const tipLeft = point !== null ? (x(point) / W) * 100 : 0;

  return (
    <figure className="grid gap-2">
      <div className="relative" ref={box}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          role="img"
          aria-labelledby={titleId}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          <title id={titleId}>
            {`${label}: ${history.length} rated events, from ${history[0]!.rating} to ${history[last]!.rating}. Use the arrow keys to read each event.`}
          </title>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill="var(--muted-foreground)"
              >
                {t}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 8} fontSize={11} fill="var(--muted-foreground)">
            {fmtDate(history[0]!.at)}
          </text>
          <text
            x={W - PAD.right}
            y={H - 8}
            fontSize={11}
            textAnchor="end"
            fill="var(--muted-foreground)"
          >
            {fmtDate(history[last]!.at)}
          </text>
          <path
            d={path}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {point !== null ? (
            <line
              x1={x(point)}
              x2={x(point)}
              y1={PAD.top}
              y2={PAD.top + ih}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
            />
          ) : null}
          {/* End marker (and the hovered point): 8px dot with a 2px surface ring. */}
          {[point ?? last].map((i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(history[i]!.rating)}
              r={4}
              fill="var(--primary)"
              stroke="var(--card)"
              strokeWidth={2}
            />
          ))}
          {/* Direct label on the latest value only. */}
          {point === null ? (
            <text
              x={x(last)}
              y={y(history[last]!.rating) - 10}
              fontSize={12}
              fontWeight={600}
              textAnchor={history.length > 1 ? 'end' : 'middle'}
              fill="var(--foreground)"
            >
              {history[last]!.rating}
            </text>
          ) : null}
        </svg>
        {tip ? (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 w-max max-w-56 -translate-x-1/2 rounded-md border bg-card px-3 py-2 text-xs shadow-md"
            style={{ left: `clamp(4.5rem, ${tipLeft}%, calc(100% - 4.5rem))` }}
          >
            <div className="font-medium">{fmtDate(tip.at)}</div>
            <div>
              Rating <span className="font-semibold">{tip.rating}</span> ({signed(tip.change)})
            </div>
            <div className="text-muted-foreground">
              {tip.problem?.title ?? 'Problem removed'} ·{' '}
              {tip.result === 'solved' ? 'solved' : 'not solved in time'}
            </div>
          </div>
        ) : null}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Date (UTC)</th>
              <th className="py-1 font-medium">Problem</th>
              <th className="py-1 font-medium">Result</th>
              <th className="py-1 text-right font-medium">Change</th>
              <th className="py-1 text-right font-medium">Rating</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map((h) => (
              <tr key={h.at + h.rating} className="border-t">
                <td className="py-1">{fmtDate(h.at)}</td>
                <td className="py-1">{h.problem?.title ?? '—'}</td>
                <td className="py-1">{h.result === 'solved' ? 'Solved' : 'Not solved in time'}</td>
                <td className="py-1 text-right tabular-nums">{signed(h.change)}</td>
                <td className="py-1 text-right tabular-nums">{h.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
