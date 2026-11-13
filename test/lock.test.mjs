import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withLock } from '../scripts/lib/lock.mjs';
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
  const store = { acquire: async () => false, ageMs: async () => 1001, takeOver: async () => {}, release: async () => {} };
  await assert.rejects(withLock(store, async () => {}, { ttlMs: 1000, waitMs: 5000, pollMs: 1000, sleep: async (ms) => { t += ms; }, now: () => t }), /waited too long/);
});
