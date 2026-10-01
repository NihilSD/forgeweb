# 0008 — Verified attempts and integrity (phase L8)

Date: 2026-10-01 · Status: accepted

Scoring and every weight are documented separately in
[integrity-score.md](integrity-score.md). This ADR covers the flow and the data.

## Flow (spec 7.1)

1. **Consent** (`/verified/[slug]`): lists what is recorded and what isn't (no webcam, nothing
   outside the tab). Consent is a required `consent: true` field on every start, and the time is
   stored on the attempt (`consentAt`). Starting needs a verified email.
2. **Start** (`POST /verified/:slug/attempts`): the server picks a random 32-bit seed (`randomInt`),
   builds the instance and stores `sha256(params + data)` as `instanceHash`. If another attempt
   already used that instance, it draws again (up to 8 times), so two users don't get the same
   instance. A per-user Postgres advisory lock makes "one open attempt" and the weekly limit hold
   under concurrent starts. The attempt always uses the problem version it started on.
3. **Workspace** (`/attempts/[id]`): full screen (requested in the consent click), a visible timer
   corrected for clock skew, no hints, notes, editorial or AI. Practice hints and the editorial for
   that problem return `ATTEMPT_CLOSED` while an attempt on it is open.
4. **Events**: `AttemptRecorder` batches events every 5 s (`POST /attempts/:id/events`) and flushes
   before every run and submit. A batch carries `seq`, so retries are idempotent (unique
   `(attemptId, seq)`). The server stores each batch gzip-compressed (`AttemptEvent.payload`).
   Runs, submits and follow-up answers are recorded **server-side** and never taken from the client.
5. **Submit**: hidden tests as in Practice. The first accepted submit ends the coding phase
   (`followups`). Submissions are accepted up to 10 s after the timer ends. An attempt past its time
   without an accepted submit becomes `expired` once its last submissions are graded.
6. **Follow-ups**: see below. Then the integrity score sets `verified`, `unverified` or `review`.

Timeouts are applied lazily when the attempt is read (`settle`), so no background job is needed.
An abandoned follow-up phase is closed after 15 minutes, with unanswered questions counted wrong.

## Edit offsets and replays

Monaco reports change offsets that count `\r` when a model uses CRLF. The recorder therefore keeps
an LF shadow copy of the document and converts each change's line/column range into an LF offset
(`lib/edit-offsets.ts`, unit-tested). The server (`replayDocument` in `packages/shared`) and the
replay viewer apply the same changes to the LF starter, so an honest session always reproduces the
submitted code exactly. The e2e test caught this: without it, every edit after a CRLF reset looked
like missing data.

## Follow-ups (spec 7.3)

`followups.ts(instance, userCode, language)` returns candidate questions. The server picks up to 3
per attempt, deterministic per seed and always including one graded by running code
(`selectFollowUps`). Answers come from the user's **own** code:

| Kind      | Answer type      | How the server knows the answer                                           |
| --------- | ---------------- | ------------------------------------------------------------------------- |
| Predict   | `run` / `value`  | the user's code runs on the question's input                              |
| Edge case | `run` / `passes` | Yes if the user's code returns the expected value                         |
| Change    | `lines` (new)    | lines of the user's code matching the rule's pattern (signature excluded) |
| Explain   | `static`         | computed by `followups.ts` from the structures the code uses              |

Run-based inputs travel as extra **probe tests** (`fu-<id>`) in the same runner job as the submit:
one sandbox run, no second queue round trip. `grade()` ignores them, and their raw results are
stored server-side in `Submission.result.probes`, never in the client view. A question whose probe
crashed, or whose change pattern matches none of the user's lines, is dropped as unfair rather than
counted wrong. Answers are read leniently (JSON or Python literals, floats within 1e-6, "line 4").
Each question has 90 s plus 3 s grace, measured from when the server first served it.

The validator now checks `followups.ts` against every reference solution on 10 seeds: at least 2
questions, unique ids, static answers among their options, Yes/No for `passes`, change patterns
that match at least one line, and at least one run-graded question.

## Access

- Attempts, events, follow-ups and the owner replay (`/attempts/:id/replay`) are owner-only.
  Other users get 404, the same as a missing attempt.
- Moderators (and superadmins) use `/admin/attempts/*`, which, like every admin route, needs TOTP
  2FA. The moderator replay includes the signal breakdown and is audit-logged
  (`attempt.replay_viewed`). Owners see their score and status, not the weights.
- Moderators cannot decide on their own attempts. Decisions create a `Review` row, set the
  attempt's status and close a pending appeal (`upheld` if verified, `denied` otherwise). Each
  decision is audit-logged.
- The queue shows handles, never e-mail addresses. Audit entries never contain code.

## Limits

Free: 3 verified starts per week, counted from Monday in the user's time zone
(`EntitlementsService.verifiedStartsRemaining`, using `PLAN_LIMITS.verifiedPerWeek`). Pro:
unlimited. Starting is refused with `LIMIT_REACHED`.

## Retention

Replays are deleted 12 months after an attempt finishes unless `replayPublic` is set
(`pnpm --filter @forge/api replays:purge`, to be scheduled daily in L13). The attempt row and its
result stay. Data export includes attempts, follow-up answers and appeals.

## Not in this phase

- Spec 7.1 step 5 also mentions quality checks (linters, security scanners) on submit. They are not
  among the L8 build steps and are left for a later phase.
- There is no UI yet for making a replay public (the flag exists; profiles come later).
- Template retirement on leak detection uses the existing problem `retired` status by hand.
