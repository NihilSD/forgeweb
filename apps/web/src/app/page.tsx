import type { Health } from '@forge/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@forge/ui';
import Link from 'next/link';
import { apiServer } from '@/lib/api-server';

const PILLARS = [
  {
    title: 'Practice',
    body: 'Courses, pattern lessons, hints and editorials. Learn at your own pace.',
  },
  {
    title: 'Verified',
    body: 'Timed challenges with unique instances. Results employers can trust.',
  },
  { title: 'Real work', body: 'Debugging, SQL and security, not just algorithms.' },
];

export default async function HomePage() {
  const health = await apiServer<Health>('/health');
  const ok = health?.status === 200 && health.data.status === 'ok';
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <section className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Learn IT skills, prove them fairly, get hired.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Forge is where you practise algorithms, debugging, SQL and security, then prove your
          skills in verified challenges.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg">
            <Link href="/signup">Start for free</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/problems">Browse problems</Link>
          </Button>
        </div>
      </section>
      <section aria-label="Pillars" className="mt-16 grid gap-4 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <Card key={p.title}>
            <CardHeader>
              <CardTitle>{p.title}</CardTitle>
              <CardDescription>{p.body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
      <Card className="mt-16 max-w-sm">
        <CardContent className="flex items-center justify-between pt-5">
          <span className="text-sm text-muted-foreground">API status</span>
          <Badge variant={ok ? 'success' : 'danger'} data-testid="api-status">
            {ok ? 'Operational' : 'Unavailable'}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
