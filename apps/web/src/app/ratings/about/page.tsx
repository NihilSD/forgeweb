import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How ratings work',
  description: 'What your Forge rating means, what changes it and what never does.',
};

/** V1.1: the rating system in plain language (B2 English, no formulas). */
export default function RatingsAboutPage() {
  return (
    <article className="mx-auto grid max-w-2xl gap-6 px-4 py-10 leading-relaxed">
      <header className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">How ratings work</h1>
        <p className="text-muted-foreground">
          Your rating is a number that shows how hard the problems are that you can solve on your
          own, under time. You have one rating per track, for example Algorithms or SQL.
        </p>
      </header>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">What changes your rating</h2>
        <p>
          Only <strong>verified challenges</strong> (and, later, contests and duels). Each one is
          like a match between you and the problem:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Solve it and get a verified result: your rating goes up.</li>
          <li>Run out of time without an accepted solution: your rating goes down.</li>
          <li>
            Beating a harder problem moves your rating more than beating an easy one. Missing a hard
            problem costs less than missing an easy one.
          </li>
        </ul>
      </section>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">What never changes it</h2>
        <p>
          <strong>Practice never changes your rating.</strong> Solving practice problems, using
          hints or AI help, lessons, the daily challenge and XP have no effect, so you can learn
          freely. A verified result that is shown as <em>unverified</em> does not count either. If a
          result goes to review, it counts only after a moderator verifies it.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">Placement: your first 5 events</h2>
        <p>
          Everyone starts at 1500. After 5 rated events in a track, we know enough to show your
          rating; until then you see how many events are left. Early results move your rating more,
          because we know less about you. It settles as you complete more challenges.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">The ± number</h2>
        <p>
          Next to your rating you see a range, for example 1620 ±80. Your true level is very likely
          inside that range. It gets smaller as you do more rated challenges, and slowly grows again
          if you take a long break, so your first result after a break can move your rating a little
          more.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">Problem ratings</h2>
        <p>
          Problems have ratings too. A new problem starts from its difficulty (Easy 1000, Medium
          1400, Hard 1800, Expert 2200). Every week we update it from verified results: if most
          people solve it, its rating goes down; if most run out of time, it goes up.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">For the curious</h2>
        <p>
          Forge uses the Glicko-2 rating system by Mark Glickman, which is also used by several
          online chess sites. Each verified challenge is one rated event against the problem&apos;s
          rating.
        </p>
      </section>

      <p>
        <Link href="/ratings" className="underline underline-offset-4">
          See your ratings
        </Link>
      </p>
    </article>
  );
}
