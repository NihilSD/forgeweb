# 0005 — Workspace (phase L5)

Date: 2026-09-30 · Status: accepted

- **Monaco, self-hosted, ESM build.** `@monaco-editor/react` normally loads Monaco from a CDN, which
  our CSP blocks and the spec rules out. `components/editor/monaco-setup.ts` imports the ESM
  `editor.api` plus only Python, SQL and JS/TS, and hands it to the React wrapper with
  `loader.config({ monaco })`. Workers are bundled from our origin via `new Worker(new URL(…))`.
  Monaco's AMD build is deprecated upstream, so we don't copy `min/vs` into `public/`.
- **Vim** via `monaco-vim`. Monaco 0.57 changed its exports map, so `next.config.ts` aliases the two
  deep imports `monaco-vim` uses. **Emacs** is a small in-house keymap (movement, kill-line, search):
  the only Monaco Emacs package was last released in 2022 and is UMD-only.
- **Layout**: `react-resizable-panels` v4; pane sizes persist in `localStorage`. Below 768 px the
  workspace renders a reading view with a note to use a larger screen (spec 9), not two hidden copies.
- **Drafts** are server-side (`Draft`, one per user/problem/language), saved 800 ms after typing
  stops and before every run, so they survive reloads and devices. Run history reuses submissions.
- **Flag files** use HMAC-signed URLs that expire after 5 minutes and are bound to the user _and_
  still require that user's session. Flags are derived per user
  (`FORGE{HMAC(secret, userId + problemId)[0:24]}`, secret derived from `APP_SECRET`) and never
  stored; `FlagIssue` keeps only a hash, so a flag submitted by another user is recorded as a
  sharing signal (`FlagSubmission.sharedFrom` + audit log). When object storage is added, the
  download handler can redirect to a presigned S3 URL instead.
- **SQL**: the schema browser is parsed from the visible test's setup SQL; results tables show the
  user's rows (with column names from the sandbox) next to the expected rows.
- **Shortcuts**: Ctrl/⌘+Enter runs, Ctrl/⌘+Shift+Enter submits (in the editor and globally).

## Dependencies added

`monaco-editor`, `@monaco-editor/react` (spec names Monaco), `react-resizable-panels` (resizable
panes), `monaco-vim` (Vim keybindings).
