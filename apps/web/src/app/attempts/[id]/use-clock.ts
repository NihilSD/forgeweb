'use client';
import { useEffect, useState } from 'react';

/** Server clock minus browser clock, measured once when the component mounts. */
export function useSkew(serverNow: string): number {
  const [skew] = useState(() => Date.parse(serverNow) - Date.now());
  return skew;
}

/** Milliseconds until `deadline` (ISO, server clock), corrected by `skew`. */
export function useCountdown(deadline: string, skew: number): number {
  const [left, setLeft] = useState(() => Date.parse(deadline) - (Date.now() + skew));
  useEffect(() => {
    const tick = () => setLeft(Date.parse(deadline) - (Date.now() + skew));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [deadline, skew]);
  return Math.max(0, left);
}

export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
