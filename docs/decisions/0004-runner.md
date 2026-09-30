# 0004 — Code runner (phase L4)

Date: 2026-09-30 · Status: accepted

## Shape

```
API ──signed job──▶ job Redis (BullMQ "forge-runs") ──pull──▶ runner host
 ▲                                                            │ docker run --runtime=runsc …
 └──────────── HTTPS callback, HMAC(timestamp.body) ◀─────────┘
```

- The API regenerates tests from the stored instance seed, builds an `ExecRequest`, signs it and
  enqueues it. Hidden tests are never stored on submissions and never reach the browser.
- The runner verifies the signature and age, runs the job in a fresh container with the
  restrictions in `docs/runner-security.md`, and posts the raw `ExecResult`.
- The API verifies the callback, checks that the job id is the submission's current one and still
  open (replays get 409), grades, and stores a client-safe view.
- `internal_error` is retried once with a new job id (the old id is dead). It never counts as a
  failure or a solve.

## Where the code lives

- `packages/problem-kit/src/exec/docker-executor.ts`, `watchdog.ts`, `parse.ts`, `csv.ts`,
  `runner-protocol.ts`: shared by the runner, the validator (`--executor docker`) and the API (protocol
  only). The API never imports the executors.
- `apps/runner`: the BullMQ worker, config and heartbeat.
- `sandboxes/*/Dockerfile`: base images pinned by digest; harnesses copied in.

## Decisions

- **gVisor** is required in production (the executor refuses to construct with runc when
  `NODE_ENV=production`). Development and CI use runc with the same flags; the attack suite must also
  pass on the runner VM with runsc.
- **Progress watchdog** instead of a single overall timeout: kill when no result line arrives within
  `timeMs + 1.5 s`, because a synchronous infinite loop can't be interrupted from inside.
- **SQL** runs in a PostgreSQL started inside the sandbox from a template cluster on tmpfs. Each test
  gets its own database; the user's query runs as a SELECT-only `solver` role with read-only
  transactions and `statement_timeout`. psql prints NULL as a control-character sentinel so NULL and
  `''` compare correctly.
- **`--ipc none`**: no `/dev/shm`. PostgreSQL uses `dynamic_shared_memory_type=mmap`.
- **Seeds** are uint32 but Postgres `INT` is signed: stored as int32 and read back with `>>> 0`.
- Harnesses reduce the environment to an allowlist; base images set variables such as `GPG_KEY`.

## Measured (development machine, runc)

- Container start + run: about 0.3–0.4 s (Python, JS/TS), 0.7 s (SQL).
- 100 submissions on 8 slots: 0 errors, median 830 ms, p95 1.1 s (acceptance: median under 2 s).
- Validating the 6 sample packages in real sandboxes: about 50 s with 6 parallel groups.

## Dependencies added

`bullmq` (named in the spec), `ioredis` (BullMQ's Redis client).
