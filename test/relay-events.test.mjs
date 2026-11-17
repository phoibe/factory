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

// Part: scripts/relay/events.mjs (eventFromPayload, handle, report).
test('a GitHub comment becomes an event that knows its author: agent, owner or stranger', () => {
  const payload = { action: 'created', repository: { owner: { login: 'phoibe' } }, issue: { number: 5, labels: [{ name: L.grilling }] }, comment: { body: `${AGENT_MARKER}\nq`, user: { login: 'phoibe' } } };
  const ev = eventFromPayload('issue_comment', payload);
  assert.deepEqual([ev.kind, ev.fromAgent, ev.fromOwner, ev.labels], ['issue', true, true, [L.grilling]]);
  const stranger = eventFromPayload('issue_comment', { ...payload, issue: { ...payload.issue, pull_request: {} }, comment: { body: 'ok', user: { login: 'someone' } } });
  assert.deepEqual([stranger.kind, stranger.fromOwner], ['pr', false]);
});

test('a schedule or a dispatched tick becomes a queue check', () => {
  assert.equal(eventFromPayload('schedule', {}).kind, 'tick');
  assert.equal(eventFromPayload('workflow_dispatch', { inputs: { payload: '{"tick":true}' }, repository: { owner: { login: 'phoibe' } } }).kind, 'tick');
});

test('an owner answer fires the agent with its payload and locks the card', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.feature, L.grilling] }], prs: [] });
  const { relay, sent } = make(gh);
  const { action } = await relay.handle(owner(5, '1 oui', [L.feature, L.grilling]));
  assert.equal(action.stage, 'grilling');
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 5 && c[2] === L.running));
  assert.deepEqual(payloadOf(sent[0].body), { repo: 'phoibe/app', issue: 5, pr: null, stage: 'grilling', factory: 'phoibe/factory' });
});

test('a message written while the agent runs is deferred with a reaction', async () => {
  const lockedAt = new Date(Date.now() - 10 * MIN).toISOString();
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.grilling, L.running] }], prs: [], events: { 5: [{ event: 'labeled', label: { name: L.running }, created_at: lockedAt }] } });
  const { relay, sent } = make(gh, [], { at: Date.now() });
  const { action } = await relay.handle({ ...owner(5, 'x', [L.grilling, L.running]), commentId: 77 });
  assert.equal(action.type, 'defer');
  assert.equal(sent.length, 0);
  assert.ok(gh.calls.some((c) => c[0] === 'react' && c[1] === 77));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[2] === L.pending));
});

test('a report for an old commit does nothing', async () => {
  const gh = fakeGh({ issues: [], prs: [{ number: 7, body: '', head: { sha: 'new' }, labels: [] }] });
  await make(gh).relay.report({ result: 'success', pr: 7, sha: 'old' });
  assert.deepEqual(gh.calls, []);
});

test('green checks on a bug merge it at once, with no recette', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.bug, L.building] }], prs: [{ number: 10, body: 'Fixes #1', head: { sha: 'abc' } }] });
  await make(gh).relay.report({ result: 'success', pr: 10 });
  assert.ok(gh.calls.some((c) => c[0] === 'merge' && c[1] === 10));
  assert.ok(!gh.calls.some((c) => c[0] === 'add' && c[2] === L.acceptance));
});

test('red checks start a fix, then block the card after three failures', async () => {
  const state = { issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' } }], comments: { 10: [] } };
  const first = make(fakeGh(state));
  await first.relay.report({ result: 'failure', pr: 10 });
  assert.equal(payloadOf(first.sent[0].body).stage, 'fix-checks');
  state.comments[10] = [1, 2, 3].map(() => ({ body: CHECKS_FAILED_MARKER }));
  state.prs[0].labels = [];
  const gh = fakeGh(state);
  const last = make(gh);
  await last.relay.report({ result: 'failure', pr: 10 });
  assert.equal(last.sent.length, 0);
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 1 && c[2] === L.blocked));
});
