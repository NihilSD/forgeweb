# Forge

Learn IT skills, prove them fairly, get hired. The full specification is [docs/SPEC.pdf](docs/SPEC.pdf);
rules for contributors (human or Claude Code) are in [CLAUDE.md](CLAUDE.md).

## Quick start

Requirements: Node.js 22 LTS, pnpm 12, Docker.

```bash
pnpm install
cp .env.example .env          # then set APP_SECRET and ENCRYPTION_KEY (see comments)
pnpm dev:services             # PostgreSQL, Redis, MinIO, Mailpit
pnpm db:deploy && pnpm db:seed
pnpm problems:import          # load content/problems into the database
pnpm dev                      # web on :3000, API on :4000
```

Mailpit (local email inbox) is at http://localhost:8025.

## Commands

| Command                  | What it does                                                    |
| ------------------------ | --------------------------------------------------------------- |
| `pnpm dev`               | Start web, API and package watchers                             |
| `pnpm lint`              | ESLint + type-check every package                               |
| `pnpm test`              | Unit and integration tests (needs PostgreSQL and Redis running) |
| `pnpm test:e2e`          | Playwright end-to-end tests                                     |
| `pnpm problems:validate` | Validate every problem package in `content/problems`            |

Tests use the databases `forge_test` and `forge_e2e`; create them once:

```bash
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U forge -c "CREATE DATABASE forge_test" -c "CREATE DATABASE forge_e2e"
```

## Layout

See section 2 of the spec. `apps/web` (Next.js), `apps/api` (NestJS), `apps/runner` (sandboxed code
execution, isolated hosts only), `packages/*` (shared code), `content/` (problems and courses),
`sandboxes/` (per-language images), `infra/`, `docs/`.
