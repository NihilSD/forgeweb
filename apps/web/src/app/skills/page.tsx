import type { MasteryItem } from '@forge/shared';
import { Card, CardContent } from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';

export const metadata: Metadata = { title: 'Skill map' };

const GROUPS: Record<string, string[]> = {
  Algorithms: [
    'arrays',
    'strings',
    'hashing',
    'two-pointers',
    'sliding-window',
    'recursion',
    'bfs-dfs',
    'graphs',
    'binary-search',
    'sorting',
    'dynamic-programming',
    'greedy',
    'stacks',
    'queues',
    'math',
  ],
  Debugging: ['off-by-one', 'null-handling', 'types', 'async', 'state'],
  SQL: ['select', 'joins', 'aggregation', 'window-functions', 'subqueries'],
  Security: [
    'crypto',
    'encoding',
    'forensics',
    'logs',
    'web-vulns',
    'injection',
    'xss',
    'auth',
    'secure-fix',
  ],
};

export default async function SkillsPage() {
  await requireMe();
  const res = await apiServer<{ items: MasteryItem[] }>('/me/mastery');
  const byTag = new Map((res?.status === 200 ? res.data.items : []).map((m) => [m.tag, m]));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Skill map</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Mastery grows from 0 to 5 as you solve problems in each concept. Hints lower how much a
        solve counts.
      </p>
      <div className="mt-8 grid gap-8">
        {Object.entries(GROUPS).map(([group, tags]) => (
          <section key={group} aria-labelledby={`g-${group}`}>
            <h2 id={`g-${group}`} className="mb-3 text-lg font-semibold">
              {group}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tags.map((tag) => {
                const m = byTag.get(tag);
                const level = m?.level ?? 0;
                return (
                  <Card key={tag}>
                    <CardContent className="grid gap-2 pt-5">
                      <div className="flex items-center justify-between">
                        <Link href={`/problems?tag=${tag}`} className="font-medium hover:underline">
                          {tag}
                        </Link>
                        <span
                          className="text-sm text-muted-foreground"
                          data-testid={`mastery-${tag}`}
                        >
                          Level {level} · {m?.points ?? 0} pts
                        </span>
                      </div>
                      <div
                        className="flex gap-1"
                        role="meter"
                        aria-label={`${tag} mastery`}
                        aria-valuemin={0}
                        aria-valuemax={5}
                        aria-valuenow={level}
                      >
                        {[1, 2, 3, 4, 5].map((i) => (
                          <span
                            key={i}
                            className={`h-2 flex-1 rounded-full ${i <= level ? 'bg-primary' : 'bg-muted'}`}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
