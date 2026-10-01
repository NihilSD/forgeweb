'use client';
import type { Attempt } from '@forge/shared';
import { Skeleton } from '@forge/ui';
import dynamic from 'next/dynamic';

// Monaco and the event recorder need the browser.
const AttemptView = dynamic(() => import('./attempt-view').then((m) => m.AttemptView), {
  ssr: false,
  loading: () => (
    <div className="grid gap-3 p-6" aria-busy="true" aria-label="Loading attempt">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  ),
});

export function AttemptLoader(props: { initial: Attempt; theme: 'dark' | 'light' }) {
  return <AttemptView {...props} />;
}
