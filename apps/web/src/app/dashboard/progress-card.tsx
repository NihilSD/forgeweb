import type { ProgressSummary } from '@forge/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@forge/ui';
import { Flame, Snowflake } from 'lucide-react';

/** Spec L9 step 2: a small profile summary. Neutral wording only: no guilt, no countdowns. */
export function ProgressCard({ p }: { p: ProgressSummary }) {
  const span = p.nextLevelXp - p.levelXp;
  const into = p.xp - p.levelXp;
  return (
    <Card data-testid="progress-card">
      <CardHeader>
        <CardTitle>Level {p.level}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1">
          <div className="flex justify-between text-sm">
            <span>{p.xp} XP</span>
            <span className="text-muted-foreground">
              {p.nextLevelXp - p.xp} XP to level {p.level + 1}
            </span>
          </div>
          <progress
            className="h-2 w-full accent-primary"
            max={span}
            value={into}
            aria-label={`Level ${p.level} progress`}
          />
          <p className="text-xs text-muted-foreground">{p.xpThisWeek} XP in the last 7 days</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="flex items-center gap-1" data-testid="streak">
            <Flame className="h-4 w-4 text-verdict-limit" aria-hidden />
            {p.streak.current} day streak
          </span>
          <span className="text-muted-foreground">Longest: {p.streak.longest}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Snowflake className="h-4 w-4" aria-hidden />
            {p.streak.freezesLeft} of {p.streak.freezesPerMonth} freezes left this month
          </span>
        </div>
        {!p.streak.activeToday ? (
          <p className="text-xs text-muted-foreground">
            A day counts when you solve a problem or finish a lesson. Missed days use a freeze
            automatically.
          </p>
        ) : null}
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <dt className="text-muted-foreground">Solved</dt>
            <dd className="text-lg font-semibold">{p.solved}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Verified</dt>
            <dd className="text-lg font-semibold">{p.verified}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Lessons</dt>
            <dd className="text-lg font-semibold">{p.lessonsCompleted}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
