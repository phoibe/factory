// Issue #383: an agent launch that fails for a passing reason is retried by the factory alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../scripts/relay.mjs';
import { L, CHECKS_FAILED_MARKER } from '../scripts/lib/labels.mjs';
import { readRelaunch, writeRelaunch, RELAUNCH_TOLD, QUESTION_BUSY } from '../scripts/lib/relaunch.mjs';

const MIN = 60_000;
const config = { runner: 'claude-cloud', maxParallel: 2, stages: { grilling: true, acceptance: true, checks: true }, review: { maxLoops: 3 } };
const env = { FACTORY_ROUTINE_URL: 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire', FACTORY_ROUTINE_TOKEN: 'tok' };
const quiet = () => {};
const payloadOf = (body) => JSON.parse(JSON.parse(body).text.split('\n\n').slice(1).join('\n\n'));

function fakeGh(state) {
  const calls = [];
  const find = (n) => state.issues.find((i) => i.number === n) || state.prs.find((p) => p.number === n);
  return {
    calls,
    getIssue: async (n) => { const i = find(n); return i && { state: i.open === false ? 'closed' : 'open', ...i, labels: (i.labels || []).map((name) => ({ name })) }; },
    updateIssue: async (n, patch) => { calls.push(['update', n]); Object.assign(find(n), patch); },
    getRepo: async () => ({ default_branch: 'main' }),
    dispatch: async (wf, ref, inputs) => calls.push(['dispatch', wf, ref, inputs]),
    react: async () => {},
    getPr: async (n) => state.prs.find((p) => p.number === n),
    listPulls: async () => state.prs.filter((p) => p.state !== 'closed'),
    listClosedPulls: async () => [],
    listIssues: async ({ labels }) => [...state.issues, ...state.prs.map((p) => ({ ...p, pull_request: {} }))]
      .filter((i) => i.open !== false && (i.labels || []).includes(labels)).map((i) => ({ ...i, labels: i.labels.map((name) => ({ name })) })),
    listComments: async (n) => state.comments?.[n] || [],
    listEvents: async () => [],
    comment: async (n, body) => calls.push(['comment', n, body]),
    addLabels: async (n, ls) => { calls.push(['add', n, ...ls]); const i = find(n); i.labels = [...new Set([...(i.labels || []), ...ls])]; },
    removeLabel: async (n, l) => { calls.push(['remove', n, l]); const i = find(n); if (i) i.labels = (i.labels || []).filter((x) => x !== l); },
  };
}

// A routine that answers each launch with the next status of the list (200 once it runs out).
function routine(statuses, sent = []) {
  const left = [...statuses];
  const fetchImpl = async (url, init) => {
    sent.push(init);
    const status = left.length ? left.shift() : 200;
    if (status === 'network') throw new TypeError('fetch failed: ECONNRESET');
    return { ok: status === 200, status, text: async () => 'busy', json: async () => ({}) };
  };
  return { fetchImpl, sent };
}

const make = (gh, statuses, { at = 0, sleeps = [] } = {}) => {
  const clock = { t: at };
  const r = routine(statuses);
  const relay = createRelay({ gh, repo: 'phoibe/app', config, env, fetchImpl: r.fetchImpl, log: quiet, now: () => clock.t, sleep: async (ms) => { sleeps.push(ms); } });
  return { relay, clock, sent: r.sent, sleeps };
};
const go = (n) => ({ kind: 'issue', event: 'issue_comment', action: 'created', number: n, labels: [L.feature, L.specReview], text: 'go', fromOwner: true });
// The labels of a card, without the lock an agent that started holds.
const labelsOf = async (gh, n) => (await gh.getIssue(n)).labels.map((l) => l.name).filter((l) => l !== L.running);

test('a saturated service: no message, the card keeps its step and waits for a relaunch 2 min later', async () => {
  const gh = fakeGh({ issues: [{ number: 3, body: 'Ma demande', labels: [L.feature, L.specReview] }], prs: [] });
  const { relay } = make(gh, [529]);
  const { outputs } = await relay.handle(go(3));
  assert.ok(!gh.calls.some((c) => c[0] === 'comment'));
  assert.deepEqual(await labelsOf(gh, 3), [L.feature, L.specReview, L.relaunch]);
  const st = readRelaunch((await gh.getIssue(3)).body);
  assert.deepEqual([st.stage, st.issue, st.next], ['build', 3, 2 * MIN]);
  assert.equal(outputs.relaunchInMs, 2 * MIN);
});

test('an unreachable routine (network) is a passing failure too', async () => {
  const gh = fakeGh({ issues: [{ number: 3, body: '', labels: [L.feature, L.specReview] }], prs: [] });
  await make(gh, ['network']).relay.handle(go(3));
  assert.ok((await labelsOf(gh, 3)).includes(L.relaunch));
  assert.ok(!gh.calls.some((c) => c[0] === 'comment'));
});

test('the relaunch that works starts the saved launch, then does what the first launch would have done', async () => {
  const gh = fakeGh({ issues: [{ number: 3, body: 'Ma demande', labels: [L.feature, L.specReview] }], prs: [] });
  const { relay, clock, sent } = make(gh, [529]);
  await relay.handle(go(3));
  clock.t = MIN;
  await relay.retryLaunches();
  assert.equal(sent.length, 1, 'not due yet');
  clock.t = 2 * MIN;
  await relay.retryLaunches();
  assert.equal(payloadOf(sent[1].body).stage, 'build');
  assert.deepEqual(await labelsOf(gh, 3), [L.feature, L.building]);
  assert.ok((await gh.getIssue(3)).labels.some((l) => l.name === L.running), 'the agent holds its lock');
  assert.equal((await gh.getIssue(3)).body, 'Ma demande');
});

test('told once at the third failure in a row, blocked after 3 hours', async () => {
  const gh = fakeGh({ issues: [{ number: 3, body: '', labels: [L.feature, L.specReview] }], prs: [] });
  const { relay, clock } = make(gh, Array(20).fill(503));
  await relay.handle(go(3));
  const told = () => gh.calls.filter((c) => c[0] === 'comment' && c[2].includes(RELAUNCH_TOLD)).length;
  clock.t = 2 * MIN; await relay.retryLaunches();
  assert.equal(told(), 0);
  clock.t = 12 * MIN; await relay.retryLaunches();
  assert.equal(told(), 1);
  clock.t = 42 * MIN; await relay.retryLaunches();
  assert.equal(told(), 1);
  for (let t = 72; t <= 192; t += 30) { clock.t = t * MIN; await relay.retryLaunches(); }
  assert.ok((await labelsOf(gh, 3)).includes(L.blocked));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && /depuis 3 heures/.test(c[2]) && /réessaie/.test(c[2])));
  assert.equal(readRelaunch((await gh.getIssue(3)).body).next, null, 'no more planned relaunch');
});

