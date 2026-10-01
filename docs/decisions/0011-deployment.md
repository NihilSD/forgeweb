# 0011 — Deployment, monitoring and backups (phase L13)

Date: 2026-10-01 · Status: accepted

## Shape

- **App VM**: Docker Compose (`infra/production/docker-compose.yml`): Caddy (TLS, the only
  published ports), web (Next.js standalone), API, Postgres 17, Redis, and a separate **job Redis**
  for runners. **Runner VMs**: systemd service on the host (not a container: the runner
  bind-mounts temp dirs into sandboxes), gVisor, nftables default-deny. Spec 2: Compose on EU
  VMs, runners separate; Kubernetes only when scale needs it.
- **Images** from one multi-stage `infra/docker/Dockerfile`, built and pushed to GHCR by the
  `Release images` workflow on `v*` tags. `pnpm deploy --prod` gives self-contained trees: API
  564 MB, web 401 MB, tools 1.1 GB (Prisma CLI for migrations), runner bundle 561 MB.
- **Secrets** in `/etc/forge/forge.env` (root, 600), passed to Compose as `--env-file`. Only the
  API container receives the whole file; web gets three non-secret settings, tools only the
  database URL. Production boot refuses development secrets, http origins, a dev SMTP server,
  missing runner keys or no alert channel (`envSchema` + `env.test.ts`).
- **Deploy** (`scripts/deploy.sh <tag>`): pull → backup → expand-only migrations → content
  import → switch → wait for `/health` to report the new version, inside the stack and through
  Caddy → automatic switch back on failure. **Rollback** swaps images only; the schema stays
  (migrations are expand-only by policy).
- **Backups**: `pg_dump` encrypted with GPG to the owner's public key; the server can't decrypt
  them. Kept 30 days locally and offsite (bucket lifecycle). Restores decrypt fully before
  touching a database, because GPG verifies integrity only at the end of the stream.
- **Monitoring** in the API itself (no new service): runner heartbeats, backlog, failing webhooks,
  5xx bursts and backup age, alerting by email and/or webhook on state changes, plus a public
  status page and a token-protected Prometheus endpoint with aggregate product counts (the
  "analytics without personal data" of the spec: no third-party script, no cookies).

## Found and fixed by rehearsing locally

| Problem                                                                                                                                                                        | Fix                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Caddy `trusted_proxies private_ranges` let a client-sent `X-Forwarded-For` through (Docker's port proxy connects from a private address), so rate limits keyed on a spoofed IP | Caddy trusts no proxy; the API trusts exactly 2 hops (`TRUST_PROXY_HOPS`, Caddy + Next.js rewrite); verified live |
| Node as PID 1 ignored the re-raised SIGTERM after a graceful shutdown: the API stopped listening but the container stayed "running", so it was never restarted                 | `init: true` (tini) for app containers; verified: exits 143, restarts after a crash                               |
| Empty `ACME_EMAIL` crashed Caddy, and the health check (inside the stack) still passed                                                                                         | `ACME_EMAIL` required; deploy also checks through Caddy with TLS                                                  |
| GPG streams plaintext before its integrity check, so a damaged backup started restoring                                                                                        | Decrypt fully into the target container, then `pg_restore`                                                        |
| A crash-looping release kept the site down for the full 120 s health wait                                                                                                      | `wait_healthy` fails fast after 3 API restarts                                                                    |
| Replay purge (12-month retention) wasn't scheduled                                                                                                                             | `ReplayPurgeScheduler` every 6 h                                                                                  |
| No way to create the first admin in production                                                                                                                                 | `grant-role` CLI (audited, revokes sessions)                                                                      |

## Rehearsal record (local Docker, 2026-10-01)

Clean first deploy (migrations, content import, first backup) → end-to-end submission through
Caddy, job Redis ACL, runner and signed callback (Accepted) → upgrade v1→v2 (29 s) → runner
stopped: `FIRING: runners-down` at the webhook after ~70 s, `RESOLVED` within 60 s of restart →
rollback v2→v1 (5 s, data kept) → backup with data → `restore-test.sh` PASSED with matching counts;
tampered file rejected → deploy v3 from v1 (pre-deploy backup, 10 s) → `grant-role` CLI made a
superadmin (audited; an invalid role exited 1) → **broken release** v4 (API crashes on boot):
deploy detected the crash loop, switched back to v3 and exited 1 (15 s total, ~5 s outage; before
the crash-loop check it took 150 s) → **production restore** of an earlier backup: refused
without `--yes-replace-production`, refused a tampered file with production untouched, then
restored in 9 s (safety backup, decrypt, recreate, restore, healthy); the role granted after
that backup was gone, as expected.

Not rehearsable here: gVisor (no `runsc` in this sandbox; the production runner refuses `runc`),
Let's Encrypt (Caddy's internal CA was used), offsite upload, real email delivery.
