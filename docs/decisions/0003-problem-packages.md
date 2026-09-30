# 0003 — Problem packages, validation and the content pipeline (phase L3)

Date: 2026-09-30 · Status: accepted

## Package format (extends spec section 5)

```
content/problems/<id>/
  problem.yaml     spec fields + review, entry, comparator, verifiedMinutes
  statement.md     {{placeholders}} filled from generator params
  generator.ts     export default ({ rng, seed, flag? }) => { params, data?, files? }
  tests.ts         export default (instance, { rng, seed }) => { visible, hidden }  (not for flag)
  followups.ts     required when mode is competitive or both
  reference/       correct solution per language (flag: solve.py defining solve(files) -> flag)
  starter/         per language; fix-code starters contain the bug
  wrong/           known-wrong solutions; each must fail on every seed
  hints.md         ## 1. Nudge / 2. Approach / 3. Pseudocode / 4. Solution
  editorial.md     ## Idea / Why it works / Complexity / Common mistakes
```

Additions to the spec's `problem.yaml`:

- `review: needs-review | approved` — the human gate from CLAUDE.md. The API refuses to publish
  anything that is not `approved`.
- `entry` — the function name per language (Python and JS names differ).
- `comparator` — `exact`, `unordered`, `float`, `rows` or `rows-unordered` (SQL).

**Tests always carry expected values, including SQL** (rows computed in TypeScript). The reference
solutions are then an independent check: the validator requires the reference SQL/Python/JS to agree
with the TypeScript oracle on every seed.

## Validator rules (all from spec 5, some made stricter)

- Reference solutions pass all tests on 50 seeds (`--seeds` to change).
- Starter code and every `wrong/` solution **fail on every seed**, not just one. Each user sees one
  instance, so a mistake that passes some instances would let some users pass with wrong code.
- The generator is deterministic (two runs per seed must match) and instances vary (at least 10
  distinct instances in 50 seeds).
- Placeholders in the statement, starters and references all resolve on every seed.
- Hints have exactly four levels; the editorial has the four required sections; tags are in the
  allowed list (`packages/shared/src/constants.ts`).
- Flag problems: the reference solver recovers each user's flag from the generated files, and no
  file contains another user's flag.

Solutions whose rendered code is identical across seeds run in one process, which keeps validation
fast (the six samples take about 40 seconds).

## Trusted content vs untrusted code

`generator.ts`, `tests.ts` and `followups.ts` are bundled with esbuild at import time and stored in
`ProblemVersion.moduleCode`. The API evaluates them (via a `data:` URL import, cached by package
hash) to build instances and hidden tests. This is safe because content is reviewed in git and
validated in CI, exactly like application code. **User code never runs in the API**: it only goes to
executors.

## Executors and harnesses

- Harnesses (`packages/problem-kit/harness/`) run the user's function per test and stream one marked
  result line per test to stdout. They never see expected values; grading happens outside.
- A **progress watchdog** kills the process when no result arrives within `timeMs + 1.5s` (a
  synchronous infinite loop cannot be interrupted from inside the process), plus a total and an output
  ceiling. The runner (L4) uses the same watchdog and parser.
- The **development executor** runs code directly on the machine with no isolation. It exists for
  content authoring and CI validation only, is exported from a separate entry point
  (`@forge/problem-kit/dev-executor`), and throws if `NODE_ENV=production`.
- TypeScript is transpiled with esbuild outside the sandbox (esbuild only parses).

## Import

`pnpm problems:import` validates (outside production), then upserts. It is idempotent by package
hash. Changing files of a published version fails until `version` is bumped. `--publish-drafts`
publishes unreviewed packages for local development and e2e tests only and refuses to run in
production.

## Full-text search

`Problem.searchText` (title, slug words, tags) is maintained by the importer; a generated `tsvector`
column with a GIN index backs `websearch_to_tsquery` searches. The query is parameterised.

## Dependencies added

`esbuild` (TypeScript transpile and package bundling; already a transitive dependency of tsx),
`yaml` (problem.yaml), `react-markdown` + `remark-gfm` (statement rendering without raw HTML).