test('« réessaie » on a card blocked after 3 hours starts the saved launch again', async () => {
  const body = writeRelaunch('', { stage: 'build', issue: 3, pr: null, then: { labels: [{ n: 3, add: [L.building], remove: [L.specReview] }] }, since: 0, failures: 8, blocked: true, next: null });
  const gh = fakeGh({ issues: [{ number: 3, body, labels: [L.feature, L.specReview, L.relaunch, L.blocked] }], prs: [] });
  const { relay, sent } = make(gh, [], { at: 5 * 60 * MIN });
  await relay.handle({ ...go(3), labels: [L.feature, L.specReview, L.relaunch, L.blocked], text: 'réessaie' });
  assert.equal(payloadOf(sent[0].body).stage, 'build');
  assert.deepEqual(await labelsOf(gh, 3), [L.feature, L.building]);
});

test('an owner message on a waiting card starts it at once, with the saved launch', async () => {
  const gh = fakeGh({ issues: [{ number: 3, body: 'x', labels: [L.feature, L.specReview] }], prs: [] });
  const { relay, clock, sent } = make(gh, [529]);
  await relay.handle(go(3));
  clock.t = 30_000;
  await relay.handle({ ...go(3), labels: [L.feature, L.specReview, L.relaunch], text: 'et ajoute un bouton' });
  assert.equal(sent.length, 2);
  assert.equal(payloadOf(sent[1].body).stage, 'build');
  assert.deepEqual(await labelsOf(gh, 3), [L.feature, L.building]);
});

test('« fermer » on a waiting card still closes it', async () => {
  const gh = fakeGh({ issues: [{ number: 3, body: 'x', labels: [L.feature, L.specReview] }], prs: [] });
  gh.closeIssue = async (n) => gh.calls.push(['close', n]);
  const { relay, sent } = make(gh, [529]);
  await relay.handle(go(3));
  await relay.handle({ ...go(3), labels: [L.feature, L.specReview, L.relaunch], text: 'fermer' });
  assert.equal(sent.length, 1);
});

