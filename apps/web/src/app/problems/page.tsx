import { CONCEPT_TAGS, DIFFICULTIES, type ProblemSummary } from '@forge/shared';
import { Badge, Button, EmptyState, Input, Label } from '@forge/ui';
import { CheckCircle2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DifficultyBadge } from '@/components/difficulty-badge';
import { apiServer } from '@/lib/api-server';
import { getMe } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Problems',
  description: 'Practice algorithms, debugging, SQL and security problems.',
};

type Search = {
  track?: string;
  difficulty?: string;
  tag?: string;
  q?: string;
  status?: string;
  cursor?: string;
};

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring';

export default async function ProblemsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const me = await getMe();
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => typeof v === 'string' && v !== '') as [
      string,
      string,
    ][],
  );
  const [list, tracks] = await Promise.all([
    apiServer<{ items: ProblemSummary[]; nextCursor: string | null; error?: { message: string } }>(
      `/problems?${query}`,
    ),
    apiServer<{ items: { slug: string; name: string; problemCount: number }[] }>('/tracks'),
  ]);
  const items = list?.status === 200 ? list.data.items : [];
  const nextCursor = list?.status === 200 ? list.data.nextCursor : null;
  const filtered = ['track', 'difficulty', 'tag', 'q', 'status'].some(
    (k) => params[k as keyof Search],
  );
  const next = new URLSearchParams(query);
  if (nextCursor) next.set('cursor', nextCursor);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Problems</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Practice freely. Hints and AI help are fine here; nothing affects your rating.
      </p>

      <form
        method="get"
        className="mt-6 grid gap-3 rounded-lg border p-4 sm:grid-cols-6"
        aria-label="Filter problems"
      >
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" defaultValue={params.q ?? ''} placeholder="Title or topic" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="track">Track</Label>
          <select id="track" name="track" defaultValue={params.track ?? ''} className={selectClass}>
            <option value="">All</option>
            {tracks?.status === 200
              ? tracks.data.items.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name} ({t.problemCount})
                  </option>
                ))
              : null}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="difficulty">Difficulty</Label>
          <select
            id="difficulty"
            name="difficulty"
            defaultValue={params.difficulty ?? ''}
            className={selectClass}
          >
            <option value="">All</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d} className="capitalize">
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tag">Topic</Label>
          <select id="tag" name="tag" defaultValue={params.tag ?? ''} className={selectClass}>
            <option value="">All</option>
            {CONCEPT_TAGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={params.status ?? ''}
            className={selectClass}
            disabled={!me}
          >
            <option value="">All</option>
            <option value="unsolved">Unsolved</option>
            <option value="solved">Solved</option>
          </select>
        </div>
        <div className="flex gap-2 sm:col-span-6">
          <Button type="submit" size="sm">
            Apply filters
          </Button>
          {filtered ? (
            <Button asChild size="sm" variant="ghost">
              <Link href="/problems">Clear</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={filtered ? 'No problems match these filters' : 'No problems yet'}
          description={
            filtered
              ? 'Try removing a filter or searching for something else.'
              : 'Problems appear here once they are published.'
          }
          action={
            filtered ? (
              <Button asChild variant="outline">
                <Link href="/problems">Clear filters</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Problems</caption>
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="w-8 px-4 py-2">
                  <span className="sr-only">Solved</span>
                </th>
                <th scope="col" className="px-4 py-2">
                  Title
                </th>
                <th scope="col" className="px-4 py-2">
                  Track
                </th>
                <th scope="col" className="px-4 py-2">
                  Difficulty
                </th>
                <th scope="col" className="hidden px-4 py-2 md:table-cell">
                  Topics
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.slug} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    {p.solved ? (
                      <CheckCircle2 className="h-4 w-4 text-success" aria-label="Solved" />
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/problems/${p.slug}`} className="hover:underline">
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{p.track}</td>
                  <td className="px-4 py-3">
                    <DifficultyBadge difficulty={p.difficulty} />
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {p.tags.map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nextCursor ? (
        <div className="mt-4 flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/problems?${next}`}>Next page</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
