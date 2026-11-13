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

// Part: scripts/relay/delivery.mjs (merge, production release, live check).
const okOn10 = owner(10, 'ok', [L.acceptance], 'pr');
const prs = () => [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.acceptance], mergeable_state: 'behind' }];

test('an acceptance « ok » merges the PR and frees the place of its request', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.building] }], prs: prs() });
  await make(gh).relay.handle(okOn10);
  assert.ok(gh.calls.some((c) => c[0] === 'merge' && c[1] === 10));
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 1 && c[2] === L.building));
});

test('a merge that GitHub refuses sends the branch to be updated instead of stranding it', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.building] }], prs: prs() });
  gh.merge = async () => { throw new Error('PUT merge -> 405'); };
  const { relay, sent } = make(gh);
  await relay.handle(okOn10);
  assert.equal(payloadOf(sent[0].body).stage, 'update-branch');
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 10 && c[2] === L.fixing));
});

test('on approval, a merged change waits for « Mise en production » and no live check starts', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, title: 'Mode sombre', body: 'Closes #1', head: { sha: 'abc' }, merge_commit_sha: 'm1' }], deployments: [{ id: 1, environment: 'Production' }] });
  const branches = { main: 'm1', production: 'm0' };
  gh.getBranch = async (name) => (branches[name] ? { object: { sha: branches[name] } } : null);
  gh.listAwaiting = async () => [];
  const { relay } = make(gh, [], { cfg: { ...config, production: 'approval' } });
  await relay.report({ result: 'success', pr: 10, preview: { result: 'passed', url: 'u' } });
  await relay.handle(okOn10);
  assert.ok(gh.calls.some((c) => c[0] === 'merge' && c[1] === 10));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 10 && c[2] === L.awaitingProd));
  assert.ok(!gh.calls.some((c) => c[0] === 'dispatch' && /prodCheck/.test(c[3]?.payload || '')));
});

test('after a merge on a deployed project, the live check is asked for the merged commit', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, merge_commit_sha: 'm1' }], deployments: [{ id: 1, environment: 'Production' }] });
  const { relay } = make(gh);
  await relay.report({ result: 'success', pr: 10, preview: { result: 'passed', url: 'u' } });
  await relay.handle(okOn10);
  const dispatched = gh.calls.filter((c) => c[0] === 'dispatch' && c[3]?.payload).map((c) => JSON.parse(c[3].payload));
  assert.deepEqual(dispatched.at(-1), { prodCheck: { pr: 10, sha: 'm1' } });
});

test('a live deploy that failed with nothing newer behind it is a broken delivery', async () => {
  const gh = fakeGh({ issues: [], prs: [] });
  gh.deployments = async () => [{ id: 1, environment: 'github-pages', created_at: '2026-11-06T12:53:16Z' }];
  gh.deploymentStatuses = async () => [{ state: 'failure' }];
  assert.deepEqual(await make(gh).relay.liveUrl('x', { attempts: 3, delayMs: 0 }), { failed: true });
});
