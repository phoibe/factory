import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay, eventFromPayload } from '../scripts/relay.mjs';
import { L, AGENT_MARKER, CHECKS_FAILED_MARKER } from '../scripts/lib/labels.mjs';

const MIN = 60_000;
const config = { runner: 'claude-cloud', maxParallel: 2, stages: { grilling: true, acceptance: true }, review: { maxLoops: 3 } };
const env = { FACTORY_ROUTINE_URL: 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire', FACTORY_ROUTINE_TOKEN: 'tok' };
const quiet = () => {};
// The routine text is a title line, a blank line, then the JSON payload.
const payloadOf = (body) => JSON.parse(JSON.parse(body).text.split('\n\n').slice(1).join('\n\n'));

// A small fake GitHub: issues and PRs live in `state`, every write is recorded in `calls`.
function fakeGh(state) {
  const calls = [];
  const find = (n) => state.issues.find((i) => i.number === n) || state.prs.find((p) => p.number === n);
  return {
    calls,
    getIssue: async (n) => { const i = find(n); return i && { state: i.open === false ? 'closed' : 'open', ...i, labels: (i.labels || []).map((name) => ({ name })) }; },
    updateIssue: async (n, patch) => { Object.assign(find(n), patch); },
    getRepo: async () => ({ default_branch: 'main' }),
    dispatch: async (wf, ref, inputs) => calls.push(['dispatch', wf, ref, inputs]),
    react: async (id, c) => calls.push(['react', id, c]),
    getPr: async (n) => state.prs.find((p) => p.number === n),
    listPulls: async () => state.prs.filter((p) => p.state !== 'closed'),
    listClosedPulls: async () => state.prs.filter((p) => p.state === 'closed'),
    listIssues: async ({ labels }) => state.issues.filter((i) => i.open !== false && i.labels.includes(labels)).map((i) => ({ ...i, labels: i.labels.map((name) => ({ name })) })),
    listOpenIssues: async () => [...state.issues, ...state.prs.map((p) => ({ ...p, pull_request: {} }))].filter((i) => i.open !== false && i.state !== 'closed').map((i) => ({ ...i, state: 'open', labels: (i.labels || []).map((name) => ({ name })) })),
    listComments: async (n) => state.comments?.[n] || [],
    listEvents: async (n) => state.events?.[n] || [],
    comment: async (n, body) => calls.push(['comment', n, body]),
    addLabels: async (n, ls) => { calls.push(['add', n, ...ls]); const i = find(n); if (i) i.labels = [...new Set([...(i.labels || []), ...ls])]; },
    removeLabel: async (n, l) => { calls.push(['remove', n, l]); const i = find(n); if (i) i.labels = (i.labels || []).filter((x) => x !== l); },
    merge: async (n) => calls.push(['merge', n]),
    closeIssue: async (n) => { calls.push(['close', n]); const i = find(n); if (i) i.open = false; },
    deployments: async () => [{ id: 1 }],
    recentDeployments: async () => state.deployments || [{ id: 1, environment: 'Preview' }],
    deploymentStatuses: async () => [{ state: 'success', environment_url: 'https://preview.example' }],
  };
}
// A routine that answers each launch with the next status of the list (200 once it runs out).
function routine(statuses = [], sent = []) {
  const left = [...statuses];
  const fetchImpl = async (url, init) => {
    sent.push(init);
    const status = left.length ? left.shift() : 200;
    return { ok: status === 200, status, text: async () => 'busy', json: async () => ({ claude_code_session_url: 'https://claude.ai/code/s' }) };
  };
  return { fetchImpl, sent };
}
const make = (gh, statuses = [], { cfg = config, at = 0 } = {}) => {
  const clock = { t: at };
  const r = routine(statuses);
  const relay = createRelay({ gh, repo: 'phoibe/app', config: cfg, env, fetchImpl: r.fetchImpl, log: quiet, now: () => clock.t, sleep: async () => {} });
  return { relay, clock, sent: r.sent };
};
const owner = (n, text, labels, kind = 'issue') => ({ kind, event: 'issue_comment', action: 'created', number: n, labels, text, fromOwner: true });
const names = async (gh, n) => (await gh.getIssue(n)).labels.map((l) => l.name);

// Part: scripts/relay/watch.mjs (conflicts, stale locks, stopped builds, label repair, close on the tick).
const NOW = Date.parse('2026-11-04T18:00:00Z');
const minutesAgo = (m) => new Date(NOW - m * MIN).toISOString();
const tick = { kind: 'tick', event: 'schedule', labels: [], fromOwner: false };
// The agent lock was put `labeledAgo` minutes ago and, maybe, removed `unlabeledAgo` minutes ago.
const runEvents = (labeledAgo, unlabeledAgo) => [
  { event: 'labeled', label: { name: L.running }, created_at: minutesAgo(labeledAgo) },
  ...(unlabeledAgo == null ? [] : [{ event: 'unlabeled', label: { name: L.running }, created_at: minutesAgo(unlabeledAgo) }]),
];
const onTick = (gh, cfg = config) => make(gh, [], { cfg, at: NOW });

test('the tick sends a PR stuck in conflict to a branch update', async () => {
  const gh = fakeGh({
    issues: [{ number: 52, labels: [L.feature, L.building] }, { number: 61, labels: [L.checks], pull_request: {} }],
    prs: [{ number: 61, state: 'open', mergeable_state: 'dirty', body: 'Closes #52', head: { sha: 'abc' }, labels: [L.checks] }],
  });
  const { relay, sent } = onTick(gh);
  await relay.handle(tick);
  assert.equal(payloadOf(sent[0].body).stage, 'update-branch');
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 61 && c[2] === L.checks));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 61 && c[2] === L.fixing));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 61 && /conflit/.test(c[2])));
});

test('the tick leaves a mergeable PR alone', async () => {
  const gh = fakeGh({ issues: [{ number: 61, labels: [L.checks], pull_request: {} }], prs: [{ number: 61, state: 'open', mergeable_state: 'clean', body: '', head: { sha: 'abc' } }] });
  const { relay, sent } = onTick(gh);
  await relay.handle(tick);
  assert.equal(sent.length, 0);
  assert.deepEqual(gh.calls, []);
});

test('a build that stopped without a PR is relaunched once, quietly, at the tick', async () => {
  const gh = fakeGh({ issues: [{ number: 7, labels: [L.feature, L.building] }], prs: [], events: { 7: runEvents(60, 40) } });
  const { relay, sent } = onTick(gh);
  await relay.handle(tick);
  const p = payloadOf(sent[0].body);
  assert.deepEqual([p.stage, p.issue, p.relaunch], ['build', 7, true]);
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 7 && c[2].includes('<!-- factory-heal -->')));
});

test('a build that stopped only a few minutes ago is not relaunched yet', async () => {
  const gh = fakeGh({ issues: [{ number: 7, labels: [L.feature, L.building] }], prs: [], events: { 7: runEvents(30, 10) } });
  const { relay, sent } = onTick(gh);
  await relay.handle(tick);
  assert.equal(sent.length, 0);
});

test('an agent lock older than its time limit is released at the tick, a fresh one never', async () => {
  const gh = fakeGh({
    issues: [{ number: 5, labels: [L.feature, L.grilling, L.running] }, { number: 6, labels: [L.feature, L.grilling, L.running] }],
    prs: [], events: { 5: runEvents(200), 6: runEvents(20) },
  });
  await onTick(gh).relay.handle(tick);
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 5 && c[2] === L.running));
  assert.ok(!gh.calls.some((c) => c[1] === 6));
});
