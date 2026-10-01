import type { MyRatings } from '@forge/shared';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { RatingChart } from '@/components/ratings/rating-chart';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';

export const metadata: Metadata = { title: 'Ratings', description: 'Your rating in each track.' };

export default async function RatingsPage() {
  await requireMe();
  const res = await apiServer<MyRatings>('/me/ratings');
  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-10">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ratings</h1>
        <p className="text-muted-foreground">
          One rating per track, from verified challenges only. Practice never changes it.{' '}
          <Link href="/ratings/about" className="underline underline-offset-4">
            How ratings work
          </Link>
        </p>
      </header>
      {res?.status !== 200 ? (
        <Alert variant="destructive">Could not load your ratings.</Alert>
      ) : (
        res.data.tracks.map((t) => (
          <Card key={t.track.slug} data-testid={`rating-${t.track.slug}`}>
            <CardHeader>
              <CardTitle className="flex items-baseline justify-between gap-4">
                <span>{t.track.name}</span>
                {t.rating !== null ? (
                  <span className="text-2xl tabular-nums">
                    {t.rating}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ±{t.uncertainty}
                    </span>
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {t.rating === null ? (
                <>
                  <p className="text-sm">
                    {t.events === 0
                      ? 'No rated events yet. Your rating appears after 5 verified challenges in this track.'
                      : `Placement: ${t.events} of 5 rated events. Your rating appears after ${t.placementRemaining} more.`}
                  </p>
                  <progress
                    className="h-2 w-full accent-primary"
                    max={5}
                    value={t.events}
                    aria-label={`${t.track.name} placement: ${t.events} of 5`}
                  />
                  <Link href="/verified" className="text-sm underline underline-offset-4">
                    Start a verified challenge
                  </Link>
                </>
              ) : (
                <RatingChart history={t.history} label={`${t.track.name} rating`} />
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
