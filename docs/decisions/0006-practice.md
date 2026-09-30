# 0006 — Practice: hints, editorials, mastery, review, courses (phase L6)

Date: 2026-09-30 · Status: accepted

## Entitlements

`EntitlementsService` is the only place plan limits are decided (CLAUDE.md). It reads
`packages/shared/src/plans.ts`; the plan itself comes from a resolver that phase L10 replaces with a
subscription-backed one. `/me/entitlements` lets the web app show locks; it never decides access.

- **Hints**: 4 levels revealed in order. Free: 3 levels per day, counted in the user's own time zone.
  Re-reading a revealed hint is free. Pro: unlimited.
- **Editorials**: Pro, and only after the user solves the problem or gives up.
- **Review queue**: Pro.
- **Lessons**: the first 3 lessons of every course are free; the rest need Pro.

## Mastery (spec 8)

Per concept tag, 0–100 points, 20 points per level (0–5). A problem's **first** solve adds
10/20/30/40 points (easy→expert) to each of its tags, minus 25% per hint level used (the same
penalty as XP). Solving again adds nothing. Weights live in `practice.service.ts` and will be tuned
with real data.

## Review queue

A solve counts as a struggle after 3+ failed submits, 2+ hint levels, or giving up. Struggles are
scheduled 2 days later; solving at or after the due date moves the item to 7 days, then 21 days,
then it is finished. Solving before it is due changes nothing; a new struggle restarts it.

## Recommendations

Due reviews first (Pro), then unsolved listed problems whose tags have the lowest mastery, preferring
difficulties near the user's average level and their chosen languages.

## Courses and lessons

- Lessons are `.mdx` files with frontmatter (`title`, `order`, `concepts`, `status`). The body is
  rendered as Markdown (no raw HTML) with two directives: ` ```exercise <problem-id> ` embeds
  a runnable mini-workspace, ` ```visualizer <kind> ` embeds a visualizer. We deliberately don't
  compile MDX: lesson content never runs JavaScript, and no MDX toolchain is needed.
- Lesson exercises are ordinary problem packages with `listed: false`: validated like every other
  package, hidden from the library. A lesson is completed only once its exercises are solved.
- `pnpm problems:validate` also validates courses (frontmatter, tags, referenced exercises and
  visualizers exist). `pnpm problems:import` imports both.
- Drafted content: 3 courses × 4 lessons, 6 pattern lessons, 12 exercises and 4 new pattern-drill
  problems, all marked needs-review.

## Visualizers

Two pointers, sliding window, grid fill (DP) and BFS. Each is driven by a step list produced by an
instrumented copy of the algorithm (`components/visualizers/steps.ts`, unit-tested). Auto-play is
disabled for users who prefer reduced motion.

## Fixes found while building this phase

- Node harness: large result lines on a non-blocking stdout pipe threw `EAGAIN`; it now retries
  partial writes. This affected the production runner too.
- Validator: batches are split into chunks of 5 seeds and run in parallel. This keeps request sizes
  small and makes timing-out wrong solutions about 5× faster to check.
