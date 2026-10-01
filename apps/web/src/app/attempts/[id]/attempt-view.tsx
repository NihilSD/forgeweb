'use client';
import type { Attempt } from '@forge/shared';
import { useCallback, useState } from 'react';
import { api } from '@/lib/api-client';
import { AttemptResult } from './attempt-result';
import { AttemptWorkspace } from './attempt-workspace';
import { FollowUps } from './follow-ups';

/** Switches between the timed workspace, the follow-up questions and the result. */
export function AttemptView({ initial, theme }: { initial: Attempt; theme: 'dark' | 'light' }) {
  const [attempt, setAttempt] = useState(initial);
  const refresh = useCallback(async () => {
    const next = await api<Attempt>(`/attempts/${initial.id}`);
    setAttempt(next);
    return next;
  }, [initial.id]);

  if (attempt.status === 'in_progress')
    return <AttemptWorkspace attempt={attempt} theme={theme} onChange={refresh} />;
  if (attempt.status === 'followups') return <FollowUps attempt={attempt} onDone={refresh} />;
  return <AttemptResult attempt={attempt} onChange={refresh} />;
}
