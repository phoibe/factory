# Queue: a run that lost its turn decides nothing more (issue #562) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one go. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A relay run that lost its turn on the queue lock (told by GitHub, or deduced from its own clock one minute before the others may take over) stops at once: no launch, merge, label or comment; its event is replayed by the mechanism that already replays runs stopped by a GitHub outage.

**Architecture:** `withLock` keeps the time its last accepted sign of life was *sent* and exposes one check, `assert()`, that throws `LostTurnError`. It hands that check to the lock store (`store.guard`). The GitHub client runs it before every non-GET request (the single choke point `request`), so no write method can be forgotten; the lock's own calls bypass it. The relay asks explicitly only where an action is not a GitHub write (the routine call, a phone alert), and `withLock` checks once more when the work returns (the job outputs that start checks/agent/preview are written right after). `retriedLater` treats `LostTurnError` like an outage.

**Tech Stack:** Node 22 ESM, `node --test`. No dependency.

**Spec:** issue #562, comment « Spec (version 1) » (filed into `docs/specs/` by the build stage's script, not by hand).

**Checked beforehand:** the tests below were run against a throwaway prototype of tasks 1 and 2 (not kept): tasks 1 and 2 tests green, the 10 existing lock tests and the existing client tests still green, the two-runs scenario launching twice with today's lock and once with the prototype. Not run: the sync-alert test of task 3.

## Global Constraints

- A normal run is unchanged: `LOCK_BEAT_MS` 60 s, `LOCK_TTL_MS` 4 min, `LOCK_WAIT_MS` 13 min, same messages, same requests. A long run whose signs of life get through is never stopped.
- No extra GitHub read: only the run's own clock (`now`) and the answers of `store.refresh()` it already gets.
- Turn lost = sticky. From then on: nothing launched, merged, labelled or written; the check is made before each of those, before the first mark of a launch included.
- A stopped run never touches another run's lock: when its turn is not sure, it sends nothing to give the lock back (the lock expires, at most one minute later).
- Margin = one beat (`LOCK_MARGIN_MS = LOCK_BEAT_MS`, 60 s): the turn counts as lost 3 min after the last sign of life was sent. Why: (a) 60 s is the client's time limit for one request (`timeoutMs`), so a write that passed the check at the last instant is answered or abandoned before anyone may take over; (b) it covers clock differences between machines (others measure the age with GitHub's commit date); (c) two missed signs of life are still forgiven, one failed beat never stops a run.
- `LostTurnError`'s message carries no digit: the client reads « 404 » / « 422 » in an error text as GitHub's answer (`removeLabel`, `setState`, `setLiveRef`).
- Shared relay code only (`scripts/lib`, `scripts/relay`, `scripts/relay.mjs`): no change in `.github/workflows/`, `.factory/`, `.claude/skills/`. `rateLimitHandled` is not changed (see task 3).
- Code and comments in English. Tests first (red), then green. Every commit also adds `.factory/journal`.
- No GLOSSARY.md / ADR change: no owner-facing term or product decision is added (nothing changes on screen); the technical choices live in the comments of `lock.mjs`.

## Review Focus

- An error text with a number in it (« for 404 s ») would be swallowed by `removeLabel` as GitHub's 404: pinned in tasks 1 (no digit) and 2 (`removeLabel`, `setState(…, null)` reject).
- A sign of life that gets through after the run was told to stop must not revive it, and no further one is sent: task 1, third test.
- A slow answer must not stretch the turn: it is counted from the moment the sign of life was sent: task 1, third test.
- The relay swallows many errors (`dequeue().catch(log)`, `heal`, `refilling`): the stop must still surface. `withLock` rejects with `LostTurnError` when the work returns normally after the loss, or fails with another error (kept as `cause`): task 1, third and fourth tests; task 3, two-runs test (the stop crosses `handle`).
- Writes made after the locked part (`retrySoon`, `relaunchSoon`, the next `withLock` of the same command) must not be refused: the guard is removed when the locked part ends, lost turn or not: task 1 (fourth test), task 2 (`guard(null)`).

