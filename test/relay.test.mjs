import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay, eventFromPayload, linkedIssue } from '../scripts/relay.mjs';
import { L, AGENT_MARKER, CHECKS_FAILED_MARKER } from '../scripts/lib/labels.mjs';

const config = { runner: 'claude-cloud', maxParallel: 2, stages: { grilling: true, acceptance: true }, review: { maxLoops: 3 } };

function fakeGh(state) {
  const calls = [];
  const issue = (n) => state.issues.find((i) => i.number === n);
  const gh = {
    calls,
    getIssue: async (n) => issue(n),
    getPr: async (n) => state.prs.find((p) => p.number === n),
    listIssues: async ({ labels }) => state.issues.filter((i) => i.open !== false && i.labels.includes(labels)).map((i) => ({ ...i, labels: i.labels.map((name) => ({ name })) })),
    listComments: async (n) => state.comments?.[n] || [],
    listEvents: async (n) => state.events?.[n] || [],
    comment: async (n, body) => calls.push(['comment', n, body]),
    addLabels: async (n, ls) => { calls.push(['add', n, ...ls]); const i = issue(n); if (i) i.labels.push(...ls); },
    removeLabel: async (n, l) => { calls.push(['remove', n, l]); const i = issue(n); if (i) i.labels = i.labels.filter((x) => x !== l); },
    merge: async (n) => calls.push(['merge', n]),
    deployments: async () => [{ id: 1 }],
    deploymentStatuses: async () => [{ state: 'success', environment_url: 'https://preview.example' }],
  };
  return gh;
}

const fetchOk = (sink) => async (url, init) => { sink.push({ url, init }); return { ok: true, json: async () => ({ claude_code_session_url: 'https://claude.ai/code/s' }) }; };
const env = { FACTORY_ROUTINE_URL: 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire', FACTORY_ROUTINE_TOKEN: 'tok' };
const quiet = () => {};

test('linkedIssue finds closing keywords', () => {
  assert.equal(linkedIssue('Résumé\n\nCloses #12'), 12);
  assert.equal(linkedIssue('fixes #3'), 3);
  assert.equal(linkedIssue('see #4'), null);
});

test('eventFromPayload marks agent comments and the owner', () => {
  const p = { action: 'created', repository: { owner: { login: 'phoibe' } }, issue: { number: 5, labels: [{ name: L.grilling }] }, comment: { body: `${AGENT_MARKER}\nq`, user: { login: 'phoibe' } } };
  const ev = eventFromPayload('issue_comment', p);
  assert.deepEqual([ev.kind, ev.fromAgent, ev.fromOwner, ev.labels], ['issue', true, true, [L.grilling]]);
  const prc = eventFromPayload('issue_comment', { ...p, issue: { ...p.issue, pull_request: {} }, comment: { body: 'ok', user: { login: 'someone' } } });
  assert.deepEqual([prc.kind, prc.fromOwner], ['pr', false]);
});

test('eventFromPayload trusts pushes by the Claude app on PRs', () => {
  const ev = eventFromPayload('pull_request', { action: 'synchronize', repository: { owner: { login: 'phoibe' } }, sender: { login: 'claude[bot]' }, pull_request: { number: 9, labels: [] } });
  assert.equal(ev.fromOwner, true);
});

test('a grilling answer fires the routine with the payload and locks the issue', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.feature, L.grilling] }], prs: [] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'phoibe/app', config, env, fetchImpl: fetchOk(sent), log: quiet });
  const { action } = await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 5, labels: [L.feature, L.grilling], text: '1 oui', fromOwner: true, fromAgent: false });
  assert.equal(action.stage, 'grilling');
  assert.deepEqual(gh.calls[0], ['add', 5, L.running]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].init.headers['anthropic-beta'], 'experimental-cc-routine-2026-04-01');
  assert.deepEqual(JSON.parse(JSON.parse(sent[0].init.body).text), { repo: 'phoibe/app', issue: 5, pr: null, stage: 'grilling', factory: 'phoibe/factory' });
});

test('a fresh lock swallows the comment', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.grilling, L.running] }], prs: [], events: { 5: [{ event: 'labeled', label: { name: L.running }, created_at: new Date(Date.now() - 10 * 60_000).toISOString() }] } });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  const { action } = await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 5, labels: [L.grilling, L.running], text: 'x', fromOwner: true });
  assert.equal(action.type, 'ignore');
  assert.equal(sent.length, 0);
});

