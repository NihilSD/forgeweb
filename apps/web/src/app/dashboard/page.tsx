import type { Daily, Goal, ProgressSummary } from '@forge/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DailyList } from '@/components/daily/daily-list';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';
import { ProgressCard } from './progress-card';
import { Recommendations } from './recommendations';

export const metadata: Metadata = { title: 'Dashboard' };

type Section = 'daily' | 'recommendations' | 'learn' | 'verified';

/** Spec L9 step 4: the dashboard is ordered by what the user said they want. */
const LAYOUT: Record<Goal, { intro: string; sections: Section[] }> = {
  learn: {
    intro: 'Pick up where you left off in your courses.',
    sections: ['learn', 'daily', 'recommendations', 'verified'],
  },
  interview: {
    intro: 'Practise the patterns interviews use, then prove them under time.',
    sections: ['recommendations', 'verified', 'daily', 'learn'],
  },
  compete: {
    intro: 'Sharpen up on the daily challenge and verified challenges.',
    sections: ['daily', 'verified', 'recommendations', 'learn'],
  },
  'career-change': {
    intro: 'Build the foundations step by step, then show what you can do.',
    sections: ['learn', 'recommendations', 'verified', 'daily'],
  },
  teach: {
    intro: 'Explore the courses and problems your learners will use.',
    sections: ['learn', 'recommendations', 'daily', 'verified'],
  },
};

export default async function DashboardPage() {
  const me = await requireMe();
  const [progress, daily] = await Promise.all([
    apiServer<ProgressSummary>('/me/progress'),
    apiServer<Daily>('/daily'),
  ]);
  const layout = LAYOUT[(me.goal as Goal | null) ?? 'learn'] ?? LAYOUT.learn;

  const cards: Record<Section, ReactNode> = {
    daily: (
      <Card key="daily">
        <CardHeader>
          <CardTitle>Daily challenge</CardTitle>
          <CardDescription>
            One problem per track, new every day at 00:00 UTC. Solving one adds 10 XP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {daily?.status === 200 ? (
            <DailyList daily={daily.data} />
          ) : (
            <p className="text-sm">Could not load today&apos;s challenges.</p>
          )}
        </CardContent>
      </Card>
    ),
    recommendations: <Recommendations key="recommendations" />,
    learn: (
      <Card key="learn">
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
    ),
    verified: (
      <Card key="verified">
        <CardHeader>
          <CardTitle>Verified challenges</CardTitle>
          <CardDescription>
            Timed, recorded challenges that show employers what you can do.
          </CardDescription>
          <Button asChild variant="outline" className="mt-3 w-fit">
            <Link href="/verified">Browse verified challenges</Link>
          </Button>
        </CardHeader>
      </Card>
    ),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome back, {me.displayName ?? me.handle}
      </h1>
      <p className="mt-1 text-muted-foreground" data-testid="goal-intro">
        {layout.intro}
      </p>
      {!me.emailVerified ? (
        <Alert className="mt-4">
          Verify your email to take verified challenges and post in the community.{' '}
          <Link href="/settings" className="underline">
            Resend the link
          </Link>
        </Alert>
      ) : null}
      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-4">
          {progress?.status === 200 ? <ProgressCard p={progress.data} /> : null}
          {progress?.status === 200 && progress.data.placement === 'none' ? (
            <Card data-testid="placement-prompt">
              <CardHeader>
                <CardTitle>Find your starting level</CardTitle>
                <CardDescription>
                  10 quick questions (about 3 minutes) so recommendations fit you. Optional.
                </CardDescription>
                <Button asChild variant="outline" className="mt-3 w-fit">
                  <Link href="/onboarding/placement">Take the placement quiz</Link>
                </Button>
              </CardHeader>
            </Card>
          ) : null}
        </div>
        <div className="grid content-start gap-4">{layout.sections.map((s) => cards[s])}</div>
      </div>
    </div>
  );
}
