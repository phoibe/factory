import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withLock, LostTurnError, isLostTurn, isLockTimeout, LOCK_TTL_MS, LOCK_MARGIN_MS } from '../scripts/lib/lock.mjs';
import { createRelay } from '../scripts/relay.mjs';
import { L } from '../scripts/lib/labels.mjs';

// A lock store like the real one: one slot, taking it fails when it is already taken.
function fakeStore() {
  const s = { held: false, since: 0, log: [] };
  s.acquire = async () => { if (s.held) return false; s.held = true; s.since = s.now(); s.log.push('acquire'); return true; };
  s.ageMs = async () => (s.held ? s.now() - s.since : null);
  s.release = async () => { s.held = false; s.log.push('release'); };
  s.now = () => 0;
  return s;
}

test('two runs never work at the same time, and none is lost', async () => {
  const store = fakeStore();
  let active = 0, maxActive = 0, done = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, 1));
  const job = async () => { active++; maxActive = Math.max(maxActive, active); await new Promise((r) => setTimeout(r, 5)); active--; done++; };
  await Promise.all([1, 2, 3].map(() => withLock(store, job, { sleep, now: () => 0 })));
  assert.equal(maxActive, 1);
  assert.equal(done, 3);
  assert.equal(store.held, false);
});

test('the lock is released when the work fails', async () => {
  const store = fakeStore();
  await assert.rejects(withLock(store, async () => { throw new Error('boom'); }, { sleep: async () => {}, now: () => 0 }), /boom/);
  assert.equal(store.held, false);
});

test('a lock left behind by a dead run is taken over after its time limit', async () => {
  const store = fakeStore();
  store.held = true; store.since = 0;
  let t = 0;
  store.now = () => t;
  let ran = false;
  store.takeOver = async () => { store.held = false; };
  await withLock(store, async () => { ran = true; }, { ttlMs: 1000, sleep: async () => { t += 600; }, now: () => t });
  assert.ok(ran);
});

test('checks cancelled with no start time are a replaced run, not a hung test', async () => {
  const gh = {
    getPr: async () => ({ head: { sha: 'abc' }, body: 'Closes #1', labels: [] }),
    comment: async () => { throw new Error('must not comment'); },
    addLabels: async () => { throw new Error('must not label'); },
    removeLabel: async () => { throw new Error('must not unlabel'); },
  };
  const msgs = [];
  await createRelay({ gh, repo: 'r', config: { stages: {}, review: { maxLoops: 3 } }, env: {}, log: (m) => msgs.push(m) })
    .report({ result: 'cancelled', pr: 10, sha: 'abc', started: null });
  assert.ok(msgs.some((m) => /replaced/.test(m)));
});

// Issue #212: a decision that waits for minutes (a slow preview, several PRs to settle) is alive, not dead.
test('a long decision keeps its place: a second run never takes over while the first one is alive', async () => {
  const store = fakeStore();
  let t = 0;
  store.now = () => t;
  store.refresh = async () => { if (!store.held) return false; store.since = t; return true; };
  store.takeOver = async () => { store.held = false; store.log.push('takeOver'); };
  const beats = [];
  const every = (fn) => { beats.push(fn); return () => beats.splice(beats.indexOf(fn), 1); };
  let active = 0, maxActive = 0;
  let finish;
  const first = withLock(store, async () => { active++; maxActive = Math.max(maxActive, active); await new Promise((r) => { finish = r; }); active--; }, { every, now: () => t });
  await new Promise((r) => setImmediate(r));
  // The second run polls for 20 minutes while the first one works and gives a sign of life every minute.
  const second = withLock(store, async () => { active++; maxActive = Math.max(maxActive, active); active--; }, {
    every, now: () => t, waitMs: 30 * 60_000,
    sleep: async () => { t += 60_000; for (const b of [...beats]) await b(); if (t >= 20 * 60_000) finish(); await new Promise((r) => setImmediate(r)); },
  });
  await Promise.all([first, second]);
  assert.equal(maxActive, 1);
  assert.ok(!store.log.includes('takeOver'), 'a live run is never taken over');
});

test('a run that died holding the lock is replaced within a few minutes', async () => {
  const store = fakeStore();
  store.held = true; store.since = 0;
  let t = 0;
  store.now = () => t;
  store.takeOver = async () => { store.held = false; };
  await withLock(store, async () => {}, { sleep: async () => { t += 60_000; }, now: () => t, every: () => () => {} });
  assert.ok(t <= 5 * 60_000, `taken over after ${t / 60_000} min`);
});

test('the sign of life stops when the work ends, and a failed one does not break the work', async () => {
  const store = fakeStore();
  let stopped = false, beat;
  store.refresh = async () => { throw new Error('network'); };
  const every = (fn) => { beat = fn; return () => { stopped = true; }; };
  await withLock(store, async () => { await beat(); return 1; }, { every, sleep: async () => {}, now: () => 0 });
  assert.ok(stopped);
  assert.equal(store.held, false);
});

