# Transient outages are not code failures — Implementation Plan

> **For agentic workers:** executed inline with superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** when a network/GitHub outage makes a PR's checks or a project's sync fail, the factory retries by itself
instead of sending the agent to fix healthy code, or re-dispatching the sync every 5 minutes forever.

**Architecture:** a pure module `scripts/lib/outage.mjs` holds the classification and the two retry schedules.
`checks.mjs` flags an outage (`transient=true` job output); `relay.mjs report` keeps the PR's retry state in a hidden
marker in the PR body and the tick (`heal`) starts the due retries. The sync's state lives in a ref
`factory/state-sync` (commit message = JSON), like the queue lock.

**Tech Stack:** Node 22, no dependency, `node --test`.

**Spec:** issue #213, comment `<!-- factory-spec -->` (version 1).

## Global Constraints

- Silent retries after ~2 min then ~10 min; never counted as one of the 3 fix attempts (no `CHECKS_FAILED_MARKER`).
- After both: no agent; one PR message, exactly « GitHub ou le réseau a un problème en ce moment, je réessaie plus tard, rien à faire de votre côté. »; retries every 30 min.
- 3 h after the first outage on that commit: card `factory:blocked` (issue), phone alert (existing blocked alert), « réessaie » relaunches the checks.
- In doubt it is the code: only clear network/GitHub signatures (download impossible, service unavailable, timeout) are outages.
- Sync: retries after 5 min, 30 min, 2 h, then daily; one alert « La mise à jour du projet X ne passe pas depuis hier » after 24 h for the same version; success or a new factory version resets.

## Review Focus

- A real test failure whose output mentions ECONNREFUSED must stay a code failure → classification applies only to install, audit and browser-download steps (test in checks).
- A new commit pushed during an outage must restart the schedule from zero → `outageStep` ignores a state for another sha.
- A green or truly red run after an outage must clear the marker → report test.
- Two ticks must not start the same retry twice → `next` moved forward when a retry starts.
- A « réessaie » on a card blocked for another reason keeps today's behaviour (agent resumes) → relay test.

---

### Task 1: `scripts/lib/outage.mjs` (pure)

**Produces:**
- `isNetworkFailure(text: string) -> boolean`
- `OUTAGE_MARKER`, `readOutage(body) -> state|null`, `writeOutage(body, state|null) -> string`
- `outageStep(state, { sha, now }) -> { state, action: 'wait'|'block', retryInMs: number|null, tell: boolean }`
  (state `{ sha, since, tries, next, told, blocked }`; first failure → `retryInMs = 2 min`, second → `next = now + 10 min`,
  then `next = now + 30 min` and `tell` once; `now - since >= 3 h` → `block`)
- `isRetry(text) -> boolean` (« réessaie », « réessayer », « relance », « retry »…)
- `syncStep(state, { mine, theirs, now }) -> { state|null, dispatch, alert, changed }`

- [ ] Tests `test/outage.test.mjs` (fail first), implement, pass.

### Task 2: checks flag the outage

- `scripts/checks.mjs`: install, browser download and `npm audit` failures whose output matches `isNetworkFailure` write
  `transient=true` to `GITHUB_OUTPUT`. Output captured with a large `maxBuffer` and echoed.
- `relay.yml`: step ids `run`/`outage`; any failure before `checks.mjs` ran (checkout, rules, setup-node) is an outage;
  job output `transient`, passed to `report --transient`.
- [ ] Test `planInstall`/`classify` helper in `test/checks.test.mjs`.

### Task 3: report and tick

- `report({ ..., transient })`: transient failure → `outageStep`; write marker; `tell` → the PR sentence; `block` →
  remove `factory:checks`, `factory:blocked` on the issue, explanation with « réessaie »; non-transient result → clear marker.
  First retry: `outputs.retryInMs`, main sleeps outside the lock then dispatches `checksFor`.
- `heal` → `retryOutages()`: due marker on an open PR with `factory:checks` and no agent → dispatch `checksFor`, `tries+1`, `next = now + 45 min`.
- « réessaie » on a blocked card whose PR has a blocked marker → clear marker, unblock, `factory:checks`, checks run.
- [ ] Tests in `test/relay.test.mjs` for each spec criterion.

### Task 4: sync backoff

- `github.mjs`: `getState(name)`, `setState(name, obj|null)` on ref `factory/state-<name>`.
- `syncIfBehind` uses `syncStep`, alert via `sendAlert` once.
- [ ] Tests in `test/relay.test.mjs` (5 min, 30 min, 2 h, daily, one alert, reset).
