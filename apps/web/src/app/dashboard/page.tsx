import { Alert, Button, Card, CardDescription, CardHeader, CardTitle } from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireMe } from '@/lib/session';
import { Recommendations } from './recommendations';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const me = await requireMe();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome back, {me.displayName ?? me.handle}
      </h1>
      {!me.emailVerified ? (
        <Alert className="mt-4">
          Verify your email to take verified challenges and post in the community.{' '}
          <Link href="/settings" className="underline">
            Resend the link
          </Link>
        </Alert>
      ) : null}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Recommendations />
        <Card>
          <CardHeader>
            <CardTitle>Keep learning</CardTitle>
            <CardDescription>
              Courses, pattern lessons, your skill map and review queue.
            </CardDescription>
            <Button asChild className="mt-3 w-fit">
              <Link href="/learn">Go to Learn</Link>
            </Button>
            <div className="mt-2 flex gap-3 text-sm">
              <Link href="/skills" className="underline">
                Skill map
              </Link>
              <Link href="/review" className="underline">
                Review queue
              </Link>
              <Link href="/problems" className="underline">
                All problems
              </Link>
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