test('a sign of life still on its way is waited for before the lock is given back', async () => {
  const store = fakeStore();
  const order = [];
  let beat;
  store.refresh = async () => { await new Promise((r) => setTimeout(r, 10)); order.push('beat done'); return true; };
  const release = store.release;
  store.release = async () => { order.push('release'); await release(); };
  const every = (fn) => { beat = fn; return () => {}; };
  await withLock(store, async () => { beat(); }, { every, sleep: async () => {}, now: () => 0 });
  assert.deepEqual(order, ['beat done', 'release']);
});

test('a failing release neither hides the work result nor throws', async () => {
  const store = fakeStore();
  store.release = async () => { throw new Error('release down'); };
  const logs = [];
  const out = await withLock(store, async () => 'result', { sleep: async () => {}, now: () => 0, log: (m) => logs.push(m) });
  assert.equal(out, 'result');
  assert.ok(logs.some((m) => /release down/.test(m)));
});

test('a takeover that changes nothing does not spin forever: the wait limit still applies', async () => {
  let t = 0;
  let takeOvers = 0; // a broken loop never yields to timers: it fails here instead of hanging the suite
  const store = { acquire: async () => false, ageMs: async () => 1001, takeOver: async () => { if (++takeOvers > 100) throw new Error('takeOver keeps spinning'); }, release: async () => {} };
  await assert.rejects(withLock(store, async () => {}, { ttlMs: 1000, waitMs: 5000, pollMs: 1000, sleep: async (ms) => { t += ms; }, now: () => t }), /waited too long/);
});

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
  store.refresh = async () => { // GitHub takes 2 min to answer, then fails the follow-up sent at once
    beats++;
    if (beats > 1) throw new Error('GitHub too slow');
    if (slow) run.t += 2 * 60_000;
    return true;
  };
  run = turnOf(store, async (r) => {
    r.t = 60_000; await r.beat(); // sent at 1 min, answered at 3 min; the next one, sent at 3 min, fails
    r.t = 4 * 60_000 - 1; r.check(); // 3 min after it was sent, minus 1 ms
    r.t = 4 * 60_000; assert.throws(r.check, isLostTurn);
    slow = false; await r.beat(); // not even sent
    assert.throws(r.check, isLostTurn);
  }); // the work swallowed the refusals and returns normally
  await assert.rejects(run.done, isLostTurn);
  assert.equal(beats, 2);
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

// A virtual clock with timers: `every` and `sleep` are played in time order, nothing waits for real.
function virtualClock() {
  const c = { t: 0, timers: [], seq: 0 };
  c.at = (ms, fn) => c.timers.push({ at: c.t + ms, n: c.seq++, fn });
  c.sleep = (ms) => new Promise((r) => c.at(ms, r));
  c.every = (fn, ms) => { let on = true; const tick = () => { if (!on) return; fn(); c.at(ms, tick); }; c.at(ms, tick); return () => { on = false; }; };
  c.play = async (until) => {
    let done = false;
    until.then(() => { done = true; }, () => { done = true; });
    while (!done) {
      for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
      if (done || !c.timers.length) break;
      c.timers.sort((a, b) => a.at - b.at || a.n - b.n);
      const next = c.timers.shift();
      c.t = next.at;
      next.fn();
    }
    return until;
  };
  return c;
}

test('slow but successful signs of life (answered after 61 s) keep a 20-minute run alive', async () => {
  const clock = virtualClock();
  const store = fakeStore();
  let check = null, sent = 0;
  store.guard = (fn) => { check = fn; };
  store.refresh = () => { sent++; return new Promise((r) => clock.at(61_000, () => r(true))); };
  const logs = [];
  const done = withLock(store, async () => {
    for (let i = 0; i < 20; i++) { await clock.sleep(60_000); check(); }
    return 'done';
  }, { now: () => clock.t, every: clock.every, log: (m) => logs.push(m) });
  assert.equal(await clock.play(done), 'done');
  assert.deepEqual(logs, []);
  assert.ok(sent >= 19, `a sign of life sent as soon as the previous one is answered late (${sent})`);
});

test('a run whose work ended well but whose lock is no longer sure at the end does not say it stops: it leaves the lock to expire', async () => {
  const store = fakeStore();
  let run = null;
  store.refresh = async () => { await new Promise((r) => setImmediate(r)); run.t += 3 * 60_000; throw new Error('GitHub too slow'); }; // in flight when the work ends
  run = turnOf(store, async (r) => { r.beat(); return 'ok'; });
  assert.equal(await run.done, 'ok');
  assert.deepEqual(run.logs.filter((m) => LOST.test(m)), []);
  assert.ok(run.logs.includes('queue lock: not given back, it will expire by itself'), run.logs.join('\n'));
  assert.ok(!store.log.includes('release'));
});

// A run that waited its whole time for the lock did nothing wrong: it is marked so that the tick re-runs it.
test('the « waited too long » error says so, and only it does', async () => {
  let t = 0;
  const store = { acquire: async () => false, ageMs: async () => 10, release: async () => {} };
  const e = await withLock(store, async () => {}, { waitMs: 5000, pollMs: 1000, sleep: async (ms) => { t += ms; }, now: () => t }).catch((x) => x);
  assert.match(e.message, /waited too long/);
  assert.equal(e.lockTimeout, true);
  assert.equal(isLockTimeout(e), true);
  assert.equal(isLockTimeout(new Error('boom')), false);
});
