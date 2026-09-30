# Forge - rules for Claude Code

The full specification is docs/SPEC.pdf. Read the sections a phase references before
starting. If this file and the spec disagree, stop and ask.

## How to work

- One phase at a time, in order. Never start a phase I didn't ask for.
- Before coding: restate the phase goal, list files to create/change, list risks.
- Tests first for security-sensitive work (auth, permissions, runner, billing, integrity).
- A phase is done only when lint, type-check, unit, integration and e2e tests all pass.
  Show the command output.
- End every phase with: what was built, what's untested, what needs my manual action.
- Ask before adding a dependency not named in the spec. Use current stable versions only;
  look them up, never invent version numbers, no pre-releases.
- Small commits with clear messages. Record significant decisions in docs/decisions/.

## Security rules (never break)

- No secrets in git. .env files are git-ignored; document variables in .env.example.
- Authorization is checked in the API for every resource. The UI never decides access.
- Plan limits only through EntitlementsService and packages/shared/plans.ts.
- Validate every input with zod schemas from packages/shared.
- Untrusted code runs only in apps/runner sandboxes on isolated hosts. Never exec user code
  in the API or web app.
- Hidden tests, reference solutions and competitive templates never leave the server.
- Sanitize all user-generated markdown. No raw HTML rendering.
- AI features are never available during verified attempts, contests or duels.
- Never log passwords, tokens, session IDs, full emails or code from verified attempts.

## Conventions

- TypeScript strict everywhere. No `any` without a comment explaining why.
- API errors: { error: { code, message, details? } } with stable codes.
- Money in integer minor units with currency codes. Times in UTC.
- UI: shadcn/ui components and tokens from packages/ui; dark and light themes; WCAG 2.2 AA.
- Content: problem packages must pass `pnpm problems:validate`; drafted content gets
  status: needs-review until I approve it.

## Commands

- pnpm dev start everything locally
- pnpm lint && pnpm test lint, types, unit and integration tests
- pnpm test:e2e Playwright tests
- pnpm problems:validate validate all content packages