Known limits, accepted by the spec (no test): one request already on its way when the turn is lost; a launch stopped between the card's « running » mark and the agent's start (repaired by the existing guards, as today); the undo branch pushed with `git push` in `prodReport` (not a GitHub API write, redone identically by a replay, and the PR that follows is refused).

---

### Task 1: the lock knows when its turn is lost (`withLock`)

- **Files:** Modify `scripts/lib/lock.mjs`; Test `test/lock.test.mjs`.
- **Produces:** `LOCK_MARGIN_MS = LOCK_BEAT_MS`; `class LostTurnError extends Error` (`new LostTurnError(why, options)`, message `` `queue lock: turn lost (${why})` ``, `lostTurn = true`, `options` passed to `Error` for `cause`); `isLostTurn(e) → boolean` (`Boolean(e?.lostTurn)`); `withLock` option `marginMs = Math.min(LOCK_MARGIN_MS, ttlMs / 4)`; optional store method `guard(assert | null)`.
- **Rules of `withLock`:**
  1. `sureAt` = `now()` read just before the `store.acquire()` that succeeded (both call sites of the waiting loop), then just before each `store.refresh()` that answered `true`. Never moved once the turn is lost.
  2. The turn is lost when `store.refresh()` answers `false` (`why = 'taken over by another run'`) or when a check finds `now() - sureAt >= ttlMs - marginMs` (`why = 'no sign of life got through in time'`). Logged once, in place of today's « queue lock: lost… » line: `` `queue lock: turn lost (${why}): this run stops here, nothing more is launched or written` ``. No sign of life is sent after that (today's `!lost` condition).
  3. `assert()` makes the check and throws `new LostTurnError(why)`. `store.guard?.(assert)` right after the lock is taken; `store.guard?.(null)` in `finally`, after `await beating`.
  4. The work returned: one last `assert()` before returning its result. The work threw and the check says lost: throw `new LostTurnError(why, { cause: e })` unless `e` is already one.
  5. `finally`: `store.release()` only when the check still says held; otherwise the store is not called at all.

- [ ] **Step 1: failing tests** (appended to `test/lock.test.mjs`; import `LostTurnError, isLostTurn, LOCK_TTL_MS, LOCK_MARGIN_MS`)

```js
// One run under the lock, played minute by minute: `beat()` is the sign of life that is due, `check()` what the GitHub
// client does before every write (the guard withLock hands to the store).
function turnOf(store, work, opts = {}) {
  const run = { t: 0, logs: [], guards: [] };
  store.guard = (fn) => { run.guards.push(fn); run.check = fn; };
  run.done = withLock(store, () => work(run), { now: () => run.t, every: (fn) => { run.beat = fn; return () => {}; }, log: (m) => run.logs.push(m), ...opts });
  return run;
}
const LOST = /turn lost/;

test('a run whose signs of life no longer get through stops before its place can be taken, and launches nothing', async () => {
  const store = fakeStore();
  store.refresh = async () => { throw new Error('GitHub too slow'); };
  const launched = [];
  const run = turnOf(store, async (r) => { for (;;) { r.t += 60_000; await r.beat(); r.check(); launched.push(r.t); } });
  await assert.rejects(run.done, isLostTurn);
  assert.deepEqual(launched, [60_000, 120_000]); // two missed signs of life are forgiven
  assert.equal(run.t, LOCK_TTL_MS - LOCK_MARGIN_MS); // stopped at 3 min
  assert.ok(run.t < LOCK_TTL_MS); // the others may take over only past 4 min
  assert.deepEqual(run.logs.filter((m) => LOST.test(m)), ['queue lock: turn lost (no sign of life got through in time): this run stops here, nothing more is launched or written']);
  assert.ok(!store.log.includes('release') && store.held, 'not sure the lock is still its own: left to expire');
});

test('a run told by GitHub that its place was taken stops at once: the next action is not done', async () => {
  const store = fakeStore();
  store.refresh = async () => false; // the fast-forward was refused: another run holds the lock
  const done = [];
  const run = turnOf(store, async (r) => { r.check(); done.push('first'); r.t += 60_000; await r.beat(); r.check(); done.push('next'); });
  await assert.rejects(run.done, (e) => isLostTurn(e) && /taken over by another run/.test(e.message));
  assert.deepEqual(done, ['first']);
  assert.ok(!store.log.includes('release'), 'never gives back the lock of the run that took over');
  assert.equal(run.logs.filter((m) => LOST.test(m)).length, 1);
});

test('the turn is counted from the moment a sign of life was sent, and a late one never revives a stopped run', async () => {
  const store = fakeStore();
  let beats = 0, slow = true, run = null;
  store.refresh = async () => { beats++; if (slow) run.t += 2 * 60_000; return true; }; // GitHub takes 2 min to answer
  run = turnOf(store, async (r) => {
    r.t = 60_000; await r.beat(); // sent at 1 min, answered at 3 min
    r.t = 4 * 60_000 - 1; r.check(); // 3 min after it was sent, minus 1 ms
    r.t = 4 * 60_000; assert.throws(r.check, isLostTurn);
    slow = false; await r.beat(); // not even sent
    assert.throws(r.check, isLostTurn);
  }); // the work swallowed the refusals and returns normally
  await assert.rejects(run.done, isLostTurn);
  assert.equal(beats, 1);
});

test('an error that follows a lost turn is reported as the lost turn; the guard is removed at the end; the stop error carries no number', async () => {
  const store = fakeStore();
  store.refresh = async () => false;
  const boom = new Error('boom');
  const run = turnOf(store, async (r) => { r.t += 60_000; await r.beat(); throw boom; });
  await assert.rejects(run.done, (e) => isLostTurn(e) && e.cause === boom);
  assert.deepEqual(run.guards.map((g) => typeof g), ['function', 'object']); // installed once the lock is taken, then null
  for (const why of ['taken over by another run', 'no sign of life got through in time']) assert.doesNotMatch(String(new LostTurnError(why)), /\d/);
});
```