test('a stale lock (over 90 minutes) does not block', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.grilling, L.running] }], prs: [], events: { 5: [{ event: 'labeled', label: { name: L.running }, created_at: new Date(Date.now() - 120 * 60_000).toISOString() }] } });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  const { action } = await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 5, labels: [L.grilling, L.running], text: 'x', fromOwner: true });
  assert.equal(action.type, 'fire');
});

test('spec approval queues when two builds are in flight', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.building] }, { number: 2, labels: [L.building] }, { number: 3, labels: [L.feature, L.specReview] }], prs: [] });
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet });
  const { action } = await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 3, labels: [L.feature, L.specReview], text: 'go', fromOwner: true });
  assert.equal(action.type, 'queue');
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 3 && c[2] === L.queued));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && /file d'attente/.test(c[2])));
});

test('acceptance approval merges, frees the issue and starts the oldest queued one', async () => {
  const gh = fakeGh({
    issues: [{ number: 1, labels: [L.building] }, { number: 2, labels: [L.building] }, { number: 4, labels: [L.feature, L.queued] }],
    prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' } }],
  });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [L.acceptance], text: 'ok', fromOwner: true });
  assert.ok(gh.calls.some((c) => c[0] === 'merge' && c[1] === 10));
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 1 && c[2] === L.building));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 4 && c[2] === L.building));
  assert.equal(JSON.parse(JSON.parse(sent[0].init.body).text).stage, 'build');
});

test('visual approval asks the workflow to run checks', async () => {
  const gh = fakeGh({ issues: [], prs: [] });
  const relay = createRelay({ gh, repo: 'r', config, env, log: quiet });
  const { outputs } = await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 7, labels: [L.visualReview], text: '👍', fromOwner: true });
  assert.deepEqual([outputs.checks, outputs.pr], ['true', '7']);
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[2] === L.checks));
});

test('github-actions runner hands the payload to the workflow instead of the routine', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.grilling] }], prs: [] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config: { ...config, runner: 'github-actions' }, env: {}, fetchImpl: fetchOk(sent), log: quiet });
  const { outputs } = await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 5, labels: [L.grilling], text: 'x', fromOwner: true });
  assert.equal(outputs.agent, 'true');
  assert.equal(JSON.parse(outputs.payload).stage, 'grilling');
  assert.equal(sent.length, 0);
});

test('missing routine secrets explain the fix in French and release the lock', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.grilling] }], prs: [] });
  const relay = createRelay({ gh, repo: 'r', config, env: {}, log: quiet });
  await assert.rejects(relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 5, labels: [L.grilling], text: 'x', fromOwner: true }));
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[2] === L.running));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && /FACTORY_ROUTINE_URL/.test(c[2])));
});

test('green checks on a feature open acceptance with the preview link', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' } }] });
  const relay = createRelay({ gh, repo: 'r', config, env, log: quiet, sleep: async () => {} });
  await relay.report({ result: 'success', pr: 10 });
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 10 && c[2] === L.acceptance));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[2].includes('https://preview.example')));
});

test('green checks on a bug merge directly', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.bug, L.building] }], prs: [{ number: 10, body: 'Fixes #1', head: { sha: 'abc' } }] });
  const relay = createRelay({ gh, repo: 'r', config, env, log: quiet });
  await relay.report({ result: 'success', pr: 10 });
  assert.ok(gh.calls.some((c) => c[0] === 'merge'));
});

test('red checks fire a fix, then block after maxLoops failures', async () => {
  const state = { issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' } }], comments: { 10: [] } };
  let gh = fakeGh(state);
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).report({ result: 'failure', pr: 10 });
  assert.equal(JSON.parse(JSON.parse(sent[0].init.body).text).stage, 'fix-checks');
  state.comments[10] = [1, 2, 3].map(() => ({ body: CHECKS_FAILED_MARKER }));
  gh = fakeGh(state);
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).report({ result: 'failure', pr: 10 });
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 1 && c[2] === L.blocked));
});

test('failures before a reset marker are not counted again', async () => {
  const state = { issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' } }],
    comments: { 10: [{ body: CHECKS_FAILED_MARKER }, { body: CHECKS_FAILED_MARKER }, { body: CHECKS_FAILED_MARKER }, { body: '<!-- factory-checks-reset -->' }] } };
  const sent = [];
  await createRelay({ gh: fakeGh(state), repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).report({ result: 'failure', pr: 10 });
  assert.equal(JSON.parse(JSON.parse(sent[0].init.body).text).stage, 'fix-checks');
});
