# Integrity score (spec 7.4)

Date: 2026-10-01 · Status: accepted, weights provisional until tuned with real data

The score is a pure function of an attempt's logs: `computeIntegrity()` in
`apps/api/src/integrity/integrity-score.ts`. **Every weight lives in one file,
`apps/api/src/integrity/integrity.config.ts`.** Changing a weight affects new attempts only; stored
scores and the signal breakdown saved with each attempt are not recomputed.

`score = clamp(0, 100, round(base + Σ signal effects))`, with `base = 50`.

| Score | Status       | Meaning                                                               |
| ----- | ------------ | --------------------------------------------------------------------- |
| ≥ 70  | `verified`   | Counts as a verified result.                                          |
| 40–69 | `unverified` | Result shown, not counted. The user may appeal.                       |
| < 40  | `review`     | A moderator watches the replay and decides. The user may also appeal. |

Nothing is ever banned automatically. The lowest outcome is a human review (spec 7: "never bans on a
single signal"). The tests check that no single signal other than the follow-ups can push an
otherwise honest attempt into `review`.

## Signals

Each signal is stored on the attempt (`Attempt.signals`) with its raw value and its effect, and
moderators see the breakdown next to the replay. Owners see only the score and status, so the
weights aren't handed to people trying to game them.

### `followups`: follow-up accuracy (strongest)

- **Input:** the share of the 2–3 follow-up questions answered correctly. Answers are graded
  server-side against the user's _own_ submitted code: predict and edge-case questions use the
  runner's output, change questions use the lines of their code that depend on the rule, and
  explain questions use the structure their code actually uses. A question not answered within 90
  seconds counts as wrong.
- **Effect:** linear from −40 (all wrong) to +30 (all right). With 3 questions: −40, −16.7, +6.7,
  +30. This is the strongest positive and the strongest negative signal (spec).
- **Why:** someone who wrote the code can say what it returns and where a rule lives. Someone who
  pasted it usually can't, at least not within 90 seconds.

### `paste`: large pastes from outside the editor

- **Input:** the total length of pastes of at least 40 characters that did _not_ come from a copy
  inside the editor during this attempt, divided by the final code length (capped at 1). A single
  edit that inserts 120 or more characters with no paste event within a second (drag and drop,
  scripts, a suppressed paste event) is counted the same way.
- **Effect:** −35 × share. Pasting the whole solution costs 35 points.
- **Why:** spec: "negative, scaled by size relative to the final solution". Moving your own code
  around (internal pastes) and short pastes are normal.

### `replay`: recorded edits reproduce the submitted code

- **Input:** the server replays every recorded edit on top of the starter code
  (`replayDocument()` in `packages/shared`) and compares the result with the accepted submission
  (line endings normalised, trailing whitespace ignored).
- **Effect:** −25 when they differ, 0 when they match.
- **Why:** client events can be blocked or forged. Code that the recording can't explain is
  treated almost like an outside paste. Batches are retried and flushed before every submit, so
  honest users don't normally lose events.

### `focus`: time out of focus

- **Input:** total time the workspace window was blurred or the tab hidden, with overlapping
  periods counted once and an open period running to the moment of the solve.
- **Effect:** 0 up to 60 seconds in total. Beyond that, −6 per minute, at most −30.
- **Why:** spec: "negative beyond 60 seconds total". On its own it can make an attempt unverified,
  never send it to review.

### `fullscreen`: full-screen exits

- **Input:** number of `fullscreen_exit` events.
- **Effect:** −1 per exit, at most −5.
- **Why:** recorded by the spec (7.2). Leaving full screen usually also blurs the window, which
  `focus` already prices, so this weight is deliberately small.

### `speed`: solve time far below typical

- **Input:** time from start to the accepted submission, divided by the median solve time of
  verified attempts on the same problem. Until a problem has 10 verified solves, 40% of its
  verified time budget is used as the typical time.
- **Effect:** below 10% of typical: −15. Below 25%: −7. Otherwise 0.
- **Why:** spec: "compared with the distribution of verified solvers". Fast solvers exist, so this
  is a mild signal.

### `editing`: natural editing history

- **Input:** number of edit events, whether the user ran their code before the final submit, and
  whether a failing run or submit was later followed by a passing one.
- **Effect:** +5 for at least 20 edit events, +5 for running before submitting, +5 for a fix after
  a failure (at most +15).
- **Why:** incremental edits, runs and fixes are what real problem solving looks like (spec:
  "positive").

### `trust`: account trust

- **Input:** verified email, account age, earlier verified attempts.
- **Effect:** +2 for a verified email, +2 for an account at least 30 days old, +1 for at least one
  earlier verified attempt (at most +5).
- **Why:** spec: "small positive".

## Reference outcomes (from the unit tests)

| Scenario                                                                  | Score | Status     |
| ------------------------------------------------------------------------- | ----- | ---------- |
| Honest: typed over 11 minutes, one failing run then a fix, 3/3 follow-ups | 99    | verified   |
| Honest with one wrong follow-up                                           | ≈ 76  | verified   |
| Whole solution pasted after 2 minutes, 3/3 follow-ups                     | ≈ 42  | unverified |
| Whole solution pasted, 0/3 follow-ups                                     | 0     | review     |
| Nine minutes away from the tab, then typed quickly, 3/3 follow-ups        | ≈ 69  | unverified |
| Honest typing, 0/3 follow-ups                                             | ≈ 29  | review     |

## Tuning

Weights are starting values. Once there are real attempts, compare scores with moderator decisions
(the `Review` table) and adjust the config. Moderator decisions are the ground truth. Record each
change and its reason in this file.