- [ ] **Step 2:** `node --test test/lock.test.mjs` → red (missing exports).
- [ ] **Step 3:** implement the five rules; rewrite the header comment (store contract with `guard?`, the turn rule and why the margin is one beat).
- [ ] **Step 4:** `node --test test/lock.test.mjs` → green, the 10 existing tests included (« a lock left behind by a dead run… » uses `ttlMs: 1000`: the default margin must scale with it).
- [ ] **Step 5:** commit `feat(lock): a run knows when its turn is lost (#562)`.

### Task 2: the GitHub client refuses every write once the turn is lost

- **Files:** Modify `scripts/lib/github.mjs`; Test `test/github.test.mjs`.
- **Consumes:** `store.guard(assert | null)` called by `withLock`; `LostTurnError`, `isLostTurn`, `withLock` (tests only: `github.mjs` imports nothing from `lock.mjs`).
- **Produces:** `gh.queueLock.guard(assert | null)` (keeps the check of the run's turn, `null` outside a locked part); `gh.assertTurn()` (runs it, no-op without one); every non-GET `request` runs it first.
- [ ] **Step 1: tests** (import `withLock, LostTurnError, isLostTurn` from `../scripts/lib/lock.mjs`). Helper, then three tests:

```js
// GitHub reduced to the lock's ref: commits are numbered, every request is noted as « METHOD /path ».
function lockHub() {
  const hub = { ref: null, n: 0, seen: [] };
  hub.fetchImpl = async (url, init) => {
    const key = `${init.method} ${url.replace('https://api.github.com/repos/o/r', '')}`;
    hub.seen.push(key);
    const body = init.body ? JSON.parse(init.body) : {};
    if (key === 'GET /git/ref/factory/lock') return hub.ref ? answer(200, { object: { sha: hub.ref } }) : answer(404);
    if (key === 'POST /git/commits') return answer(201, { sha: `c${++hub.n}` });
    if (/^(POST|PATCH) \/git\/refs/.test(key)) { hub.ref = body.sha; return answer(200); }
    if (key === 'DELETE /git/refs/factory/lock') { hub.ref = null; return answer(204); }
    return answer(201, { sha: 'x' });
  };
  hub.gh = github({ token: 't', repo: 'o/r', sleep: async () => {}, fetchImpl: hub.fetchImpl });
  return hub;
}
```

  - `'a normal run, even 20 minutes long, goes to its end with no extra GitHub read'` (green from the start: it pins what must not change). Under `withLock(gh.queueLock, …, { now: () => t, every: (fn) => { beat = fn; return () => {}; }, log })`, 20 times: `t += 60_000; await beat(); await gh.comment(1, …)`. Then: result returned; `hub.seen.filter((k) => k.startsWith('GET'))` deep-equals `['GET /git/ref/factory/lock', 'GET /git/ref/factory/lock']` (taking the lock, giving it back); 20 × `PATCH /git/refs/factory/lock`; 20 × `POST /issues/1/comments`; `hub.seen.at(-1) === 'DELETE /git/refs/factory/lock'`; no log line.
  - `'once its turn is lost, a run sends no write at all; its reads and the lock\'s own calls still go'`: `await gh.queueLock.acquire()`, `gh.queueLock.guard(() => { throw new LostTurnError('taken over by another run'); })`, `hub.seen.length = 0`. Each of `addLabels(1, ['a'])`, `removeLabel(1, 'a')`, `comment(1, 'x')`, `updateComment(1, 'x')`, `react(1, 'eyes')`, `dispatch('factory.yml', 'main', {})`, `merge(1)`, `closeIssue(1)`, `updateIssue(1, {})`, `createIssue('t', 'b')`, `setState('sync', { a: 1 })`, `setState('sync', null)`, `setLiveRef('abc')`, `rerunFailed(1)`, `request('POST', '/repos/{repo}/x', {})` rejects with `isLostTurn`; `assert.throws(() => gh.assertTurn(), isLostTurn)`; `hub.seen` is `[]`. Then `await gh.getIssue(1)` and `(await gh.queueLock.refresh()) === true`: `hub.seen` deep-equals `['GET /issues/1', 'POST /git/commits', 'PATCH /git/refs/factory/lock']`. Then `gh.queueLock.guard(null)`: `gh.comment(1, 'x')` resolves and `gh.assertTurn()` does not throw.
  - `'a run that lost its turn by its own clock sends nothing more to GitHub, not even to give the lock back'`: work = `t = 3 * 60_000; hub.seen.length = 0; await gh.getIssue(1); await gh.addLabels(1, ['factory:running']);` with `every: () => () => {}`. `withLock` rejects with `isLostTurn`; `hub.seen` deep-equals `['GET /issues/1']`; `hub.ref === 'c1'` (the lock is still there, untouched).
- [ ] **Step 2:** `node --test test/github.test.mjs` → the last two red.
- [ ] **Step 3:** implement. Today's `request` body becomes `call(method, path, body, accept)`; `request` stays an `async function` (a refused write rejects, never throws synchronously): `if (method !== 'GET') assertTurn(); return call(…)`. `lockSha`, `dropIf` and every call inside `queueLock` use `call` (a late sign of life may still save the turn; giving the lock back is decided by `withLock`). Add `queueLock.guard` and export `assertTurn` next to `queueLock`. Comment: why the lock's own calls are not guarded.
- [ ] **Step 4:** `node --test test/github.test.mjs test/lock.test.mjs` → green.
- [ ] **Step 5:** commit `feat(github): no write leaves a run that lost its turn (#562)`.

### Task 3: the relay stops, and the stopped event is replayed

- **Files:** Modify `scripts/relay.mjs` (`retriedLater`), `scripts/relay/launches.mjs` (`fireAgent`), `scripts/relay/watch.mjs` (`syncIfBehind`); Create `test/lost-turn.test.mjs`; Test also `test/relay.test.mjs`.
- **Consumes:** `isLostTurn`, `LostTurnError`, `withLock` (task 1); `gh.assertTurn()` (task 2), called as `gh.assertTurn?.()` (the tests' fake clients may not have it).
- **Replay, checked command by command (nothing to change in `rateLimitHandled` nor in `relay.yml`):**
  - `decide`: `retriedLater` true → output `ratelimited=true`, `agent`/`checks` false → the step `RATE_LIMIT_STEP` fails → `retryRateLimited` re-runs the run at the next tick (a stopped tick: the next tick does the same work).
  - `report`: same step; a stopped report is made again by `reportLost` from the checks' own result. Its second lock (`notifyWaiting`): the report is done, the run only ends red.
  - `release`: the lost turn of `refill` is caught and logged by `main` as today; the place is filled by the next event or tick.
  - `preview-report`, `prod-report`: exit 1, as for an outage today; `retryLostChecks` starts the check again. `dequeue`: no workflow runs it.
- [ ] **Step 1: failing tests**, new file `test/lost-turn.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withLock, isLostTurn } from '../scripts/lib/lock.mjs';
import { createRelay, retriedLater } from '../scripts/relay.mjs';
import { L } from '../scripts/lib/labels.mjs';

const MIN = 60_000;
const T0 = Date.parse('2026-11-24T08:00:00Z');
const config = { runner: 'claude-cloud', maxParallel: 2, stages: { grilling: true, acceptance: true }, review: { maxLoops: 3 } };
const env = { FACTORY_ROUTINE_URL: 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire', FACTORY_ROUTINE_TOKEN: 'tok' };

// One project seen by several relay runs. Each run has its own client (`run.gh`) and its own view of the one lock
// (`run.store`); like the real client, a run's writes are refused once its turn is lost (the guard withLock installs).
function project() {
  const w = { t: 0, issue: { number: 3, body: 'Ma demande', labels: [L.feature, L.specReview] }, events: [], sent: [], writes: [], lock: null };
  const card = () => ({ ...w.issue, state: 'open', labels: w.issue.labels.map((name) => ({ name })) });
  w.run = (id, { beats = true, slowRead = null } = {}) => {
    const run = { id, logs: [], beat: null, check: null };
    const write = (fn) => async (...a) => { run.check?.(); w.writes.push(id); return fn(...a); };
    run.store = {
      acquire: async () => { if (w.lock) return false; w.lock = { id, since: w.t }; return true; },
      ageMs: async () => (w.lock ? w.t - w.lock.since : null),
      refresh: async () => { if (!beats) throw new Error('GitHub too slow'); if (w.lock?.id !== id) return false; w.lock.since = w.t; return true; },
      release: async () => { w.lock = null; }, // like a DELETE on GitHub: it drops whatever lock is there
      takeOver: async () => { w.lock = null; },
      guard: (fn) => { run.check = fn; },
    };
    run.gh = {
      assertTurn: () => run.check?.(),
      getIssue: async () => card(), getPr: async () => null, getRepo: async () => ({ default_branch: 'main' }),
      listPulls: async () => [], listClosedPulls: async () => [], listOpenIssues: async () => [card()], listComments: async () => [],
      // The last read between the decision and the first mark of a launch.
      listIssues: async ({ labels }) => { if (labels === L.relaunch) await slowRead?.(); return w.issue.labels.includes(labels) ? [card()] : []; },
      listEvents: async () => w.events,
      addLabels: write(async (n, ls) => { for (const l of ls) { w.issue.labels.push(l); w.events.push({ event: 'labeled', label: { name: l }, created_at: new Date(T0 + w.t).toISOString() }); } }),
      removeLabel: write(async (n, l) => { w.issue.labels = w.issue.labels.filter((x) => x !== l); }),
      comment: write(async () => {}), updateIssue: write(async (n, patch) => { Object.assign(w.issue, patch); }), dispatch: write(async () => {}), react: write(async () => {}),
    };
    const relay = createRelay({ gh: run.gh, repo: 'phoibe/app', config, env, log: () => {}, now: () => T0 + w.t, sleep: async () => {},
      fetchImpl: async () => { w.sent.push(id); return { ok: true, status: 200, text: async () => '', json: async () => ({}) }; } });
    const go = { kind: 'issue', event: 'issue_comment', action: 'created', number: 3, labels: [L.feature, L.specReview], text: 'go', fromOwner: true };
    // The decide job of relay.mjs: the owner's « go » on the card, handled under the queue lock.
    run.decide = (opts = {}) => withLock(run.store, () => relay.handle(go), { now: () => w.t, every: (fn) => { run.beat = fn; return () => {}; }, log: (m) => run.logs.push(m), ...opts });
    return run;
  };
  return w;
}

test('two runs, one lost its turn: the request is launched once, and what the stopped run handled is replayed later', async () => {
  const w = project();
  // Run A decided to launch, then GitHub got very slow: its next read hangs and its signs of life no longer get through.
  let resume;
  const a = w.run('A', { beats: false, slowRead: () => new Promise((r) => { resume = r; }) });
  const stopped = a.decide();
  stopped.catch(() => {});
  await new Promise((r) => setImmediate(r));
  // Run B (the owner wrote « go » twice) waits minute after minute, takes the place over past 4 minutes, and launches.
  await w.run('B').decide({ sleep: async () => { w.t += MIN; await a.beat(); } });
  assert.deepEqual(w.sent, ['B']);
  resume(); // GitHub answers run A at last: it must not go on
  const err = await stopped.then(() => null, (e) => e);
  assert.ok(isLostTurn(err), String(err));
  assert.deepEqual(w.sent, ['B'], 'launched once');
  assert.ok(!w.writes.includes('A'), 'the stopped run wrote nothing: no label, no message');
  assert.equal(a.logs.filter((m) => /turn lost/.test(m)).length, 1);
  // Its job ends on the step the tick re-runs, like a run stopped by an outage…
  assert.equal(retriedLater('decide', err), true);
  assert.equal(retriedLater('report', err), true);
  assert.equal(retriedLater('prod-report', err), false);
  // …and the re-run handles the same event: an agent works on the card now, so the « go » is kept for its end.
  await w.run('A again').decide();
  assert.deepEqual(w.sent, ['B'], 'still launched once');
  assert.ok(w.issue.labels.includes(L.pending));
});

test('a turn already lost when a launch begins: the card is not even marked', async () => {
  const w = project();
  const a = w.run('A', { beats: false, slowRead: async () => { w.t += 3 * MIN; } });
  assert.ok(isLostTurn(await a.decide().then(() => null, (e) => e)));
  assert.deepEqual([w.sent, w.writes, w.issue.labels], [[], [], [L.feature, L.specReview]]);
});

test('a turn lost while a launch is being prepared: the agent is not started', async () => {
  const w = project();
  const a = w.run('A', { beats: false });
  a.gh.getContent = async () => { w.t += 3 * MIN; return { content: '' }; }; // a very slow read between the card's mark and the launch
  assert.ok(isLostTurn(await a.decide().then(() => null, (e) => e)));
  assert.deepEqual(w.sent, []);
  assert.equal(w.writes.length, 2, 'only the mark already made (factory:running taken off, put back)');
});
```

  And in `test/relay.test.mjs`, next to « sync: an update that does not go through… one alert after a day », a test `'sync: a run that lost its turn sends no alert'` (import `LostTurnError`): same setup and same calls up to `at(20 * H)`, then `gh.assertTurn = () => { throw new LostTurnError('taken over by another run'); }; await at(24 * H);` → `alerts().length === 0`.
- [ ] **Step 2:** `node --test test/lost-turn.test.mjs test/relay.test.mjs` → red on `retriedLater('decide', err)`, on « the agent is not started » (`w.sent` is `['A']`) and on the sync alert. The rest of the first test and the second test are already green: task 1 is what makes them pass (with today's lock, `w.sent` ends as `['B', 'A']`).
- [ ] **Step 3:** implement.
  - `scripts/relay.mjs`: `retriedLater = (command, e) => (isRateLimited(e) || isGitHubDown(e) || isLostTurn(e)) && rateLimitHandled(command)`; import `isLostTurn`; extend the comment above it (a run that lost its turn on the queue lock is replayed the same way).
  - `scripts/relay/launches.mjs`, `fireAgent`: `gh.assertTurn?.();` on the line before `try { res = await fetchImpl(env.FACTORY_ROUTINE_URL, …`, outside that `try` (the routine call is the one launch that is not a GitHub write). Nothing at the top of `fireAgent`: its first mark is a guarded write.
  - `scripts/relay/watch.mjs`, `syncIfBehind`: `gh.assertTurn?.();` first line inside `if (step.alert) {`. Not in `notifyWaiting`: its alert follows a guarded write at once, and a stop between the two would lose that alert for good.
- [ ] **Step 4:** `npm test` → all green; `npm run lint` and `npm run typecheck` → clean.
- [ ] **Step 5:** commit `feat(relay): a run that lost its turn stops and is replayed later (#562)`.
