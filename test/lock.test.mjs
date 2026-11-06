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
