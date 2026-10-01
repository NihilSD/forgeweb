import type { Daily, Difficulty } from '@forge/shared';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { DifficultyBadge } from '@/components/difficulty-badge';

/** Today's challenge per track. Every user gets their own instance of the same template. */
export function DailyList({ daily }: { daily: Daily }) {
  return (
    <ul className="grid gap-2" data-testid="daily-list">
      {daily.items.map((d) => (
        <li key={d.track} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-24 shrink-0 text-muted-foreground">{d.trackName}</span>
          <Link href={`/problems/${d.slug}/solve`} className="font-medium underline">
            {d.title}
          </Link>
          <DifficultyBadge difficulty={d.difficulty as Difficulty} />
          {d.solved ? (
            <span className="flex items-center gap-1 text-verdict-accepted">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Done today
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