test('several waiting cards: the oldest first; when it fails, the others wait for the next relaunch', async () => {
  const st = (since) => ({ stage: 'build', pr: null, then: {}, since, failures: 1, next: since + 2 * MIN });
  const gh = fakeGh({ issues: [
    { number: 8, body: writeRelaunch('', { ...st(MIN), issue: 8 }), labels: [L.building, L.relaunch] },
    { number: 4, body: writeRelaunch('', { ...st(0), issue: 4 }), labels: [L.building, L.relaunch] },
  ], prs: [] });
  const { relay, clock, sent } = make(gh, [503], { at: 3 * MIN });
  await relay.retryLaunches();
  assert.equal(sent.length, 1);
  assert.equal(payloadOf(sent[0].body).issue, 4);
  const next4 = readRelaunch((await gh.getIssue(4)).body).next;
  assert.equal(next4, 3 * MIN + 10 * MIN);
  assert.equal(readRelaunch((await gh.getIssue(8)).body).next, next4);
  clock.t = next4;
  await relay.retryLaunches();
  assert.deepEqual(sent.slice(1).map((s) => payloadOf(s.body).issue), [4, 8], 'once the oldest starts, the others follow');
  assert.ok(!(await labelsOf(gh, 8)).includes(L.relaunch));
});

test('a setting problem (refused token) is not retried: the owner is told what to do', async () => {
  const gh = fakeGh({ issues: [{ number: 3, body: '', labels: [L.feature, L.specReview] }], prs: [] });
  await assert.rejects(make(gh, [401]).relay.handle(go(3)));
  assert.ok(!(await labelsOf(gh, 3)).includes(L.relaunch));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && /401/.test(c[2]) && /réessaie/.test(c[2])));
});

test('the question chat: one quick retry, then a clear message', async () => {
  const ask = { kind: 'issue', event: 'issue_comment', action: 'created', number: 7, labels: [L.question], text: 'pourquoi ?', fromOwner: true };
  const gh = fakeGh({ issues: [{ number: 7, body: '', labels: [L.question] }], prs: [] });
  const { relay, sleeps, sent } = make(gh, [529, 529]);
  await relay.handle(ask);
  assert.deepEqual(sleeps, [30_000]);
  assert.equal(sent.length, 2);
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[2].includes(QUESTION_BUSY)));
  assert.ok(!(await labelsOf(gh, 7)).includes(L.relaunch));
  const gh2 = fakeGh({ issues: [{ number: 7, body: '', labels: [L.question] }], prs: [] });
  const second = make(gh2, [529]);
  await second.relay.handle(ask);
  assert.equal(second.sent.length, 2);
  assert.ok(!gh2.calls.some((c) => c[0] === 'comment'));
});

test('a fix after red checks that cannot start waits too, and the PR moves only once the agent starts', async () => {
  const gh = fakeGh({ issues: [{ number: 1, body: 'feature', labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.checks] }], comments: { 10: [] } });
  const { relay, clock, sent } = make(gh, [529]);
  await relay.report({ result: 'failure', pr: 10 });
  assert.ok(!(await labelsOf(gh, 1)).includes(L.blocked));
  assert.ok((await labelsOf(gh, 1)).includes(L.relaunch));
  assert.ok(!gh.calls.some((c) => c[0] === 'comment'));
  assert.deepEqual(await labelsOf(gh, 10), [L.checks, L.relaunch]);
  clock.t = 2 * MIN;
  await relay.retryLaunches();
  assert.deepEqual([payloadOf(sent[1].body).stage, payloadOf(sent[1].body).pr], ['fix-checks', 10]);
  assert.deepEqual(await labelsOf(gh, 10), [L.fixing]);
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 10 && c[2].includes(CHECKS_FAILED_MARKER)));
});

test('a queued card that cannot start waits; no other card is started during the outage', async () => {
  const gh = fakeGh({ issues: [
    { number: 2, body: '', labels: [L.feature, L.queued], created_at: '2026-01-01' },
    { number: 5, body: '', labels: [L.feature, L.queued], created_at: '2026-01-02' },
  ], prs: [] });
  const { relay, clock, sent } = make(gh, [529]);
  await relay.dequeue();
  assert.equal(sent.length, 1);
  assert.deepEqual(await labelsOf(gh, 2), [L.feature, L.queued, L.relaunch]);
  await relay.dequeue();
  assert.equal(sent.length, 1, 'nothing new while a launch waits');
  clock.t = 2 * MIN;
  await relay.retryLaunches();
  await relay.dequeue();
  assert.deepEqual(sent.slice(1).map((s) => payloadOf(s.body).issue), [2, 5]);
  assert.deepEqual(await labelsOf(gh, 2), [L.feature, L.building]);
});

test('a relaunch is dropped when its card was closed meanwhile', async () => {
  const body = writeRelaunch('', { stage: 'build', issue: 3, pr: null, then: {}, since: 0, failures: 1, next: 0 });
  const gh = fakeGh({ issues: [{ number: 3, body, labels: [L.feature, L.relaunch] }], prs: [] });
  gh.getIssue = async () => ({ number: 3, state: 'closed', body, labels: [{ name: L.relaunch }] });
  const { relay, sent } = make(gh, []);
  await relay.retryLaunches();
  assert.equal(sent.length, 0);
});
