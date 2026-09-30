import { LANGUAGE_LABELS, type Language, type ProblemDetail } from '@forge/shared';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DifficultyBadge } from '@/components/difficulty-badge';
import { Markdown } from '@/components/markdown';
import { apiServer } from '@/lib/api-server';

async function load(slug: string) {
  const res = await apiServer<ProblemDetail>(`/problems/${encodeURIComponent(slug)}`);
  if (!res || res.status !== 200) return null;
  return res.data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const p = await load((await params).slug);
  return p
    ? { title: p.title, description: `${p.difficulty} ${p.track} problem on Forge` }
    : { title: 'Problem not found' };
}

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await load((await params).slug);
  if (!p) notFound();
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_320px]">
      <article>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/problems?track=${p.track}`} className="capitalize hover:underline">
            {p.track}
          </Link>
          <span aria-hidden>·</span>
          <DifficultyBadge difficulty={p.difficulty} />
          {p.solved ? <Badge variant="success">Solved</Badge> : null}
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{p.title}</h1>
        <div className="mt-6">
          <Markdown>{p.statement}</Markdown>
        </div>
        {p.visibleTests.length > 0 && p.format !== 'flag' ? (
          <section className="mt-8" aria-labelledby="examples">
            <h2 id="examples" className="text-lg font-semibold">
              Visible tests
            </h2>
            <p className="text-sm text-muted-foreground">
              Plus {p.hiddenTestCount} hidden tests that check edge cases and performance.
            </p>
            <div className="mt-3 grid gap-3">
              {p.visibleTests.map((t) => (
                <div key={t.id} className="rounded-md border p-3 font-mono text-xs">
                  <div className="mb-1 font-sans text-xs font-medium text-muted-foreground">
                    {t.category}
                  </div>
                  {t.args ? (
                    <div className="truncate">
                      input: {t.args.map((a) => JSON.stringify(a)).join(', ')}
                    </div>
                  ) : null}
                  <div className="truncate">expected: {JSON.stringify(t.expected)}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </article>
      <aside className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Solve it</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Button asChild>
              <Link href={`/problems/${p.slug}/solve`}>Open workspace</Link>
            </Button>
            <dl className="grid grid-cols-2 gap-y-1 text-muted-foreground">
              <dt>Time limit</dt>
              <dd className="text-right text-foreground">{p.limits.timeMs / 1000}s</dd>
              <dt>Memory</dt>
              <dd className="text-right text-foreground">{p.limits.memoryMb} MB</dd>
              <dt>Hints</dt>
              <dd className="text-right text-foreground">{p.hintCount} levels</dd>
            </dl>
            <div className="flex flex-wrap gap-1">
              {p.languages.map((l) => (
                <Badge key={l} variant="outline">
                  {LANGUAGE_LABELS[l as Language] ?? l}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-1">
          {p.tags.map((t) => (
            <Link key={t} href={`/problems?tag=${t}`}>
              <Badge variant="secondary">{t}</Badge>
            </Link>
          ))}
        </div>
      </aside>
    </div>
  );
}
