import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../scripts/relay.mjs';
import { L } from '../scripts/lib/labels.mjs';

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

// Part: scripts/relay/launches.mjs (launch and relaunch the agent, the queue, autoPick).
const go = (n) => owner(n, 'go', [L.feature, L.specReview]);

test('a saturated service leaves the card at its step, with no message for the owner', async () => {
  const gh = fakeGh({ issues: [{ number: 3, body: 'Ma demande', labels: [L.feature, L.specReview] }], prs: [] });
  const { relay } = make(gh, [529]);
  await relay.handle(go(3));
  assert.ok(!gh.calls.some((c) => c[0] === 'comment'));
  assert.deepEqual((await names(gh, 3)).filter((l) => l !== L.running), [L.feature, L.specReview, L.relaunch]);
});

test('a failed agent start is retried at the next tick once its delay has passed', async () => {
  const gh = fakeGh({ issues: [{ number: 3, body: 'Ma demande', labels: [L.feature, L.specReview] }], prs: [] });
  const { relay, clock, sent } = make(gh, [529]);
  await relay.handle(go(3));
  clock.t = MIN;
  await relay.retryLaunches();
  assert.equal(sent.length, 1, 'not due yet: nothing is sent');
  clock.t = 2 * MIN;
  await relay.retryLaunches();
  assert.equal(sent.length, 2);
  assert.equal(payloadOf(sent[1].body).stage, 'build');
  const labels = await names(gh, 3);
  assert.ok(labels.includes(L.building) && !labels.includes(L.specReview) && !labels.includes(L.relaunch));
});

test('a spec approval waits in the queue when every place is taken', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.building] }, { number: 2, labels: [L.building] }, { number: 3, labels: [L.feature, L.specReview] }], prs: [] });
  const { relay, sent } = make(gh);
  await relay.handle(go(3));
  assert.equal(sent.length, 0);
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 3 && c[2] === L.queued));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 3 && /file d'attente/.test(c[2])));
});

test('autoPick starts a bug before an older feature and says it picked the card by itself', async () => {
  const issue = (number, ...labels) => ({ number, labels, created_at: `2026-01-${String(number).padStart(2, '0')}T00:00:00Z` });
  const gh = fakeGh({ issues: [issue(1, L.feature), issue(2, L.bug)], prs: [] });
  const { relay, sent } = make(gh, [], { cfg: { ...config, maxParallel: 1, autoPick: true, maxQuestions: 1 } });
  await relay.dequeue();
  assert.deepEqual(sent.map((s) => { const p = payloadOf(s.body); return [p.issue, p.stage]; }), [[2, 'bugfix']]);
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 2 && c.includes(L.building)));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 2 && /prise d'elle-même/.test(c[2])));
});

test('autoPick off: a free place and an open issue start nothing', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.bug], created_at: '2026-01-01T00:00:00Z' }], prs: [] });
  const { relay, sent } = make(gh, [], { cfg: { ...config, autoPick: false } });
  await relay.dequeue();
  assert.equal(sent.length, 0);
  assert.deepEqual(gh.calls, []);
});
