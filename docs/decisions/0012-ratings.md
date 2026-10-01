# 0012 — Ratings (phase V1.1)

Date: 2026-10-01 · Status: accepted

Spec 8: Glicko-2 per user per track, starting at 1500, updated only by Competitive results, hidden
until 5 rated events; problem ratings start from difficulty and are recalculated weekly. Users'
explanation: `/ratings/about`.

## Glicko-2

- `packages/shared/src/glicko2.ts`, pure functions, τ = 0.5, start 1500 / RD 350 / σ 0.06, RD
  capped at 350.
- **Reference vectors**: Glickman's worked example ("Example of the Glicko-2 system"), every
  step. The paper rounds intermediates to 4 digits, so its printed v (1.7785) and r′ (1464.06)
  differ from exact arithmetic (1.77898, 1464.0507). The test checks the paper within its
  rounding **and** pins the exact values.

## What is a rated event

| Attempt result (L8)                          | Rating                                                 |
| -------------------------------------------- | ------------------------------------------------------ |
| `verified`                                   | a win (score 1) against the problem                    |
| `expired` (time ran out, no accepted submit) | a loss (score 0)                                       |
| `unverified`                                 | never counts ("result shown, not counted", spec 7)     |
| `review`, `appealed`                         | waits; counts as a win only if a moderator verifies it |
| `in_progress`, `followups`                   | not final                                              |

The opponent is the problem's rating and RD at the time. One event = one rating period. Before an
update, the RD grows for each whole idle week since the last event (Glicko-2 step 6), so a rating
after a long break is less certain and moves more.

**No dodging losses:** attempts only expired lazily before, so abandoning a failing attempt would
have avoided the loss. `AttemptsService.expireStale()` now settles them every 10 minutes.

## Pipeline

`AttemptsService` fires `onFinal` when a result becomes final (finish, expiry, moderator decision)
→ `rating-updates` BullMQ queue (main Redis, job id per attempt, removed on completion so a later
final result can be queued again) → `RatingsService.applyAttempt`: reads only the `Attempt` row,
takes a per-user-and-track advisory lock, writes `Rating` and a `RatingChange` with a unique
`eventKey` (`attempt:<id>`), so retries and duplicate jobs are no-ops. A reconciler queues any
final result without a change (lost jobs). Practice data (submissions without an attempt, hints,
XP, lessons, the daily challenge) is never read: the acceptance test runs all of them, plus the
reconciler and the queue, and finds no rating rows.

## Placement and display

`GET /me/ratings`: per track, `rating: null` and only the event count until 5 events (the
provisional value never leaves the server); then the rating, ±2 RD (shown as "±"), and the history
(up to 200 events). The web `/ratings` page draws the history as a single-series line chart
(crosshair + tooltip, arrow keys, table view; colours validated against both themes' surfaces).
Public profiles arrive in V1.7, where the per-track rating will be shown too.

## Weekly problem ratings

`ProblemRatingService.run()` once per ISO week (`ProblemRatingRun` row claims the week; the
scheduler calls it every 10 minutes, so it runs early on Monday UTC): each problem is a Glicko-2
player whose games are the rated events since the last run, against the solver's pre-event rating;
the problem wins when the solver ran out of time. Problems without events keep their rating and RD
(problems don't get rusty). New problems start with RD 200. The content importer sets the rating
only when a problem is created, so re-imports never reset it (tested).

## Not done / later

- Contest and duel events (V1.2, V1.3) plug into the same `RatingChange` table (`kind`).
- Rating leaderboards and public profile display (V1.4, V1.7).

## Verification (2026-10-01)

`pnpm lint`, `pnpm format:check`, `pnpm test` (shared 15, problem-kit 39, web 21, runner 63,
API 219) and `pnpm test:e2e` (34 passed; the 5 perf tests run separately with `PERF=1`) all pass.
