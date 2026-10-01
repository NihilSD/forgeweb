# 0009 — Daily challenge, XP, streaks, placement and weekly email (phase L9)

Date: 2026-10-01 · Status: accepted

Principle (phase prompt): **no dark patterns**. No guilt notifications, no countdowns to losing a
streak, emails are opt-in with one-click unsubscribe.

## Daily challenge

- One `DailyChallenge` per track per **UTC date** (`@@unique([date, trackId])`), so it changes at
  midnight UTC for everyone. `DailyService` runs every 5 minutes (outside tests) and `GET /daily`
  also ensures the day exists, so a late scheduler never shows an empty day. Concurrent runs are
  safe (`createMany … skipDuplicates`).
- **Queue**: published, listed, practice-visible problems of the track. Publishing in production
  requires `review: approved`, so the queue only holds approved content. Lesson exercises and
  competitive-only templates are never picked.
- **Pick** (`pickDaily`, pure): the problem used least often as a daily, then the one used longest
  ago, then a stable hash of date and slug. Yesterday's problem is never repeated when there is an
  alternative. The same date always gives the same pick.
- **Same template, unique instance**: everyone gets the same problem, and each user solves their own
  Practice instance of it (seeded per user). A test generates 25 users' instances for every daily
  and checks that each is valid and that they differ.
- The +10 XP daily bonus is awarded once per track and date (`daily:<date>:<track>`) for an accepted
  practice submit or correct flag on that UTC date.

## XP and levels (spec 8)

| Event                    | XP                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------- |
| First solve of a problem | easy 10, medium 20, hard 40, expert 80, minus 25% per hint level used (never below 0) |
| Lesson completed         | 5                                                                                     |
| Daily challenge solved   | +10                                                                                   |
| Verified attempt         | no XP (it counts for the streak)                                                      |

Each award is an `XpEvent` with a unique `(userId, sourceKey)` (`solve:<problemId>`,
`lesson:<lessonId>`, `daily:<date>:<track>`), so retries and concurrent callbacks can't double-count.
Totals are summed from the events.

Levels: reaching level L needs `50 · L · (L − 1)` XP: 0, 100, 300, 600, 1000, 1500… Early levels
come quickly, later ones need steady practice. The rules live in `apps/api/src/engagement/rules.ts`.

## Streaks

- A day counts with one accepted submit, correct flag or completed lesson, as a **calendar day in the
  user's time zone** (`localDay`, using the IANA zone from their profile). This handles UTC offsets
  of −12 to +14 and 23/25-hour daylight-saving days. Tests cover Auckland, Los Angeles,
  Kiritimati, Tokyo and Bucharest across both DST changes.
- **Freezes** (Free 2 a month, Pro 5, from `PLAN_LIMITS`) are applied automatically when the user
  comes back after missed days, if enough are left that month. They are never a purchase or a
  prompt. Freezes are counted against the month of the day the user returns.
- The streak shown "now" stays standing while the missed days can still be covered by freezes.
  Updates run under a per-user advisory lock.
- Copy is neutral: "A day counts when you solve a problem or finish a lesson. Missed days use a
  freeze automatically."

## Placement quiz

- 10 multiple-choice questions in `content/placement/quiz.yaml`, **status: needs-review**.
  `pnpm problems:validate` checks the file (exactly 10, known concept tags, answer index in range,
  unique options and ids), and `problems:import` loads it. Questions are served only when the quiz is
  approved (or when drafts are published in development and tests).
- Answer indexes never leave the server. Each correct answer sets that tag's mastery to level 1
  (20 points), and never lowers mastery the user already earned. One result per user; skipping is
  recorded so the dashboard prompt goes away.
- Optional by design: a dashboard card, not a forced onboarding step.

## Dashboard by goal

The onboarding goal orders the dashboard sections (learn, interview, compete, career-change, teach),
with a one-line intro per goal. Every user also sees the progress summary (level, XP, streak,
freezes, solved, verified, lessons).

## Weekly progress email

- Off by default. Opt-in in Settings (`emailDigestOptIn`), verified email required.
- Sent once per local week, on Monday from 09:00 in the user's time zone (`digestSentWeek`, claimed
  before sending so two API instances never double-send). Weeks with no activity get **no email**,
  so there is never a "you've fallen behind" message.
- One-click unsubscribe: an HMAC-signed token (no expiry, user-scoped) in
  - `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (RFC 8058),
    which mail clients POST to `/api/v1/email/unsubscribe` without a session or CSRF token;
  - a body link to `/unsubscribe`, one button, no sign-in.

## Needs the owner

- Approve the placement quiz content (`content/placement/quiz.yaml`).
- Approve problems so the production daily queue isn't empty: tracks with no approved, published
  problems simply have no daily that day.
- Production email provider settings (SMTP_URL, EMAIL_FROM) and sender-domain authentication
  (SPF/DKIM) so one-click unsubscribe headers are honoured: phase L13.
