# Queue lock never doubled, merges never cut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** the parallel-builds limit always holds and a running merge is never cancelled.

**Architecture:** the queue lock gets a heartbeat (the holder fast-forwards the lock ref every minute), so its
age is the time since the last sign of life and the takeover limit drops to a few minutes. The report never waits
for a preview under the lock: it dispatches the preview check at once, and the preview job waits for the preview
outside the lock. The report job's concurrency no longer cancels a run in progress.

**Tech Stack:** Node 22, `node --test`, GitHub Actions YAML.

**Spec:** issue #212, comment `<!-- factory-spec -->` (version 1).

## Global Constraints

- No runtime dependency; nothing changes in the owner's messages or in a request's journey.
- A truly dead holder is still replaced within a few minutes.

## Review Focus

- A heartbeat that fails (network) must not crash the work: errors are swallowed and logged.
- A heartbeat after the lock was taken over must not steal it back (fast-forward only, 422 → lost).
- No preview at all after the wait: the recette message still says « pas trouvé de preview ».
- A preview already there when the checks end: dispatched with its URL, as today.
- The heartbeat timer must stop on release (no hanging process).

---

### Task 1: lock heartbeat

**Files:** `scripts/lib/lock.mjs`, `scripts/lib/github.mjs`, `test/lock.test.mjs`, `test/github.test.mjs`

**Interfaces:** `withLock(store, fn, { ttlMs, waitMs, pollMs, sleep, now, beatMs = 60_000, every })` where
`every(fn, ms) => stop()`; `store.refresh(): Promise<boolean>` (optional). `LOCK_TTL_MS = 4 min`.

- [ ] Test: « a long decision keeps its place: a second run never takes over while the first one is alive » (fake
  clock, heartbeats called through `every`, second contender waits past the TTL, max one active).
- [ ] Test: `queueLock.refresh()` creates a commit whose parent is the held lock and PATCHes the ref with
  `force: false`; a 422 returns false and a later `release()` deletes nothing.
- [ ] Run, see them fail; implement; run, see them pass.

### Task 2: preview wait outside the lock

**Files:** `scripts/relay.mjs`, `.github/workflows/relay.yml`, `test/relay.test.mjs`, `test/sim/world.mjs`

**Interfaces:** `relay.previewWait(check) -> Promise<string|null>` (polls `previewUrl`, no lock);
`relay.mjs preview-url` command writes output `url`; `preview-report --url <url>`.

- [ ] Test: « a late preview never makes the report wait under the queue lock »: deployments pending, `sleep`
  throws if called; report dispatches `previewCheck` `{ pr, sha }` without url.
- [ ] Test: `previewWait` returns the url once it appears; then `report` with `preview: { result: 'skipped', url: null }`
  gives the « pas trouvé de preview » message without sleeping.
- [ ] Update the « no preview shows up » test and the rehearsal world to the two-step flow.
- [ ] Implement; preview job gets a « Wait for the preview » step.

### Task 3: report job never cancelled mid-merge

**Files:** `.github/workflows/relay.yml`, `test/relay-workflow.test.mjs`

- [ ] Test: in `relay.yml`, the `report` job's concurrency has `cancel-in-progress: false`; the preview job waits
  for the preview (`preview-url`) before the smoke step.
- [ ] Change `cancel-in-progress` to `false` for the report job; raise the report timeout margin if needed.
