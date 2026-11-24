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
