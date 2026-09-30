'use client';
import type { Language, ProblemDetail } from '@forge/shared';
import { Skeleton } from '@forge/ui';
import dynamic from 'next/dynamic';

// The workspace uses browser-only APIs (Monaco, localStorage for pane sizes), so it renders on the client.
const Workspace = dynamic(() => import('./workspace').then((m) => m.Workspace), {
  ssr: false,
  loading: () => (
    <div className="grid gap-3 p-6" aria-busy="true" aria-label="Loading workspace">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  ),
});

export function WorkspaceLoader(props: {
  problem: ProblemDetail;
  drafts: Partial<Record<Language, string>>;
  theme: 'dark' | 'light';
}) {
  return <Workspace {...props} />;
}
