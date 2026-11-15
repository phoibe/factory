# Issue #422 — No before/after for a screen whose only difference is self-changing data

> For agentic workers: medium request, executed inline with `executing-plans` (no per-task subagent).

**Goal:** a screen that only differs by data that changes on its own (a time, a date) is no longer shown in the screenshots review.

**Architecture:** (1) at the source, the app launched for the captures starts on the same fixed date/time as the
browser: a Node preload (`agent/scripts/frozen-clock.mjs`, enabled by `shots.mjs env`) shifts `Date` so that it
starts at `FROZEN_TIME`; (2) a safety net: `shots.mjs publish --set-aside <file.json>` lets the agent set aside a
differing screen with a written reason; (3) every set-aside screen is listed in one line with its reason; (4) when
nothing is left to show, the output is the existing « nothing changed » message (marker included) plus that line.

**Tech Stack:** Node.js without dependencies, `node --test`.

**Spec:** issue #422, comment `<!-- factory-spec -->` (version 1).

## Global Constraints

- Image comparison stays exact (no pixel tolerance).
- Trace line copy: « Écrans sans changement visible, non montrés : <écrans> (<raison>) ».
- A new screen (absent before) is never set aside; an unknown screen name is an error (no silent typo).

## Review Focus

- Preload loaded in an app that never reads the env var: `Date` must stay untouched.
- `new Date(x)`, `Date.parse`, `Date.UTC`, `instanceof Date` keep working with the shifted clock.
- Set-aside key naming a route slug covers all sizes and themes of that route.
- All differing screens set aside → no image pushed, marker present, trace line present.
- Relay posting the table from `shots.json` also shows the trace line.

### Task 1: frozen clock for the app (source fix)

**Files:** Create `agent/scripts/frozen-clock.mjs`; modify `agent/scripts/shots.mjs` (`env` command, `frozenEnv()`),
`scripts/sync.mjs` (copy the new file); tests in `test/shots.test.mjs`, `test/sync.test.mjs`.

- `installFrozenClock(start: string|number, realNow = Date.now)` replaces `globalThis.Date` by a subclass whose
  `now()` and no-argument constructor return `start + (real now − real now at install)`. Auto-installed on import
  when `FACTORY_FROZEN_TIME` is set.
- `frozenEnv(): { FACTORY_FROZEN_TIME, NODE_OPTIONS }` with `NODE_OPTIONS` = existing value + `--import=<file URL>`.
  `shots.mjs run -- <command>` launches the app (and its build) with that environment in one command; `shots.mjs env`
  prints `export KEY='value'` lines. (Ruling after review: `eval` alone was lost between separate shell calls.)
- Tests: a child process run with `frozenEnv()` prints a year 2026-01-15 date; `new Date(0)` unchanged; sync copies the file.

### Task 2: set-aside with reason, trace line, nothing left to show

**Files:** modify `agent/scripts/shots.mjs` (`setAsideScreens`, `screensToShow`, `markdownTable`, `shotsMeta`,
`publish --set-aside`), `scripts/relay/events.mjs` (read `setAside` from `shots.json`); tests in
`test/shots.test.mjs`, `test/relay.test.mjs`.

- `setAsideScreens(files, aside: {[key]: reason}, { newScreens })` → `{ files, setAside: [{ file, reason }] }`;
  key = route slug or file name without `.png`; throws on a key matching no differing screen or on a new screen.
- `markdownTable({ …, setAside })` appends the trace line grouped by reason; with no file left, outputs the
  no-change marker and sentence plus the trace line.

### Task 3: agent instructions

**Files:** `agent/stages/screenshots.md` (env before launching each app, rules for the safety net, trace line kept),
`test/no-empty-review.test.mjs` if wording is asserted.
