import type { Recommendation } from '@forge/shared';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@forge/ui';
import Link from 'next/link';
import { DifficultyBadge } from '@/components/difficulty-badge';
import { apiServer } from '@/lib/api-server';

export async function Recommendations() {
  const res = await apiServer<{ items: Recommendation[] }>('/me/recommendations');
  const items = res?.status === 200 ? res.data.items : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next best problems</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            title="You've solved everything here"
            description="New problems are added regularly."
          />
        ) : (
          <ul className="grid gap-2" data-testid="recommendations">
            {items.map((r) => (
              <li key={r.slug} className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/problems/${r.slug}/solve`} className="font-medium hover:underline">
                  {r.title}
                </Link>
                <DifficultyBadge difficulty={r.difficulty as 'easy'} />
                <span className="text-xs text-muted-foreground">{r.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
