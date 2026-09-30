# 0001 — Toolchain and version choices

Date: 2026-09-30 · Status: accepted

The spec asks for current stable versions. Where the newest release could not be used, this records why.

| Tool                | Version         | Note                                                                                                                                          |
| ------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js             | 22 LTS          | `engines >=22.12` (Prisma 7 and Vitest 5 minimum)                                                                                             |
| pnpm                | 12.8.1          | Workspaces use `allowBuilds` for packages with install scripts                                                                                |
| Turborepo           | 2.11.5          |                                                                                                                                               |
| TypeScript          | **6.0.3**       | 7.0 is out, but `typescript-eslint` 8.71 supports `<6.1.0`. Move to 7.x when it does.                                                         |
| Next.js / React     | 16.3.7 / 19.3.0 | App Router; `src/proxy.ts` (Next 16's replacement for middleware) sets the CSP nonce                                                          |
| NestJS              | 12.1.2          | ESM-only. See "Dependency injection" below                                                                                                    |
| Prisma              | **7.10.0**      | npm `latest` tag points at 8.0.0-rc.19, a pre-release, so we use the newest stable 7.x. Uses `prisma-client` generator + `@prisma/adapter-pg` |
| Tailwind CSS        | 4.3.3           | CSS-first config; tokens in `packages/ui/src/styles.css`                                                                                      |
| Vitest / Playwright | 5.0.3 / 1.63.0  |                                                                                                                                               |
| zod                 | 4.6.5           | Shared schemas in `packages/shared`                                                                                                           |

## Dependency injection without decorator metadata

NestJS normally infers constructor dependencies from `emitDecoratorMetadata`. esbuild/tsx and Vitest
do not emit that metadata, so every injected constructor parameter uses an explicit `@Inject(Token)`.
This keeps dev (tsx), tests (Vitest) and production (tsc) identical and removes a class of
"undefined dependency" bugs. Request validation uses zod pipes, not class-validator, so no other
metadata is needed.

## Dependencies added that the spec does not name

The spec names the stack but not every helper library. These were added as the smallest reasonable
way to meet a spec requirement:

- `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono` — self-hosted fonts (spec 9).
- `@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` — the
  standard shadcn/ui building blocks (spec 9 names shadcn/ui on Radix).
- `cookie-parser`, `ioredis` — cookies for server-side sessions; Redis client for rate limits.
- `@axe-core/playwright` — accessibility checks in Playwright (spec 11).
- `tsx` — runs TypeScript in development and CLIs.

Anything else is listed in the ADR of the phase that introduced it.

## Environment

A single git-ignored `.env` at the repo root is loaded with Node's built-in `process.loadEnvFile`
in non-production environments (no dotenv dependency). `.env.example` documents every variable.
