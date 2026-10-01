# Load tests (phase L12)

Targets from the spec: **500 concurrent users browsing** and **50 submissions per second for 5
minutes**, on staging (never production). Uses [k6](https://k6.io) as a standalone binary; it is
not a project dependency.

1. Deploy staging (L13) with production-like sizing and the runner hosts attached.
2. Create 200 load-test accounts (`loadtest-0@example.com` … with one shared password) and verify
   their emails; raise their submission rate limit or use enough accounts that each stays under
   30 submissions per minute (200 accounts × 15/min = 50/s).
3. `k6 run -e BASE_URL=https://staging… infra/load/browse.js`
4. `k6 run -e BASE_URL=https://staging… -e PASSWORD=… infra/load/submit.js`
5. Watch: API p95, queue depth (`bull:runner-jobs:wait`), runner CPU, Postgres connections,
   and that submissions finish (`status: done`) within 10 s at p95.

Thresholds are encoded in the scripts (error rate < 1%, page p95 < 1.5 s, API p95 < 400 ms,
submit p95 < 500 ms for the 202). Record results in docs/SECURITY_REVIEW.md.

Local reference (this sandbox, single runner, runc): `apps/runner/test/load.test.ts` runs 100
submissions with a median of ~0.8 s each.
