import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay, eventFromPayload, linkedIssue } from '../scripts/relay.mjs';
import { L, AGENT_MARKER, CHECKS_FAILED_MARKER, NOTHING_TO_TEST_MARKER, REVERT_MARKER, PROD_BUG_MARKER } from '../scripts/lib/labels.mjs';

const config = { runner: 'claude-cloud', maxParallel: 2, stages: { grilling: true, acceptance: true }, review: { maxLoops: 3 } };

function fakeGh(state) {
  const calls = [];
  const issue = (n) => state.issues.find((i) => i.number === n) || state.prs.find((p) => p.number === n);
  const gh = {
    calls,
    getIssue: async (n) => { const i = issue(n); return i && { state: i.open === false ? 'closed' : 'open', ...i, labels: (i.labels || []).map((name) => ({ name })) }; },
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
    addLabels: async (n, ls) => { calls.push(['add', n, ...ls]); const i = issue(n); if (i) { i.labels = i.labels || []; i.labels.push(...ls); } },
    removeLabel: async (n, l) => { calls.push(['remove', n, l]); const i = issue(n); if (i) i.labels = (i.labels || []).filter((x) => x !== l); },
    merge: async (n) => calls.push(['merge', n]),
    ...(state.files ? { listPrFiles: async (n) => state.files[n] || [] } : {}),
    closeIssue: async (n) => { calls.push(['close', n]); const i = issue(n); if (i) i.open = false; },
    deployments: async () => [{ id: 1 }],
    recentDeployments: async () => state.deployments || [{ id: 1, environment: 'Preview' }],
    deploymentStatuses: async () => [{ state: 'success', environment_url: 'https://preview.example' }],
  };
  return gh;
}

const fetchOk = (sink) => async (url, init) => { sink.push({ url, init }); return { ok: true, json: async () => ({ claude_code_session_url: 'https://claude.ai/code/s' }) }; };
const env = { FACTORY_ROUTINE_URL: 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire', FACTORY_ROUTINE_TOKEN: 'tok' };
const quiet = () => {};
// The routine text is a title line, a blank line, then the JSON payload.
const payloadOf = (body) => JSON.parse(JSON.parse(body).text.split('\n\n').slice(1).join('\n\n'));

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

test('eventFromPayload turns a dispatched {"tick":true} into a queue check', () => {
  const ev = eventFromPayload('workflow_dispatch', { inputs: { payload: '{"tick":true}' }, repository: { owner: { login: 'phoibe' } } });
  assert.equal(ev.kind, 'tick');
});

test('eventFromPayload trusts pushes by the Claude app on PRs', () => {
  const ev = eventFromPayload('pull_request', { action: 'synchronize', repository: { owner: { login: 'phoibe' } }, sender: { login: 'claude[bot]' }, pull_request: { number: 9, labels: [] } });
  assert.equal(ev.fromOwner, true);
});

test('a scheduled event becomes a tick', () => {
  assert.equal(eventFromPayload('schedule', {}).kind, 'tick');
});

test('a grilling answer fires the routine with the payload and locks the issue', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.feature, L.grilling] }], prs: [] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'phoibe/app', config, env, fetchImpl: fetchOk(sent), log: quiet });
  const { action } = await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 5, labels: [L.feature, L.grilling], text: '1 oui', fromOwner: true, fromAgent: false });
  assert.equal(action.stage, 'grilling');
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 5 && c[2] === L.running));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].init.headers['anthropic-beta'], 'experimental-cc-routine-2026-04-01');
  assert.deepEqual(payloadOf(sent[0].init.body), { repo: 'phoibe/app', issue: 5, pr: null, stage: 'grilling', factory: 'phoibe/factory' });
});

test('a fresh lock defers the comment with a reaction', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.grilling, L.running] }], prs: [], events: { 5: [{ event: 'labeled', label: { name: L.running }, created_at: new Date(Date.now() - 10 * 60_000).toISOString() }] } });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  const { action } = await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 5, commentId: 77, labels: [L.grilling, L.running], text: 'x', fromOwner: true });
  assert.equal(action.type, 'defer');
  assert.equal(sent.length, 0);
  assert.ok(gh.calls.some((c) => c[0] === 'react' && c[1] === 77));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[2] === L.pending));
});

test('a stale lock (over 150 minutes) does not block', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.grilling, L.running] }], prs: [], events: { 5: [{ event: 'labeled', label: { name: L.running }, created_at: new Date(Date.now() - 200 * 60_000).toISOString() }] } });
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
    prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.acceptance] }],
  });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [], text: 'ok', fromOwner: true });
  assert.ok(gh.calls.some((c) => c[0] === 'merge' && c[1] === 10));
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 1 && c[2] === L.building));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 4 && c[2] === L.building));
  assert.equal(payloadOf(sent[0].init.body).stage, 'build');
});

test('a message on a PR closed by hand starts nothing and merges nothing', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.building] }], prs: [{ number: 10, open: false, state: 'closed', body: 'Closes #1', head: { sha: 'abc' }, labels: [L.acceptance] }] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  for (const text of ['ok', 'merci, mais le bouton est trop petit']) {
    await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [], text, fromOwner: true });
  }
  assert.ok(!gh.calls.some((c) => c[0] === 'merge'));
  assert.equal(sent.length, 0);
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 10 && /fermée/.test(c[2])), 'the owner is told why nothing happens');
});

test('visual approval asks the workflow to run checks', async () => {
  const gh = fakeGh({ issues: [], prs: [{ number: 7, labels: [L.visualReview] }] });
  const relay = createRelay({ gh, repo: 'r', config: { ...config, stages: { ...config.stages, checks: true } }, env, log: quiet });
  const { outputs } = await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 7, labels: [], text: '👍', fromOwner: true });
  assert.deepEqual([outputs.checks, outputs.pr], ['true', '7']);
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[2] === L.checks));
});

test('github-actions runner dispatches the project workflow with the payload', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.grilling] }], prs: [] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config: { ...config, runner: 'github-actions' }, env: {}, fetchImpl: fetchOk(sent), log: quiet });
  await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 5, labels: [], text: 'x', fromOwner: true });
  const d = gh.calls.find((c) => c[0] === 'dispatch');
  assert.deepEqual([d[1], d[2], JSON.parse(d[3].payload).stage], ['factory.yml', 'main', 'grilling']);
  assert.equal(sent.length, 0);
});

test('the dispatched run hands the payload to the agent job', async () => {
  const relay = createRelay({ gh: fakeGh({ issues: [], prs: [] }), repo: 'r', config, env, log: quiet });
  const { outputs } = await relay.handle({ kind: 'dispatch', payload: '{"stage":"build"}' });
  assert.deepEqual([outputs.agent, outputs.payload], ['true', '{"stage":"build"}']);
});

test('a failed fire leaves the state labels untouched so the same answer works again', async () => {
  const gh = fakeGh({ issues: [{ number: 3, labels: [L.feature, L.specReview] }], prs: [] });
  const failing = async () => ({ ok: false, status: 429, text: async () => 'limit' });
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: failing, log: quiet });
  await assert.rejects(relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 3, labels: [], text: 'go', fromOwner: true }));
  assert.deepEqual((await gh.getIssue(3)).labels.map((l) => l.name), [L.feature, L.specReview]);
});

test('a failed merge sends the branch to update instead of stranding it', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.acceptance], mergeable_state: 'behind' }] });
  gh.merge = async () => { throw new Error('PUT merge -> 405'); };
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [], text: 'ok', fromOwner: true });
  assert.equal(payloadOf(sent[0].init.body).stage, 'update-branch');
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 10 && c[2] === L.fixing));
});

test('releasing the lock replays the owner message written during the run', async () => {
  const start = new Date(Date.now() - 20 * 60_000).toISOString();
  const gh = fakeGh({
    issues: [{ number: 3, labels: [L.feature, L.specReview, L.running, L.pending] }], prs: [],
    events: { 3: [{ event: 'labeled', label: { name: L.running }, created_at: start }] },
    comments: { 3: [
      { user: { login: 'phoibe' }, body: 'ancienne réponse', created_at: new Date(Date.now() - 60 * 60_000).toISOString() },
      { user: { login: 'phoibe' }, body: `${AGENT_MARKER}
Spec v1`, created_at: new Date(Date.now() - 5 * 60_000).toISOString() },
      { user: { login: 'phoibe' }, body: 'go', created_at: new Date(Date.now() - 10 * 60_000).toISOString() },
    ] },
  });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.release({ issue: 3, pr: null });
  const d = gh.calls.find((c) => c[0] === 'dispatch');
  assert.deepEqual(JSON.parse(d[3].payload), { replay: 3 });
  await relay.handle({ kind: 'replay', event: 'issues', action: 'unlabeled', removedLabel: L.running, number: 3, labels: [] }, { ownerLogin: 'phoibe' });
  assert.equal(payloadOf(sent[0].init.body).stage, 'build');
  assert.ok(!(await gh.getIssue(3)).labels.some((l) => l.name === L.pending));
});

test('release does nothing when the agent already removed its lock', async () => {
  const gh = fakeGh({ issues: [{ number: 3, labels: [L.specReview, L.pending] }], prs: [] });
  await createRelay({ gh, repo: 'r', config, env, log: quiet }).release({ issue: 3, pr: null });
  assert.equal(gh.calls.length, 0);
});

test('a permanent merge refusal blocks with an explanation instead of looping', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.acceptance], mergeable_state: 'blocked' }] });
  gh.merge = async () => { throw new Error('PUT merge -> 405 required review'); };
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet })
    .handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [], text: 'ok', fromOwner: true });
  assert.equal(sent.length, 0);
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 1 && c[2] === L.blocked));
});

test('a failed fix-checks fire parks the issue as blocked', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.checks] }], comments: { 10: [] } });
  const failing = async () => ({ ok: false, status: 429, text: async () => 'limit' });
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: failing, log: quiet }).report({ result: 'failure', pr: 10 });
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 1 && c[2] === L.blocked));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && /réessaie/.test(c[2])));
});

test('an expired lock with deferred messages handles them with the new comment', async () => {
  const old = new Date(Date.now() - 200 * 60_000).toISOString();
  const gh = fakeGh({
    issues: [{ number: 3, labels: [L.feature, L.specReview, L.running, L.pending] }], prs: [],
    events: { 3: [{ event: 'labeled', label: { name: L.running }, created_at: old }] },
    comments: { 3: [{ user: { login: 'phoibe' }, body: 'ajoute un mode sombre', created_at: new Date(Date.now() - 100 * 60_000).toISOString() }] },
  });
  const sent = [];
  const { action } = await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet })
    .handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 3, labels: [], text: 'go', fromOwner: true }, { ownerLogin: 'phoibe' });
  assert.equal(action.stage, 'spec'); // "ajoute un mode sombre" + "go" is not a plain approval
});

test('checks disabled in the rules go straight to the result', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.bug, L.building] }], prs: [{ number: 7, body: 'Fixes #1', head: { sha: 's' }, labels: [L.visualReview] }] });
  const relay = createRelay({ gh, repo: 'r', config: { ...config, stages: { ...config.stages, checks: false } }, env, log: quiet });
  const { outputs } = await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 7, labels: [], text: 'ok', fromOwner: true });
  assert.notEqual(outputs.checks, 'true');
  assert.ok(gh.calls.some((c) => c[0] === 'merge'));
});

test('a report for an old commit does nothing', async () => {
  const gh = fakeGh({ issues: [], prs: [{ number: 7, body: '', head: { sha: 'new' }, labels: [] }] });
  await createRelay({ gh, repo: 'r', config, env, log: quiet }).report({ result: 'success', pr: 7, sha: 'old' });
  assert.equal(gh.calls.length, 0);
});

test('missing routine secrets explain the fix in French and release the lock', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.grilling] }], prs: [] });
  const relay = createRelay({ gh, repo: 'r', config, env: {}, log: quiet });
  await assert.rejects(relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 5, labels: [L.grilling], text: 'x', fromOwner: true }));
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[2] === L.running));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && /FACTORY_ROUTINE_URL/.test(c[2])));
});

test('green checks on a feature: the factory opens the preview first, then opens acceptance with its link', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' } }] });
  const relay = createRelay({ gh, repo: 'r', config, env, log: quiet, sleep: async () => {} });
  await relay.report({ result: 'success', pr: 10 });
  const d = gh.calls.find((c) => c[0] === 'dispatch');
  assert.deepEqual(JSON.parse(d[3].payload), { previewCheck: { pr: 10, sha: 'abc', url: 'https://preview.example' } });
  assert.ok(!gh.calls.some((c) => c[0] === 'add' && c[2] === L.acceptance), 'no recette before the preview was opened');
  await relay.report({ result: 'success', pr: 10, sha: 'abc', preview: { result: 'passed', url: 'https://preview.example' } });
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 10 && c[2] === L.acceptance));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[2].includes('https://preview.example')));
  assert.equal(gh.calls.filter((c) => c[0] === 'dispatch').length, 1);
});

test('a preview the host protects (skipped) still goes to the recette', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' } }] });
  await createRelay({ gh, repo: 'r', config, env, log: quiet, sleep: async () => {} }).report({ result: 'success', pr: 10, sha: 'abc', preview: { result: 'skipped', url: 'https://p.example' } });
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[2] === L.acceptance));
});

test('a broken preview goes back to the agent with what is wrong, never to the owner', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.checks] }] });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet, sleep: async () => {} })
    .report({ result: 'success', pr: 10, sha: 'abc', preview: { result: 'failed', detail: '/ : la page est vide', url: 'https://p.example', runId: 7 } });
  assert.equal(payloadOf(sent[0].init.body).stage, 'fix-checks');
  assert.equal(payloadOf(sent[0].init.body).previewProblem, '/ : la page est vide');
  assert.ok(!gh.calls.some((c) => c[0] === 'add' && c[2] === L.acceptance));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 10 && c[2] === L.fixing));
  const msg = gh.calls.find((c) => c[0] === 'comment' && c[2].includes('factory-checks-failed'))[2];
  assert.match(msg, /la page est vide/);
});

test('a PR the agent marks « nothing to test » goes live on green checks, without recette or alert', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: `Closes #1\n${NOTHING_TO_TEST_MARKER}`, head: { sha: 'abc' } }], files: { 10: [{ filename: 'test/db.test.js' }] } });
  gh.getContent = async () => null;
  await createRelay({ gh, repo: 'r', config, env, log: quiet, sleep: async () => {} }).report({ result: 'success', pr: 10 });
  assert.ok(gh.calls.some((c) => c[0] === 'merge' && c[1] === 10));
  assert.ok(!gh.calls.some((c) => c[0] === 'add' && c[2] === L.acceptance));
  assert.ok(!gh.calls.some((c) => c[0] === 'dispatch' && /previewCheck/.test(c[3]?.payload || '')));
});

test('« nothing to test » is ignored when a screen changed', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: `Closes #1\n${NOTHING_TO_TEST_MARKER}`, head: { sha: 'abc' } }], files: { 10: [{ filename: 'src/App.tsx' }] } });
  gh.getContent = async () => null;
  await createRelay({ gh, repo: 'r', config: { ...config, stages: { ...config.stages, screenshots: false } }, env, log: quiet, sleep: async () => {} }).report({ result: 'success', pr: 10 });
  assert.ok(!gh.calls.some((c) => c[0] === 'merge'));
});

test('when no preview shows up, the acceptance message names no host in particular', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' } }] });
  gh.deploymentStatuses = async () => [{ state: 'pending' }];
  const relay = createRelay({ gh, repo: 'r', config, env, log: quiet, sleep: async () => {} });
  await relay.report({ result: 'success', pr: 10 });
  const check = JSON.parse(gh.calls.find((c) => c[0] === 'dispatch')[3].payload).previewCheck;
  // The preview job waits for it outside the queue lock, finds nothing, and the report goes on.
  const url = await relay.previewWait(check);
  assert.equal(url, null);
  await relay.report({ result: 'success', pr: 10, sha: 'abc', preview: { result: 'skipped', url } });
  const msg = gh.calls.find((c) => c[0] === 'comment')[2];
  assert.match(msg, /pas trouvé de preview/);
  assert.match(msg, /hébergeur/);
  assert.doesNotMatch(msg, /Vercel|README/);
});

test('green checks on a project without previews merge directly: nothing to try', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' } }], deployments: [{ id: 1, environment: 'github-pages' }] });
  let waited = 0;
  const relay = createRelay({ gh, repo: 'r', config, env, log: quiet, sleep: async () => { waited++; } });
  await relay.report({ result: 'success', pr: 10 });
  assert.ok(gh.calls.some((c) => c[0] === 'merge' && c[1] === 10));
  assert.ok(!gh.calls.some((c) => c[0] === 'add' && c[2] === L.acceptance));
  assert.match(gh.calls.find((c) => c[0] === 'comment')[2], /pas de preview/);
  assert.equal(waited, 0);
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
  assert.equal(payloadOf(sent[0].init.body).stage, 'fix-checks');
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
  assert.equal(payloadOf(sent[0].init.body).stage, 'fix-checks');
});

test('eventFromPayload flags issues opened less than a minute ago', () => {
  const p = (created) => ({ action: 'labeled', label: { name: 'factory:project' }, repository: { owner: { login: 'phoibe' } }, sender: { login: 'phoibe' }, issue: { number: 2, labels: [], body: '', created_at: created } });
  const now = Date.parse('2026-11-03T18:04:30Z');
  assert.equal(eventFromPayload('issues', p('2026-11-03T18:04:09Z'), now).openedRecently, true);
  assert.equal(eventFromPayload('issues', p('2026-11-03T17:00:00Z'), now).openedRecently, false);
});

test('vercelPreview reads the preview link from the Vercel bot comment once ready', async () => {
  const { vercelPreview } = await import('../scripts/relay.mjs');
  const row = (status) => `| [habitudes](https://vercel.com/x/habitudes) | ![${status}](https://vercel.com/static/status/${status.toLowerCase()}.svg) [${status}](https://vercel.com/x/1) | [Preview](https://habitudes-git-b-x.vercel.app) | now |`;
  assert.equal(vercelPreview([{ user: { login: 'vercel[bot]' }, body: row('Ready') }]), 'https://habitudes-git-b-x.vercel.app');
  assert.equal(vercelPreview([{ user: { login: 'vercel[bot]' }, body: row('Building') }]), null);
  assert.equal(vercelPreview([{ user: { login: 'someone' }, body: row('Ready') }]), null);
});

test('report posts the Fabrication comment from the journal and flags missing skills', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.building] }], prs: [{ number: 10, labels: [L.checks], head: { sha: 'abc' }, body: 'Closes #5' }] });
  const journal = [{ t: '1', kind: 'run', stage: 'build' }, { t: '2', kind: 'skill', name: 'writing-plans' }].map((e) => JSON.stringify(e)).join('\n');
  gh.getContent = async (path, ref) => {
    assert.equal(ref, 'abc');
    if (path === '.factory/journal/s1.jsonl') return { content: Buffer.from(journal).toString('base64') };
    return null;
  };
  gh.listPrFiles = async () => [{ filename: 'src/lib/x.ts' }, { filename: '.factory/journal/s1.jsonl', status: 'added' }];
  gh.updateComment = async () => assert.fail('no previous comment');
  const relay = createRelay({ gh, repo: 'r', config: { ...config, stages: { ...config.stages, plan: true, tdd: true, review: true } }, env, log: quiet });
  const alerts = await relay.fabrication(10, await gh.getPr(10));
  assert.equal(alerts.length, 2); // TDD and review missing
  const posted = gh.calls.find((c) => c[0] === 'comment' && c[1] === 10);
  assert.match(posted[2], /## Fabrication/);
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[2] === L.skillsAlert));
});

function prWithSkippedSteps(comments = []) {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.checks] }], comments: { 10: comments } });
  const journal = [{ t: '1', kind: 'run', stage: 'build' }, { t: '2', kind: 'skill', name: 'writing-plans' }, { t: '3', kind: 'skill', name: 'test-driven-development' },
    { t: '4', kind: 'test', ok: false }, { t: '5', kind: 'test', ok: true }].map((e) => JSON.stringify(e)).join('\n');
  gh.getContent = async () => ({ content: Buffer.from(journal).toString('base64') });
  gh.listPrFiles = async () => [{ filename: 'app/page.tsx' }, { filename: '.factory/journal/s1.jsonl', status: 'added' }];
  gh.updateComment = async () => {};
  return gh;
}
const SHOTS = { body: '<!-- factory-agent -->\n| Écran | ![x](https://github.com/r/blob/claude/factory-assets/pr-10/a.png) |' };
const allStages = { ...config, stages: { ...config.stages, plan: true, tdd: true, review: true, designPass: true } };

test('green checks after a skipped review and design pass start one catch-up run instead of acceptance', async () => {
  const gh = prWithSkippedSteps([SHOTS]);
  const sent = [];
  await createRelay({ gh, repo: 'r', config: allStages, env, fetchImpl: fetchOk(sent), log: quiet, sleep: async () => {} }).report({ result: 'success', pr: 10 });
  assert.equal(sent.length, 1);
  const text = JSON.parse(sent[0].init.body).text;
  assert.match(text, /"stage":"skills-fix"/);
  assert.match(text, /"missing":\["requesting-code-review","impeccable"\]/);
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 10 && c[2] === L.fixing));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 10 && /factory-skills-fix/.test(c[2]) && /les rattrape/.test(c[2])));
  assert.ok(!gh.calls.some((c) => c[0] === 'add' && c[2] === L.acceptance));
});

test('green checks on a visible change with no captures shown start a captures catch-up (PR 90)', async () => {
  const gh = prWithSkippedSteps();
  const journal = [{ t: '1', kind: 'run', stage: 'build' }, { t: '2', kind: 'skill', name: 'writing-plans' }, { t: '3', kind: 'skill', name: 'test-driven-development' },
    { t: '4', kind: 'skill', name: 'requesting-code-review' }, { t: '5', kind: 'skill', name: 'impeccable' }, { t: '6', kind: 'test', ok: false }, { t: '7', kind: 'test', ok: true }].map((e) => JSON.stringify(e)).join('\n');
  gh.getContent = async () => ({ content: Buffer.from(journal).toString('base64') });
  const sent = [];
  await createRelay({ gh, repo: 'r', config: allStages, env: { ...env }, fetchImpl: fetchOk(sent), log: quiet, sleep: async () => {} }).report({ result: 'success', pr: 10 });
  assert.equal(sent.length, 1);
  assert.match(JSON.parse(sent[0].init.body).text, /"missing":\["screenshots"\]/);
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && /les captures avant\/après/.test(c[2])));
  assert.ok(!gh.calls.some((c) => c[0] === 'add' && c[2] === L.acceptance));
});

test('no captures catch-up when the screenshots step is off or the change is not visual', async () => {
  const full = [{ t: '1', kind: 'run', stage: 'build' }, { t: '2', kind: 'skill', name: 'writing-plans' }, { t: '3', kind: 'skill', name: 'test-driven-development' },
    { t: '4', kind: 'skill', name: 'requesting-code-review' }, { t: '5', kind: 'skill', name: 'impeccable' }, { t: '6', kind: 'test', ok: false }, { t: '7', kind: 'test', ok: true }].map((e) => JSON.stringify(e)).join('\n');
  for (const [cfg, files] of [[{ ...allStages, stages: { ...allStages.stages, screenshots: false } }, null], [allStages, [{ filename: 'scripts/x.mjs' }]]]) {
    const gh = prWithSkippedSteps();
    gh.getContent = async () => ({ content: Buffer.from(full).toString('base64') });
    if (files) gh.listPrFiles = async () => files;
    const sent = [];
    await createRelay({ gh, repo: 'r', config: cfg, env: { ...env }, fetchImpl: fetchOk(sent), log: quiet, sleep: async () => {} }).report({ result: 'success', pr: 10 });
    assert.equal(sent.length, 0);
  }
});

test('the catch-up happens once: afterwards the PR goes on to acceptance with the alert', async () => {
  const gh = prWithSkippedSteps([SHOTS, { body: '<!-- factory-skills-fix -->\nrattrapage' }]);
  const sent = [];
  await createRelay({ gh, repo: 'r', config: allStages, env, fetchImpl: fetchOk(sent), log: quiet, sleep: async () => {} }).report({ result: 'success', pr: 10, preview: { result: 'passed', url: 'https://p.example' } });
  assert.equal(sent.length, 0);
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[2] === L.acceptance));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[2] === L.skillsAlert));
});

test("the owner's pasted screenshots are copied for the agent and listed in its payload", async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.feature, L.grilling] }], prs: [] });
  const id = '7b4bb623-1dff-4e0c-b757-acb063a58ce1';
  Object.assign(gh, {
    getIssueHtml: async () => ({ user: { login: 'phoibe' }, body_html: `<img src="https://private-user-images.githubusercontent.com/1/2-${id}.png?jwt=x">` }),
    listCommentsHtml: async () => [],
    getBranch: async () => ({}),
    getContent: async () => ({ sha: '1' }),
  });
  const sent = [];
  const relay = createRelay({ gh, repo: 'phoibe/app', config, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 5, labels: [L.feature, L.grilling], text: 'regarde', fromOwner: true });
  const payload = payloadOf(sent[0].init.body);
  assert.deepEqual(payload.attachments, [`attachments/5/${id}.png`]);
});

test('blocked cards do not hold a place; a blocked card answered while full goes to the queue, then resumes', async () => {
  const gh = fakeGh({
    issues: [{ number: 1, labels: [L.feature, L.building] }, { number: 2, labels: [L.feature, L.building] }, { number: 3, labels: [L.feature, L.building, L.blocked] }, { number: 4, labels: [L.feature, L.building, L.blocked] }],
    prs: [],
  });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  const { action } = await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 3, labels: [L.feature, L.building, L.blocked], text: 'réessaie', fromOwner: true });
  assert.equal(action.type, 'queue');
  assert.equal(sent.length, 0);
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 3 && c[2] === L.queued));
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 3 && c[2] === L.blocked));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 3 && /file d'attente/.test(c[2])));
  // A place frees up (card 1 opens its PR): the card resumes (not a fresh build).
  gh.getPr = async () => ({ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [] });
  await relay.handle({ kind: 'pr', event: 'pull_request', action: 'opened', number: 10, labels: [], fromOwner: true, open: true });
  assert.equal(payloadOf(sent[0].init.body).stage, 'resume');
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 3 && c[2] === L.building));
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 3 && c[2] === L.resumeQueued));
});

test('a blocked card with a free place resumes right away', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }, { number: 3, labels: [L.feature, L.building, L.blocked] }], prs: [] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  const { action } = await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 3, labels: [L.feature, L.building, L.blocked], text: 'réessaie', fromOwner: true });
  assert.equal(action.stage, 'resume');
  assert.equal(sent.length, 1);
});

test("the owner's answer on a blocked PR unblocks its issue too", async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.feature, L.building, L.blocked] }], prs: [{ number: 15, body: 'Closes #5', head: { sha: 'abc' }, labels: [L.blocked] }] });
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet });
  const { action } = await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 15, labels: [L.blocked], text: "c'est réglé", fromOwner: true });
  assert.equal(action.stage, 'resume');
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 15 && c[2] === L.blocked));
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 5 && c[2] === L.blocked));
});

test('checks stopped by the time limit count as a failure, so the PR never sits silently in the checks lane', async () => {
  const state = { issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' } }], comments: { 10: [] } };
  const gh = fakeGh(state);
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).report({ result: 'cancelled', pr: 10, sha: 'abc', started: Date.now() / 1000 - 31 * 60 });
  assert.equal(payloadOf(sent[0].init.body).stage, 'fix-checks');
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && /trop longtemps/.test(c[2])));
});

test('checks cancelled because the PR changed are ignored (a newer run reports)', async () => {
  const state = { issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'new' } }], comments: { 10: [] } };
  const sent = [];
  await createRelay({ gh: fakeGh(state), repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).report({ result: 'cancelled', pr: 10, sha: 'old' });
  assert.equal(sent.length, 0);
});

test('a run is named for the session list and its link is kept in one comment on the card', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.feature, L.grilling] }], prs: [] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'phoibe/habitudes', config, env, fetchImpl: fetchOk(sent), log: quiet });
  const msg = { kind: 'issue', event: 'issue_comment', action: 'created', number: 5, labels: [L.feature, L.grilling], text: '1 oui', fromOwner: true };
  await relay.handle(msg);
  assert.equal(JSON.parse(sent[0].init.body).text.split('\n')[0], 'habitudes · issue #5 · Questions');
  const note = gh.calls.find((c) => c[0] === 'comment' && c[1] === 5);
  assert.match(note[2], /factory-session[\s\S]*Questions[\s\S]*\(https:\/\/claude\.ai\/code\/s\)/);
  const updated = [];
  gh.listComments = async () => [{ id: 9, body: note[2] }];
  gh.updateComment = async (id, body) => updated.push(id);
  gh.issues = undefined;
  await relay.handle(msg);
  assert.deepEqual(updated, [9]);
});

test('a bare « Approve » review counts as an approval, a review with only inline comments says nothing', () => {
  const pr = { number: 3, labels: [{ name: L.acceptance }] };
  const mk = (review) => eventFromPayload('pull_request_review', { action: 'submitted', repository: { owner: { login: 'phoibe' } }, pull_request: pr, review: { user: { login: 'phoibe' }, ...review } });
  assert.equal(mk({ body: '', state: 'approved' }).text, 'ok');
  assert.equal(mk({ body: '', state: 'commented' }).text, '');
  assert.equal(mk({ body: 'Change le titre', state: 'commented' }).text, 'Change le titre');
});

test('checks cancelled early by a newer run on the same commit are not a hung test', async () => {
  const state = { issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.checks] }], comments: { 10: [] } };
  const gh = fakeGh(state);
  const sent = [];
  const now = Date.now();
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).report({ result: 'cancelled', pr: 10, sha: 'abc', started: now / 1000 - 120, now });
  assert.equal(sent.length, 0);
  assert.ok(!gh.calls.some((c) => c[0] === 'comment'));
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).report({ result: 'cancelled', pr: 10, sha: 'abc', started: now / 1000 - 31 * 60, now });
  assert.equal(payloadOf(sent[0].init.body).stage, 'fix-checks');
});

test('after its own merge the relay starts the workflows the push would have started (a bot push starts none)', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.acceptance] }] });
  gh.listPrFiles = async () => [{ filename: 'panel/style.css' }, { filename: 'factory.config.json' }];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet });
  await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [], text: 'ok', fromOwner: true });
  const dispatched = gh.calls.filter((c) => c[0] === 'dispatch').map((c) => c[1]);
  assert.ok(dispatched.includes('pages.yml'));
  assert.ok(dispatched.includes('factory-sync.yml'));
});

test('a project without those workflows still merges cleanly', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.acceptance] }] });
  gh.dispatch = async () => { throw new Error('HTTP 404'); };
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet });
  await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [], text: 'ok', fromOwner: true });
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && /fusionné/.test(c[2])));
});

test("a merge frees its place even while GitHub's issue list still shows the old label", async () => {
  const gh = fakeGh({
    issues: [{ number: 1, labels: [L.building] }, { number: 2, labels: [L.building] }, { number: 4, labels: [L.feature, L.queued] }],
    prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.acceptance] }],
  });
  // A stale list: issue 1 is still listed as building after its label was removed.
  const stale = gh.listIssues;
  gh.listIssues = async (q) => (q.labels === L.building ? [{ number: 1, labels: [{ name: L.building }] }, { number: 2, labels: [{ name: L.building }] }] : stale(q));
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [], text: 'ok', fromOwner: true });
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 4 && c[2] === L.building));
});

test('the regular tick sends a PR stuck in conflict (no checks can start) to a branch update', async () => {
  const gh = fakeGh({
    issues: [{ number: 52, labels: [L.feature, L.building] }, { number: 61, labels: [L.checks], pull_request: {} }],
    prs: [{ number: 61, state: 'open', mergeable_state: 'dirty', body: 'Closes #52', head: { sha: 'abc' }, labels: [L.checks] }],
  });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.handle({ kind: 'tick', event: 'schedule', labels: [], fromOwner: false });
  assert.equal(payloadOf(sent[0].init.body).stage, 'update-branch');
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 61 && c[2] === L.checks));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 61 && c[2] === L.fixing));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 61 && /conflit/.test(c[2])));
});

test('the regular tick leaves a mergeable PR in its checks alone', async () => {
  const gh = fakeGh({ issues: [{ number: 61, labels: [L.checks], pull_request: {} }], prs: [{ number: 61, state: 'open', mergeable_state: 'clean', body: '', head: { sha: 'abc' } }] });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).handle({ kind: 'tick', event: 'schedule', labels: [], fromOwner: false });
  assert.equal(sent.length, 0);
});

test('right after the factory merges a PR, a PR it put in conflict goes to a branch update', async () => {
  const gh = fakeGh({
    issues: [{ number: 1, labels: [L.building] }, { number: 52, labels: [L.feature, L.building] }, { number: 61, labels: [L.checks], pull_request: {} }],
    prs: [
      { number: 10, state: 'open', body: 'Closes #1', head: { sha: 'abc' }, labels: [L.acceptance] },
      { number: 61, state: 'open', mergeable_state: 'dirty', body: 'Closes #52', head: { sha: 'def' }, labels: [L.checks] },
    ],
  });
  // GitHub has not computed mergeability yet on the first read.
  const getPr = gh.getPr;
  let reads = 0;
  gh.getPr = async (n) => (n === 61 && reads++ === 0 ? { ...(await getPr(n)), mergeable_state: 'unknown' } : getPr(n));
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet, sleep: async () => {} });
  await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [], text: 'ok', fromOwner: true });
  assert.ok(gh.calls.some((c) => c[0] === 'merge' && c[1] === 10));
  assert.ok(sent.some((s) => payloadOf(s.init.body).stage === 'update-branch' && payloadOf(s.init.body).pr === 61));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 61 && c[2] === L.fixing));
});

test('a PR merged by hand also unsticks the PRs it put in conflict', async () => {
  const gh = fakeGh({
    issues: [{ number: 52, labels: [L.feature, L.building] }, { number: 61, labels: [L.checks], pull_request: {} }],
    prs: [{ number: 61, state: 'open', mergeable_state: 'dirty', body: 'Closes #52', head: { sha: 'def' }, labels: [L.checks] }],
  });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.handle({ kind: 'pr', event: 'pull_request', action: 'closed', number: 10, labels: [], fromOwner: true });
  assert.equal(payloadOf(sent[0].init.body).stage, 'update-branch');
});

test('any event unsticks a PR opened in conflict, without waiting for the rare scheduled tick', async () => {
  // The agent opened PR 61 on a branch already behind a merge: GitHub sent no pull_request event for it.
  const gh = fakeGh({
    issues: [{ number: 52, labels: [L.feature, L.building] }, { number: 61, labels: [L.checks], pull_request: {} }, { number: 70, labels: [L.feature, L.grilling] }],
    prs: [{ number: 61, state: 'open', mergeable_state: 'dirty', body: 'Closes #52', head: { sha: 'def' }, labels: [L.checks] }],
  });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.handle({ kind: 'issue', event: 'issues', action: 'unlabeled', removedLabel: L.running, number: 52, labels: [L.feature, L.building], fromOwner: false });
  assert.ok(sent.some((s) => payloadOf(s.init.body).stage === 'update-branch' && payloadOf(s.init.body).pr === 61));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 61 && c[2] === L.fixing));
});

test('a « go » that ends the questions of a picked feature lets the next feature start in the same run', async () => {
  // yoldmewhen2, 2026-11-06: #39 left its questions, 4 places were free, and #40 waited hours for the scheduled tick.
  const gh = fakeGh({ issues: [
    { number: 39, labels: [L.feature, L.autoPicked, L.specReview], created_at: '2026-01-01T00:00:00Z' },
    { number: 40, labels: [L.feature], created_at: '2026-01-02T00:00:00Z' },
  ], prs: [] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'phoibe/app', config: { ...config, maxParallel: 5, autoPick: true, maxQuestions: 1 }, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 39, labels: [L.feature, L.autoPicked, L.specReview], text: 'go', fromOwner: true, fromAgent: false });
  assert.deepEqual(sent.map((s) => [payloadOf(s.init.body).issue, payloadOf(s.init.body).stage]), [[39, 'build'], [40, 'grilling']]);
});

test('any event starts a queued card when a place is free, without waiting for the rare scheduled tick', async () => {
  const gh = fakeGh({ issues: [{ number: 7, labels: [L.feature, L.grilling] }, { number: 8, labels: [L.feature, L.queued] }], prs: [] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'phoibe/app', config, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 7, labels: [L.feature, L.grilling], text: 'note', fromOwner: false, fromAgent: true });
  assert.ok(sent.some((s) => payloadOf(s.init.body).issue === 8 && payloadOf(s.init.body).stage === 'build'));
});

test('a tick checks the queue once, not twice', async () => {
  const gh = fakeGh({ issues: [{ number: 8, labels: [L.feature, L.queued] }, { number: 9, labels: [L.feature, L.queued] }], prs: [] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'phoibe/app', config: { ...config, maxParallel: 1 }, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.handle({ kind: 'tick', event: 'schedule', number: null, labels: [], fromOwner: false });
  assert.deepEqual(sent.map((s) => payloadOf(s.init.body).issue), [8]);
});

// ---- auto-pick ----
const pickConfig = { ...config, autoPick: true, maxQuestions: 1, stages: { grilling: true, acceptance: true } };
async function runPick(issues, cfg = pickConfig) {
  const gh = fakeGh({ issues, prs: [] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'phoibe/app', config: cfg, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.dequeue();
  const started = sent.map((s) => payloadOf(s.init.body));
  return { gh, started };
}
const fi = (number, ...labels) => ({ number, labels, created_at: `2026-01-${String(number).padStart(2, '0')}T00:00:00Z` });

test('autoPick off: a free slot and an open issue start nothing', async () => {
  const { started } = await runPick([fi(1, L.feature)], { ...pickConfig, autoPick: false });
  assert.equal(started.length, 0);
});

test('autoPick picks a bug before an older feature, and comments on it', async () => {
  const { gh, started } = await runPick([fi(1, L.feature), fi(2, L.bug)], { ...pickConfig, maxParallel: 1 });
  assert.deepEqual(started.map((p) => [p.issue, p.stage]), [[2, 'bugfix']]);
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 2 && c.includes(L.building)));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 2 && c.includes(L.autoPicked)));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 2 && /prise d'elle-même/.test(c[2])));
});

test('autoPick: urgent goes first, a feature starts by grilling and holds back other features', async () => {
  const { started } = await runPick([fi(1, L.feature), fi(2, L.bug), fi(3, L.feature, L.urgent), fi(4, L.feature, L.urgent)], { ...pickConfig, maxParallel: 3 });
  assert.deepEqual(started.map((p) => [p.issue, p.stage]), [[3, 'grilling'], [2, 'bugfix']]);
});

test('autoPick never takes held, running, waiting, question, project or release issues', async () => {
  const issues = [fi(1, L.feature, L.noPick), fi(2, L.question), fi(3, L.project), fi(4, 'factory:release'), fi(5, L.feature, L.grilling),
    fi(6, L.feature, L.specReview), fi(7, L.bug, L.blocked), fi(9, L.feature, L.running), fi(10, L.audit), fi(11, 'enhancement')];
  const { started } = await runPick(issues, { ...pickConfig, maxParallel: 20 });
  assert.deepEqual(started, []);
});

test('autoPick takes nothing when the factory is full', async () => {
  const { started } = await runPick([fi(1, L.building), fi(2, L.building), fi(3, L.bug)]);
  assert.equal(started.length, 0);
});

test('autoPick starts the queue first and picks only for the slots left', async () => {
  const { started } = await runPick([fi(5, L.feature, L.queued), fi(1, L.bug), fi(2, L.bug)]);
  assert.deepEqual(started.map((p) => p.issue), [5, 1]);
});

test('autoPick stops picking features while an auto-picked one waits for the owner', async () => {
  const { started } = await runPick([fi(1, L.feature, L.autoPicked, L.grilling), fi(2, L.feature), fi(3, L.bug)]);
  assert.deepEqual(started.map((p) => p.issue), [3]);
});

test('maxQuestions 2: one picked feature waiting for the owner still lets one more feature be picked', async () => {
  const { started } = await runPick([fi(1, L.feature, L.autoPicked, L.grilling), fi(2, L.feature), fi(3, L.feature)], { ...pickConfig, maxParallel: 5, maxQuestions: 2 });
  assert.deepEqual(started.map((p) => [p.issue, p.stage]), [[2, 'grilling']]);
});

test('maxQuestions 2: two picked features waiting stop features, bugs are still picked', async () => {
  const { started } = await runPick([fi(1, L.feature, L.autoPicked, L.grilling), fi(2, L.feature, L.autoPicked, L.specReview), fi(3, L.feature), fi(4, L.bug)], { ...pickConfig, maxParallel: 5, maxQuestions: 2 });
  assert.deepEqual(started.map((p) => p.issue), [4]);
});

test('maxQuestions 2: two features can be picked in the same round, not a third', async () => {
  const { started } = await runPick([fi(1, L.feature), fi(2, L.feature), fi(3, L.feature)], { ...pickConfig, maxParallel: 5, maxQuestions: 2 });
  assert.deepEqual(started.map((p) => p.issue), [1, 2]);
});

test('maxQuestions lowered below the features already waiting: nothing is stopped, no new feature', async () => {
  const { gh, started } = await runPick([fi(1, L.feature, L.autoPicked, L.grilling), fi(2, L.feature, L.autoPicked, L.grilling), fi(3, L.feature)], { ...pickConfig, maxParallel: 5, maxQuestions: 1 });
  assert.deepEqual(started, []);
  assert.ok(!gh.calls.some((c) => c[0] === 'remove' && [1, 2].includes(c[1])));
});

test('maxQuestions with room left still stops at the free slots', async () => {
  const { started } = await runPick([fi(1, L.feature, L.autoPicked, L.grilling), fi(2, L.feature), fi(3, L.feature)], { ...pickConfig, maxParallel: 2, maxQuestions: 3 });
  assert.deepEqual(started.map((p) => p.issue), [2]);
});

test('maxQuestions missing from the config: 2 by default', async () => {
  const { maxQuestions, ...cfg } = pickConfig;
  const { started } = await runPick([fi(1, L.feature), fi(2, L.feature), fi(3, L.feature)], { ...cfg, maxParallel: 5 });
  assert.deepEqual(started.map((p) => p.issue), [1, 2]);
});

test('autoPick takes the oldest bug first when several tie', async () => {
  const { started } = await runPick([fi(7, L.bug), fi(3, L.bug), fi(5, L.bug)]);
  assert.deepEqual(started.map((p) => p.issue), [3, 5]);
});

test('autoPick: a failed start releases the claim and stops', async () => {
  const gh = fakeGh({ issues: [fi(1, L.bug), fi(2, L.bug)], prs: [] });
  const relay = createRelay({ gh, repo: 'phoibe/app', config: pickConfig, env, log: quiet,
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'limit' }) });
  await relay.dequeue();
  const issue = (await gh.getIssue(1)).labels.map((l) => l.name);
  assert.deepEqual(issue, [L.bug]);
  assert.equal(gh.calls.filter((c) => c[0] === 'comment' && /prise d'elle-même/.test(c[2] || '')).length, 0);
});

test('autoPick with grilling off starts the spec once and never re-picks that issue', async () => {
  const cfg = { ...pickConfig, stages: { grilling: false, acceptance: true } };
  const { started } = await runPick([fi(1, L.feature, L.autoPicked), fi(2, L.feature)], cfg);
  assert.deepEqual(started.map((p) => [p.issue, p.stage]), [[2, 'spec']]);
});

test('autoPick: an auto-picked spec waiting for validation also holds back other features', async () => {
  const { started } = await runPick([fi(1, L.feature, L.autoPicked, L.specReview), fi(2, L.feature)]);
  assert.deepEqual(started, []);
});

test('autoPick: an urgent bug beats an urgent feature and a plain bug', async () => {
  const { started } = await runPick([fi(1, L.feature, L.urgent), fi(2, L.bug), fi(3, L.bug, L.urgent)], { ...pickConfig, maxParallel: 1 });
  assert.deepEqual(started.map((p) => p.issue), [3]);
});

test('autoPick: a picked card waiting for the owner holds its place', async () => {
  const { started } = await runPick([fi(1, L.feature, L.autoPicked, L.grilling), fi(3, L.bug)], { ...pickConfig, maxParallel: 1 });
  assert.deepEqual(started, []);
});

test('autoPick skips a card that already has an open PR', async () => {
  const pr = { number: 50, labels: [L.checks], pull_request: {}, body: 'Closes #1', created_at: '2026-01-05T00:00:00Z' };
  const { started } = await runPick([fi(1, L.bug), fi(2, L.bug), pr], { ...pickConfig, maxParallel: 5 });
  assert.deepEqual(started.map((p) => p.issue), [2]);
});

test('autoPick skips the card whose build just ended', async () => {
  const gh = fakeGh({ issues: [fi(1, L.bug), fi(2, L.bug)], prs: [] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'phoibe/app', config: { ...pickConfig, maxParallel: 5 }, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.dequeue({ freed: 1 });
  assert.deepEqual(sent.map((s) => payloadOf(s.init.body).issue), [2]);
});

test('a card whose PR is open no longer holds a place (owner rule: the place frees once the PR is open)', async () => {
  const gh = fakeGh({
    issues: [{ number: 1, labels: [L.feature, L.building] }, { number: 2, labels: [L.feature, L.building] }, { number: 3, labels: [L.feature, L.specReview] }],
    prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.visualReview] }],
  });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  const { action } = await relay.handle({ kind: 'issue', event: 'issue_comment', action: 'created', number: 3, labels: [L.feature, L.specReview], text: 'go', fromOwner: true });
  assert.equal(action.type, 'fire');
  assert.equal(payloadOf(sent[0].init.body).stage, 'build');
});

test('opening a PR starts the oldest queued card at once', async () => {
  const gh = fakeGh({
    issues: [{ number: 1, labels: [L.feature, L.building] }, { number: 2, labels: [L.feature, L.building] }, { number: 4, labels: [L.feature, L.queued] }],
    // GitHub's PR list can lag a few seconds behind the opened event: the PR is not listed yet.
    prs: [],
  });
  gh.getPr = async () => ({ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.handle({ kind: 'pr', event: 'pull_request', action: 'opened', number: 10, labels: [], fromOwner: true, open: true });
  assert.equal(payloadOf(sent[0].init.body).stage, 'build');
  assert.equal(payloadOf(sent[0].init.body).issue, 4);
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 4 && c[2] === L.building));
});

test('a merge by the factory closes the linked issue (GitHub does not when the workflow token merges)', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, labels: [L.acceptance] }] });
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet, sleep: async () => {} });
  await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [], text: 'ok', fromOwner: true });
  assert.ok(gh.calls.some((c) => c[0] === 'close' && c[1] === 1));
});

// The guard: on every tick, cards left in a state no event will ever move are repaired.
const NOW = Date.parse('2026-11-04T18:00:00Z');
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();
const tick = { kind: 'tick', event: 'schedule', labels: [], fromOwner: false };
const runEvents = (labeledAgo, unlabeledAgo) => [
  { event: 'labeled', label: { name: L.running }, created_at: minutesAgo(labeledAgo) },
  ...(unlabeledAgo == null ? [] : [{ event: 'unlabeled', label: { name: L.running }, created_at: minutesAgo(unlabeledAgo) }]),
];

test('guard: an issue left open after its PR merged is closed and frees its place', async () => {
  const gh = fakeGh({
    issues: [{ number: 7, labels: [L.feature, L.building] }, { number: 8, labels: [L.feature, L.queued] }],
    prs: [{ number: 20, state: 'closed', merged_at: minutesAgo(60), body: 'Closes #7', labels: [] }],
  });
  const sent = [];
  await createRelay({ gh, repo: 'r', config: { ...config, maxParallel: 1 }, env, fetchImpl: fetchOk(sent), now: () => NOW, log: quiet }).handle(tick);
  assert.ok(gh.calls.some((c) => c[0] === 'close' && c[1] === 7));
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 7 && c[2] === L.building));
  assert.equal(payloadOf(sent[0].init.body).issue, 8); // the queue moves on
});

test('guard: merged PRs of finished cards cost no read of their issue (#211)', async () => {
  const gh = fakeGh({
    issues: [{ number: 1, open: false, labels: [L.feature] }, { number: 2, open: false, labels: [L.feature] }],
    prs: [{ number: 20, state: 'closed', merged_at: minutesAgo(60), body: 'Closes #1', labels: [] }, { number: 21, state: 'closed', merged_at: minutesAgo(90), body: 'Closes #2', labels: [] }],
  });
  const read = [];
  const getIssue = gh.getIssue;
  gh.getIssue = async (n) => { read.push(n); return getIssue(n); };
  gh.listEvents = async (n) => { read.push(`events ${n}`); return []; };
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), now: () => NOW, log: quiet }).handle(tick);
  assert.deepEqual(read.filter((x) => x === 1 || x === 2 || x === 'events 1' || x === 'events 2'), []);
});

test('guard: a PR that forgot « Closes #n » still closes the issue of its branch', async () => {
  const gh = fakeGh({
    issues: [{ number: 7, labels: [L.feature, L.building] }],
    prs: [{ number: 20, state: 'closed', merged_at: minutesAgo(60), body: 'Adds the cart', head: { ref: 'claude/issue-7-cart' }, labels: [] }],
  });
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), now: () => NOW, log: quiet }).handle(tick);
  assert.ok(gh.calls.some((c) => c[0] === 'close' && c[1] === 7));
});

test('a card whose open PR forgot « Closes #n » gives its place up all the same', async () => {
  const gh = fakeGh({
    issues: [{ number: 7, labels: [L.feature, L.building] }, { number: 8, labels: [L.feature, L.queued] }],
    prs: [{ number: 20, state: 'open', body: 'Adds the cart', head: { ref: 'claude/issue-7-cart' }, labels: [L.checks] }],
  });
  const sent = [];
  await createRelay({ gh, repo: 'r', config: { ...config, maxParallel: 1 }, env, fetchImpl: fetchOk(sent), now: () => NOW, log: quiet }).handle(tick);
  assert.equal(payloadOf(sent[0]?.init.body || '{}').issue, 8);
});

test('guard: an issue the owner reopened after the merge is left alone', async () => {
  const gh = fakeGh({
    issues: [{ number: 7, labels: [L.feature] }],
    prs: [{ number: 20, state: 'closed', merged_at: minutesAgo(60), body: 'Closes #7', labels: [] }],
    events: { 7: [{ event: 'reopened', created_at: minutesAgo(30) }] },
  });
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), now: () => NOW, log: quiet }).handle(tick);
  assert.ok(!gh.calls.some((c) => c[0] === 'close'));
});

test('guard: a PR closed without merging does not close its issue', async () => {
  const gh = fakeGh({ issues: [{ number: 7, labels: [L.feature, L.building] }], prs: [{ number: 20, state: 'closed', merged_at: null, body: 'Closes #7', labels: [] }], events: { 7: runEvents(90, 80) } });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), now: () => NOW, log: quiet }).handle(tick);
  assert.ok(!gh.calls.some((c) => c[0] === 'close'));
  assert.equal(sent.length, 0); // nor relaunches it: the owner closed that PR on purpose
});

test('guard: a build that stopped without a PR or a question is relaunched once, quietly', async () => {
  const gh = fakeGh({ issues: [{ number: 7, labels: [L.feature, L.building] }], prs: [], events: { 7: runEvents(60, 40) } });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), now: () => NOW, log: quiet }).handle(tick);
  const p = payloadOf(sent[0].init.body);
  assert.deepEqual([p.stage, p.issue, p.relaunch], ['build', 7, true]);
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 7 && c[2].includes('<!-- factory-heal -->')));
});

test('guard: a build that stopped a few minutes ago is not relaunched yet', async () => {
  const gh = fakeGh({ issues: [{ number: 7, labels: [L.feature, L.building] }], prs: [], events: { 7: runEvents(30, 10) } });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), now: () => NOW, log: quiet }).handle(tick);
  assert.equal(sent.length, 0);
});

test('guard: a build with an open PR, a block or a running agent is not relaunched', async () => {
  const gh = fakeGh({
    issues: [{ number: 7, labels: [L.feature, L.building] }, { number: 8, labels: [L.feature, L.building, L.blocked] }, { number: 9, labels: [L.bug, L.building, L.running] }],
    prs: [{ number: 20, state: 'open', body: 'Closes #7', labels: [L.checks] }],
    events: { 7: runEvents(90, 80), 8: runEvents(90, 80), 9: runEvents(30) },
  });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), now: () => NOW, log: quiet }).handle(tick);
  assert.equal(sent.length, 0);
});

test('guard: a second stop without a PR blocks the card and tells the owner once', async () => {
  const gh = fakeGh({
    issues: [{ number: 7, labels: [L.bug, L.building] }], prs: [], events: { 7: runEvents(60, 40) },
    comments: { 7: [{ body: '<!-- factory-heal -->\nrelancé' }] },
  });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), now: () => NOW, log: quiet }).handle(tick);
  assert.equal(sent.length, 0);
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 7 && c[2] === L.blocked));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 7 && /réessaie/.test(c[2])));
});

test('guard: an agent lock older than its time limit is released, and a stopped build is relaunched with its stage', async () => {
  const gh = fakeGh({ issues: [{ number: 7, labels: [L.project, L.building, L.running] }], prs: [], events: { 7: runEvents(200) } });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), now: () => NOW, log: quiet }).handle(tick);
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 7 && c[2] === L.running));
  assert.equal(payloadOf(sent[0].init.body).stage, 'foundation');
});

test('guard: a stale lock on a card that is not building is released, and messages written meanwhile are handled', async () => {
  const gh = fakeGh({
    issues: [{ number: 5, labels: [L.feature, L.grilling, L.running, L.pending] }], prs: [],
    events: { 5: runEvents(200) },
    comments: { 5: [{ user: { login: 'phoibe' }, body: 'réponse 2', created_at: minutesAgo(100) }] },
  });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), now: () => NOW, log: quiet }).handle(tick, { ownerLogin: 'phoibe' });
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 5 && c[2] === L.pending));
  assert.equal(payloadOf(sent[0].init.body).stage, 'grilling');
});

test('guard: a fresh lock is never touched', async () => {
  const gh = fakeGh({ issues: [{ number: 5, labels: [L.feature, L.grilling, L.running] }], prs: [], events: { 5: runEvents(20) } });
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), now: () => NOW, log: quiet }).handle(tick);
  assert.ok(!gh.calls.some((c) => c[0] === 'remove'));
});

test('guard: a build whose PR forgot « Closes #n » is recognised by its branch and not built twice', async () => {
  const gh = fakeGh({ issues: [{ number: 7, labels: [L.feature, L.building] }], prs: [{ number: 20, state: 'open', body: 'no link', head: { ref: 'claude/issue-7-dark' }, labels: [] }], events: { 7: runEvents(90, 80) } });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), now: () => NOW, log: quiet }).handle(tick);
  assert.equal(sent.length, 0);
});

const docsEvent = (n) => ({ kind: 'pr', event: 'pull_request', action: 'opened', number: n, labels: [], fromOwner: true, headRef: 'claude/docs-155' });

test('a documentation PR that only touches the glossary and decisions is merged', async () => {
  const gh = fakeGh({ issues: [], prs: [{ number: 8, body: 'Glossaire', state: 'open', base: { ref: 'main' }, head: { sha: 'd1' }, labels: [] }], files: { 8: [{ filename: 'GLOSSARY.md' }, { filename: 'docs/adr/0001-x.md' }] } });
  const relay = createRelay({ gh, repo: 'o/r', config, env, log: quiet });
  await relay.handle(docsEvent(8), { ownerLogin: 'o' });
  assert.ok(gh.calls.some((c) => c[0] === 'merge' && c[1] === 8));
});

test('a documentation PR that touches anything else is left alone', async () => {
  const gh = fakeGh({ issues: [], prs: [{ number: 8, body: 'Glossaire', state: 'open', base: { ref: 'main' }, head: { sha: 'd1' }, labels: [] }], files: { 8: [{ filename: 'GLOSSARY.md' }, { filename: 'src/app.js' }] } });
  const relay = createRelay({ gh, repo: 'o/r', config, env, log: quiet });
  await relay.handle(docsEvent(8), { ownerLogin: 'o' });
  assert.ok(!gh.calls.some((c) => c[0] === 'merge'));
});

test('a documentation PR with no file at all is left alone', async () => {
  const gh = fakeGh({ issues: [], prs: [{ number: 8, body: '', state: 'open', base: { ref: 'main' }, head: { sha: 'd1' }, labels: [] }], files: { 8: [] } });
  const relay = createRelay({ gh, repo: 'o/r', config, env, log: quiet });
  await relay.handle(docsEvent(8), { ownerLogin: 'o' });
  assert.ok(!gh.calls.some((c) => c[0] === 'merge'));
});

test('eventFromPayload gives the branch name of a PR', () => {
  const ev = eventFromPayload('pull_request', { action: 'opened', repository: { owner: { login: 'phoibe' } }, sender: { login: 'phoibe' }, pull_request: { number: 9, labels: [], head: { ref: 'claude/docs-155' } } });
  assert.equal(ev.headRef, 'claude/docs-155');
});

test('a documentation PR is not merged through renames, prefixed paths, other bases or forks', async () => {
  const pr = { number: 8, body: '', state: 'open', base: { ref: 'main' }, head: { sha: 'd1' }, labels: [] };
  const cases = [
    [{ ...pr }, [{ filename: 'GLOSSARY.md', status: 'renamed', previous_filename: 'src/app.js' }]],
    [{ ...pr }, [{ filename: 'src/GLOSSARY.md' }]],
    [{ ...pr }, [{ filename: '.claude/skills/x/docs/adr/y.md' }]],
    [{ ...pr, base: { ref: 'dev' } }, [{ filename: 'GLOSSARY.md' }]],
    [{ ...pr, head: { sha: 'd1', repo: { full_name: 'x/r' } } }, [{ filename: 'GLOSSARY.md' }]],
    [{ ...pr, draft: true }, [{ filename: 'GLOSSARY.md' }]],
  ];
  for (const [p, files] of cases) {
    const gh = fakeGh({ issues: [], prs: [p], files: { 8: files } });
    await createRelay({ gh, repo: 'o/r', config, env, log: quiet }).handle(docsEvent(8), { ownerLogin: 'o' });
    assert.ok(!gh.calls.some((c) => c[0] === 'merge'), JSON.stringify(files));
  }
});

// PR #162: checks green, then the report step got a GitHub 503 and died. Nothing moved the PR for half an hour.
const runsOf = (checks, report) => async () => [
  { name: 'factory / checks', status: 'completed', conclusion: checks, started_at: minutesAgo(12), completed_at: minutesAgo(10) },
  ...(report ? [{ name: 'factory / report', status: 'completed', conclusion: report, started_at: minutesAgo(10), completed_at: minutesAgo(10) }] : []),
];

test('guard: green checks whose report step died are reported again, and the PR goes live', async () => {
  const gh = fakeGh({
    issues: [{ number: 160, labels: [L.feature] }, { number: 162, labels: [L.checks], pull_request: {} }],
    prs: [{ number: 162, state: 'open', mergeable_state: 'clean', body: 'Closes #160', head: { sha: 'abc' }, labels: [L.checks] }],
    deployments: [],
  });
  gh.checkRuns = runsOf('success', 'failure');
  await createRelay({ gh, repo: 'r', config: { ...config, stages: { ...config.stages, acceptance: false } }, env, fetchImpl: fetchOk([]), now: () => NOW, log: quiet, sleep: async () => {} }).handle(tick);
  assert.ok(gh.calls.some((c) => c[0] === 'merge' && c[1] === 162));
});

test('guard: a report that ran fine, or has not run yet, is left alone', async () => {
  for (const report of ['success', null]) {
    const gh = fakeGh({
      issues: [{ number: 162, labels: [L.checks], pull_request: {} }],
      prs: [{ number: 162, state: 'open', mergeable_state: 'clean', body: '', head: { sha: 'abc' }, labels: [L.checks] }],
    });
    gh.checkRuns = runsOf('success', report);
    await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), now: () => NOW, log: quiet }).handle(tick);
    assert.ok(!gh.calls.some((c) => c[0] === 'merge'), String(report));
  }
});

test('a dropped PR is closed with its issue, and the issue gives its place back', async () => {
  const gh = fakeGh({
    issues: [{ number: 17, labels: [L.bug, L.building] }, { number: 22, labels: [L.visualReview], pull_request: {} }],
    prs: [{ number: 22, state: 'open', body: 'Closes #17', head: { sha: 'abc', ref: 'claude/issue-17-fix' }, labels: [{ name: L.visualReview }] }],
  });
  gh.closePr = async (n) => gh.calls.push(['closePr', n]);
  gh.closeIssue = async (n, reason) => gh.calls.push(['close', n, reason]);
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 22, labels: [L.visualReview], text: 'fermer', fromOwner: true });
  assert.ok(gh.calls.some((c) => c[0] === 'closePr' && c[1] === 22));
  assert.ok(gh.calls.some((c) => c[0] === 'close' && c[1] === 17 && c[2] === 'not_planned'));
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 17 && c[2] === L.building));
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 22 && c[2] === L.visualReview));
});

// yoldmewhen2 issue #31: « tu peux donc fermer cette demande », the agent was refused the close and asked the owner.
test('the agent asks with factory:close: at the end of its run the factory closes the issue and its PR', async () => {
  const gh = fakeGh({
    issues: [{ number: 31, labels: [L.feature, L.grilling, L.close] }],
    prs: [{ number: 40, state: 'open', body: 'Closes #31', head: { sha: 'a', ref: 'claude/issue-31-x' }, labels: [] }],
  });
  gh.closePr = async (n) => gh.calls.push(['closePr', n]);
  gh.closeIssue = async (n, reason) => gh.calls.push(['close', n, reason]);
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle({ kind: 'issue', event: 'issues', action: 'unlabeled', removedLabel: L.running, number: 31, labels: [L.feature, L.grilling, L.close], fromOwner: true });
  assert.ok(gh.calls.some((c) => c[0] === 'close' && c[1] === 31 && c[2] === 'not_planned'));
  assert.ok(gh.calls.some((c) => c[0] === 'closePr' && c[1] === 40));
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 31 && c[2] === L.grilling));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 31 && /fermée/.test(c[2])));
});

// Issue #203: the agent closes a request it finds already done, a duplicate or obsolete, with no confirmation.
const withReopen = (gh, state) => {
  gh.closePr = async (n) => { gh.calls.push(['closePr', n]); const p = state.prs.find((x) => x.number === n); if (p) p.state = 'closed'; };
  gh.closeIssue = async (n, reason) => { gh.calls.push(['close', n, reason]); const i = state.issues.find((x) => x.number === n); if (i) i.open = false; };
  gh.updateIssue = async (n, fields) => { gh.calls.push(['update', n, fields]); Object.assign(state.issues.find((x) => x.number === n), fields); };
  gh.reopenIssue = async (n) => { gh.calls.push(['reopen', n]); state.issues.find((x) => x.number === n).open = true; };
  gh.reopenPr = async (n) => { gh.calls.push(['reopenPr', n]); state.prs.find((x) => x.number === n).state = 'open'; };
  return gh;
};
const agentDone = (n, labels) => ({ kind: 'issue', event: 'issues', action: 'unlabeled', removedLabel: L.running, number: n, labels, fromOwner: true });
const ownerSays = (n, labels, text = "non, ce n'est pas réglé") => ({ kind: 'issue', event: 'issue_comment', action: 'created', number: n, labels, text, fromOwner: true, fromAgent: false });

test('agent close with a reason: issue and PR closed, no factory message, reason kept, state saved', async () => {
  const state = {
    issues: [{ number: 31, body: 'Idée', labels: [L.feature, L.building, L.close, L.alreadyDone] }],
    prs: [{ number: 40, state: 'open', body: 'Closes #31', head: { sha: 'a', ref: 'claude/issue-31-x' }, labels: [] }],
  };
  const gh = withReopen(fakeGh(state), state);
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle(agentDone(31, state.issues[0].labels));
  assert.ok(gh.calls.some((c) => c[0] === 'close' && c[1] === 31 && c[2] === 'completed'));
  assert.ok(gh.calls.some((c) => c[0] === 'closePr' && c[1] === 40));
  assert.ok(!gh.calls.some((c) => c[0] === 'comment' && c[1] === 31), 'the agent\'s message is the only one');
  assert.ok(state.issues[0].labels.includes(L.alreadyDone));
  assert.ok(!state.issues[0].labels.includes(L.close) && !state.issues[0].labels.includes(L.building));
  assert.match(state.issues[0].body, /^Idée\n\n<!-- factory-reopen \{"labels":\["factory:building"\],"prs":\[\{"n":40,"labels":\[\]\}\]\} -->$/);
});

test('agent close: duplicate and obsolete get their GitHub close reason', async () => {
  for (const [reason, why] of [[L.duplicate, 'duplicate'], [L.obsolete, 'not_planned']]) {
    const state = { issues: [{ number: 5, body: '', labels: [L.bug, L.grilling, L.close, reason] }], prs: [] };
    const gh = withReopen(fakeGh(state), state);
    await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle(agentDone(5, state.issues[0].labels));
    assert.ok(gh.calls.some((c) => c[0] === 'close' && c[1] === 5 && c[2] === why), reason);
  }
});

test('agent close: a reason put on the PR is copied to the request', async () => {
  const state = {
    issues: [{ number: 31, body: '', labels: [L.feature, L.building] }, { number: 40, labels: [L.close, L.obsolete], pull_request: {} }],
    prs: [{ number: 40, state: 'open', body: 'Closes #31', head: { sha: 'a', ref: 'claude/issue-31-x' }, labels: [] }],
  };
  const gh = withReopen(fakeGh(state), state);
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle({ ...agentDone(40, [L.close, L.obsolete]), kind: 'pr' });
  assert.ok(state.issues[0].labels.includes(L.obsolete));
  assert.ok(gh.calls.some((c) => c[0] === 'close' && c[1] === 31 && c[2] === 'not_planned'));
  assert.ok(!gh.calls.some((c) => c[0] === 'comment'));
});

test('agent close: never on a project framing or a general review', async () => {
  for (const kind of [L.project, L.audit]) {
    const state = { issues: [{ number: 8, body: '', labels: [kind, L.building, L.close, L.obsolete] }], prs: [] };
    const gh = withReopen(fakeGh(state), state);
    await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle(agentDone(8, state.issues[0].labels));
    assert.ok(!gh.calls.some((c) => c[0] === 'close'), kind);
    assert.ok(!state.issues[0].labels.includes(L.close) && !state.issues[0].labels.includes(L.obsolete), kind);
  }
});

test('an owner message in an agent-closed request reopens it with its PR and resumes it', async () => {
  const state = {
    issues: [{ number: 31, open: false, body: 'Idée\n\n<!-- factory-reopen {"labels":["factory:building"],"prs":[{"n":40,"labels":[]}]} -->', labels: [L.feature, L.alreadyDone] }],
    prs: [{ number: 40, state: 'closed', body: 'Closes #31', head: { sha: 'a', ref: 'claude/issue-31-x' }, labels: [] }],
  };
  const gh = withReopen(fakeGh(state), state);
  const sent = [];
  const { action } = await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).handle(ownerSays(31, [L.feature, L.alreadyDone]));
  assert.equal(action.stage, 'resume');
  assert.ok(gh.calls.some((c) => c[0] === 'reopen' && c[1] === 31));
  assert.ok(gh.calls.some((c) => c[0] === 'reopenPr' && c[1] === 40));
  assert.equal(state.issues[0].body, 'Idée');
  assert.ok(!state.issues[0].labels.includes(L.alreadyDone));
  assert.ok(state.issues[0].labels.includes(L.building) && !state.issues[0].labels.includes(L.blocked));
  assert.equal(payloadOf(sent[0].init.body).stage, 'resume');
  assert.ok(!gh.calls.some((c) => c[0] === 'comment' && /déjà terminée/.test(c[2])));
});

test('a reopened building request waits in the queue when the factory is full', async () => {
  const state = {
    issues: [{ number: 31, open: false, body: '<!-- factory-reopen {"labels":["factory:building"],"prs":[]} -->', labels: [L.feature, L.obsolete] },
      { number: 1, labels: [L.feature, L.building] }, { number: 2, labels: [L.feature, L.building] }],
    prs: [],
  };
  const gh = withReopen(fakeGh(state), state);
  const sent = [];
  const { action } = await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).handle(ownerSays(31, [L.feature, L.obsolete]));
  assert.equal(action.type, 'queue');
  assert.ok(state.issues[0].labels.includes(L.queued) && state.issues[0].labels.includes(L.resumeQueued));
  assert.ok(!sent.some((s) => payloadOf(s.init.body).issue === 31));
});

test('an agent-closed request without a saved step reopens and starts like a new one', async () => {
  const state = { issues: [{ number: 9, open: false, body: null, labels: [L.feature, L.duplicate] }], prs: [] };
  const gh = withReopen(fakeGh(state), state);
  const { action } = await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle(ownerSays(9, [L.feature, L.duplicate]));
  assert.equal(action.stage, 'grilling');
  assert.ok(!state.issues[0].labels.includes(L.blocked));
  assert.ok(gh.calls.some((c) => c[0] === 'reopen' && c[1] === 9));
});

test('a message the owner wrote during the run stops the agent closing by itself', async () => {
  const state = { issues: [{ number: 31, body: '', labels: [L.feature, L.building, L.close, L.duplicate, L.pending] }], prs: [] };
  state.comments = { 31: [{ id: 1, body: "attendez, ce n'est pas la même chose", user: { login: 'phoibe' }, created_at: '2026-11-06T10:00:00Z' }] };
  const gh = withReopen(fakeGh(state), state);
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).handle(agentDone(31, state.issues[0].labels), { ownerLogin: 'phoibe' });
  assert.ok(!gh.calls.some((c) => c[0] === 'close'));
  assert.ok(!state.issues[0].labels.includes(L.close) && !state.issues[0].labels.includes(L.duplicate));
  assert.equal(payloadOf(sent[0].init.body).stage, 'feedback');
});

test('a PR waiting for the owner comes back at its step, and loses the reason label meanwhile', async () => {
  const state = {
    issues: [{ number: 31, body: '', labels: [L.feature, L.building, L.close, L.obsolete] }, { number: 40, labels: [L.visualReview, L.obsolete], pull_request: {} }],
    prs: [{ number: 40, state: 'open', body: 'Closes #31', head: { sha: 'a', ref: 'claude/issue-31-x' }, labels: [] }],
  };
  const gh = withReopen(fakeGh(state), state);
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet });
  await relay.handle(agentDone(31, state.issues[0].labels));
  assert.deepEqual(state.issues[1].labels, []);
  await relay.handle(ownerSays(31, state.issues[0].labels));
  assert.ok(state.issues[1].labels.includes(L.visualReview));
});

test('a request reopened with the GitHub button is cleaned up, then « fermer » says it is done', async () => {
  const state = { issues: [{ number: 31, body: 'x\n\n<!-- factory-reopen {"labels":["factory:grilling"],"prs":[]} -->', labels: [L.feature, L.obsolete] }], prs: [] };
  const gh = withReopen(fakeGh(state), state);
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet });
  await relay.handle({ kind: 'issue', event: 'issues', action: 'reopened', number: 31, labels: state.issues[0].labels, fromOwner: true });
  assert.ok(!state.issues[0].labels.includes(L.obsolete) && state.issues[0].labels.includes(L.grilling));
  assert.equal(state.issues[0].body, 'x');
  await relay.handle(ownerSays(31, state.issues[0].labels, 'fermer'));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && /C'est fait/.test(c[2])));
});

test('a request closed while queued comes back to building, not twice in the queue', async () => {
  const state = { issues: [{ number: 31, open: false, body: '<!-- factory-reopen {"labels":["factory:queued"],"prs":[]} -->', labels: [L.feature, L.duplicate] }], prs: [] };
  const gh = withReopen(fakeGh(state), state);
  const { action } = await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle(ownerSays(31, [L.feature, L.duplicate]));
  assert.equal(action.stage, 'resume');
  assert.ok(!state.issues[0].labels.includes(L.queued) && state.issues[0].labels.includes(L.building));
});

test('a refused self-close on a project tells the owner the request stays open', async () => {
  const state = { issues: [{ number: 8, body: '', labels: [L.project, L.building, L.close, L.obsolete] }], prs: [] };
  const gh = withReopen(fakeGh(state), state);
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle(agentDone(8, state.issues[0].labels));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 8 && /reste ouverte/.test(c[2])));
});

test('the project workflow listens to reopened issues (GitHub reopen button)', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../.github/workflows/factory.yml', import.meta.url), 'utf8'), /issues:\s*\n\s*types: \[[^\]]*\breopened\b/);
});

test('a PR closed during its checks comes back with the resumed run, which restarts its checks', async () => {
  const state = {
    issues: [{ number: 31, open: false, body: '<!-- factory-reopen {"labels":["factory:building"],"prs":[{"n":40,"labels":[]}]} -->', labels: [L.feature, L.obsolete] }, { number: 40, labels: [], pull_request: {} }],
    prs: [{ number: 40, state: 'closed', body: 'Closes #31', head: { sha: 'a', ref: 'claude/issue-31-x' }, labels: [] }],
  };
  const gh = withReopen(fakeGh(state), state);
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).handle(ownerSays(31, [L.feature, L.obsolete]));
  assert.deepEqual(payloadOf(sent[0].init.body), { repo: 'r', issue: 31, pr: 40, stage: 'resume', factory: 'phoibe/factory' });
});

test('guard: a self-close left for the tick still lets a message written meanwhile win', async () => {
  const state = { issues: [{ number: 31, body: '', labels: [L.feature, L.building, L.close, L.obsolete, L.pending] }], prs: [] };
  state.comments = { 31: [{ id: 1, body: 'non attendez', user: { login: 'phoibe' }, created_at: '2026-11-06T10:00:00Z' }] };
  const gh = withReopen(fakeGh(state), state);
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), now: () => NOW, log: quiet }).handle(tick, { ownerLogin: 'phoibe' });
  assert.ok(!gh.calls.some((c) => c[0] === 'close' && c[1] === 31));
  assert.ok(!state.issues[0].labels.includes(L.close) && !state.issues[0].labels.includes(L.obsolete));
});

test('a self-close asked on the PR does not lose a message the owner wrote on the request', async () => {
  const state = {
    issues: [{ number: 31, body: '', labels: [L.feature, L.building, L.pending] }, { number: 40, labels: [L.close, L.obsolete], pull_request: {} }],
    prs: [{ number: 40, state: 'open', body: 'Closes #31', head: { sha: 'a', ref: 'claude/issue-31-x' }, labels: [] }],
  };
  state.comments = { 31: [{ id: 1, body: 'non attendez', user: { login: 'phoibe' }, created_at: '2026-11-06T10:00:00Z' }] };
  const gh = withReopen(fakeGh(state), state);
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle({ ...agentDone(40, [L.close, L.obsolete]), kind: 'pr' }, { ownerLogin: 'phoibe' });
  assert.ok(!gh.calls.some((c) => c[0] === 'close' || c[0] === 'closePr'));
  assert.ok(!state.issues[1].labels.includes(L.close));
});

test('a message in a request closed the usual way still says it is finished', async () => {
  const state = { issues: [{ number: 9, open: false, body: '', labels: [L.feature] }], prs: [] };
  const gh = withReopen(fakeGh(state), state);
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle(ownerSays(9, [L.feature], 'encore une chose'));
  assert.ok(!gh.calls.some((c) => c[0] === 'reopen'));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && /déjà terminée/.test(c[2])));
});

test('guard: a card left with factory:close is closed on the next tick', async () => {
  const gh = fakeGh({ issues: [{ number: 31, labels: [L.feature, L.close] }], prs: [] });
  gh.closeIssue = async (n, reason) => gh.calls.push(['close', n, reason]);
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), now: () => NOW, log: quiet }).handle(tick);
  assert.ok(gh.calls.some((c) => c[0] === 'close' && c[1] === 31));
});

// yoldmewhen2 #37: the factory:close rule was live in the relay, but the project's agent still read week-old instructions.
test('guard: a project whose agent instructions are behind the factory gets synced on the tick', async () => {
  const { syncFingerprint } = await import('../scripts/lib/fingerprint.mjs');
  const mine = syncFingerprint(new URL('..', import.meta.url).pathname);
  const content = (fp) => ({ content: Buffer.from(JSON.stringify({ fingerprint: fp })).toString('base64') });
  for (const [fp, dispatched] of [['old', true], [null, true], [mine, false]]) {
    const gh = fakeGh({ issues: [], prs: [] });
    gh.getContent = async () => (fp ? content(fp) : null);
    await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), now: () => NOW, log: quiet }).handle(tick);
    assert.equal(gh.calls.some((c) => c[0] === 'dispatch' && c[1] === 'factory-sync.yml'), dispatched, String(fp));
  }
});

// ---- ideas, live site ----
test('autoPick leaves the ideas the agent proposed for the owner to sort, but takes the ones he kept', async () => {
  const idea = { ...fi(1, L.feature), body: `${AGENT_MARKER}\nRepéré pendant la review` };
  const kept = { ...fi(2, L.feature, L.kept), body: `${AGENT_MARKER}\nFeature de la fiche` };
  const { started } = await runPick([idea, kept], { ...pickConfig, maxParallel: 3, maxQuestions: 3 });
  assert.deepEqual(started.map((p) => p.issue), [2]);
});

test('dispatched checks: the preview and live-site checks become job outputs, a factory PR gets its checks', async () => {
  const repository = { owner: { login: 'phoibe' } };
  const pv = eventFromPayload('workflow_dispatch', { inputs: { payload: JSON.stringify({ previewCheck: { pr: 4, sha: 's', url: 'https://p' } }) }, repository });
  assert.equal(pv.kind, 'preview-check');
  const live = eventFromPayload('workflow_dispatch', { inputs: { payload: JSON.stringify({ prodCheck: { pr: 4, sha: 's' } }) }, repository });
  assert.equal(live.kind, 'prod-check');
  const ck = eventFromPayload('workflow_dispatch', { inputs: { payload: JSON.stringify({ checksFor: 9 }) }, repository });
  assert.deepEqual([ck.kind, ck.event, ck.addedLabel, ck.number, ck.fromOwner], ['pr', 'pull_request', L.checks, 9, true]);
  const gh = fakeGh({ issues: [], prs: [] });
  const relay = createRelay({ gh, repo: 'r', config, env, log: quiet });
  const { outputs } = await relay.handle(pv);
  assert.deepEqual(JSON.parse(outputs.preview), { pr: 4, sha: 's', url: 'https://p' });
  assert.equal(gh.calls.length, 0);
});

test('after a merge, the live site is checked once the host deploys it (only for a deployed project)', async () => {
  const mk = (deployments) => fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' }, merge_commit_sha: 'm1' }], deployments });
  const gh = mk([{ id: 1, environment: 'Production' }]);
  await createRelay({ gh, repo: 'r', config, env, log: quiet, sleep: async () => {} }).report({ result: 'success', pr: 10, preview: { result: 'passed', url: 'u' } });
  await createRelay({ gh, repo: 'r', config, env, log: quiet, sleep: async () => {} }).handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [L.acceptance], text: 'ok', fromOwner: true });
  const d = gh.calls.filter((c) => c[0] === 'dispatch' && c[3]?.payload).map((c) => JSON.parse(c[3].payload));
  assert.deepEqual(d.at(-1), { prodCheck: { pr: 10, sha: 'm1' } });
  const none = mk([{ id: 1, environment: 'Preview' }]);
  await createRelay({ gh: none, repo: 'r', config, env, log: quiet }).handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [L.acceptance], text: 'ok', fromOwner: true });
  assert.ok(!none.calls.some((c) => c[0] === 'dispatch' && /prodCheck/.test(c[3]?.payload || '')));
});

test('a broken live site: the delivery is undone at once, and an urgent bug redoes it once the undo is live', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature] , open: false }], prs: [{ number: 10, title: 'Créneaux communs', body: 'Closes #1', head: { sha: 'abc', ref: 'claude/issue-1-x' } }] });
  const created = [];
  gh.createIssue = async (title, body, labels) => { const i = { number: 20, title, body, labels: [...labels] }; gh.calls.push(['createIssue', title, body, labels]); created.push(i); return i; };
  gh.createPr = async (title, head, base, body) => { gh.calls.push(['createPr', title, head, base, body]); return { number: 21 }; };
  const git = [];
  const relay = createRelay({ gh, repo: 'r', config, env, log: quiet });
  await relay.prodReport({ pr: 10, sha: 'm1', url: 'https://app.example', result: 'failed', detail: '/ : la page est vide', runId: 5, git: (a) => git.push(a.join(' ')) });
  assert.ok(git.some((g) => g.endsWith('revert --no-edit m1')));
  assert.ok(git.some((g) => g === 'push --force origin HEAD:refs/heads/claude/revert-pr-10'));
  const [, , bugBody, bugLabels] = gh.calls.find((c) => c[0] === 'createIssue');
  assert.ok(bugBody.includes(PROD_BUG_MARKER) && !bugBody.includes(AGENT_MARKER));
  assert.deepEqual(bugLabels, [L.bug, L.urgent, L.kept, L.noPick]);
  const prBody = gh.calls.find((c) => c[0] === 'createPr')[4];
  assert.ok(prBody.includes(REVERT_MARKER) && prBody.includes('<!-- factory-revert-redo #20 -->'));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 21 && c[2] === L.checks));
  assert.deepEqual(JSON.parse(gh.calls.find((c) => c[0] === 'dispatch')[3].payload), { checksFor: 21 });
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 10 && /la page est vide/.test(c[2])));
  assert.equal(created.length, 1);
});

test('an undo goes live on green checks without recette, then the redo bug starts', async () => {
  const gh = fakeGh({ issues: [{ number: 20, labels: [L.bug, L.urgent, L.kept, L.noPick], body: PROD_BUG_MARKER }], prs: [{ number: 21, body: `${REVERT_MARKER}\n<!-- factory-revert-redo #20 -->`, head: { sha: 'r1' } }], files: { 21: [{ filename: 'src/App.tsx' }] } });
  gh.getContent = async () => null;
  const sent = [];
  await createRelay({ gh, repo: 'r', config: { ...config, stages: { ...config.stages, screenshots: true } }, env, fetchImpl: fetchOk(sent), log: quiet, sleep: async () => {} }).report({ result: 'success', pr: 21 });
  assert.ok(gh.calls.some((c) => c[0] === 'merge' && c[1] === 21));
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 20 && c[2] === L.noPick));
  assert.deepEqual(sent.map((s) => [payloadOf(s.init.body).issue, payloadOf(s.init.body).stage]), [[20, 'bugfix']]);
});

test('an undo is never undone: a live site still broken after it is only reported', async () => {
  const gh = fakeGh({ issues: [], prs: [{ number: 21, body: REVERT_MARKER, head: { sha: 'r1' } }] });
  const git = [];
  await createRelay({ gh, repo: 'r', config, env, log: quiet }).prodReport({ pr: 21, sha: 'm2', result: 'failed', detail: 'erreur 500', git: (a) => git.push(a) });
  assert.equal(git.length, 0);
  assert.match(gh.calls.find((c) => c[0] === 'comment')[2], /ne retire rien d'autre/);
});

// GitHub's « too many requests » (#211): a run stopped by it is marked by a failing step, re-run at the next tick.
test('the tick re-runs a run stopped by GitHub\'s rate limit, so its event is not lost', async () => {
  const { RATE_LIMIT_STEP } = await import('../scripts/relay.mjs');
  const gh = fakeGh({ issues: [], prs: [] });
  const recent = new Date().toISOString();
  const old = new Date(Date.now() - 26 * 3600_000).toISOString();
  const runs = [
    { id: 1, run_attempt: 1, created_at: recent }, // rate limited: re-run
    { id: 2, run_attempt: 1, created_at: recent }, // a real error: reported as today, not re-run
    { id: 3, run_attempt: 3, created_at: recent }, // already re-run twice: given up
    { id: 4, run_attempt: 1, created_at: old }, // too old
    { id: 5, run_attempt: 1, created_at: recent }, // a lost report: the reportLost guard makes it again, not a re-run
  ];
  const jobs = {
    1: [{ steps: [{ name: 'relay', conclusion: 'success' }, { name: RATE_LIMIT_STEP, conclusion: 'failure' }] }],
    2: [{ steps: [{ name: 'relay', conclusion: 'failure' }, { name: RATE_LIMIT_STEP, conclusion: 'skipped' }] }],
    3: [{ steps: [{ name: RATE_LIMIT_STEP, conclusion: 'failure' }] }],
    4: [{ steps: [{ name: RATE_LIMIT_STEP, conclusion: 'failure' }] }],
    5: [{ name: 'relay / report', steps: [{ name: RATE_LIMIT_STEP, conclusion: 'failure' }] }],
  };
  Object.assign(gh, {
    failedRuns: async () => runs,
    runJobs: async (id) => jobs[id],
    rerunFailed: async (id) => gh.calls.push(['rerun', id]),
  });
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet });
  await relay.handle({ kind: 'tick', event: 'schedule', labels: [], fromOwner: false });
  assert.deepEqual(gh.calls.filter((c) => c[0] === 'rerun'), [['rerun', 1]]);
});

test('only the relay commands whose workflow step marks the run exit quietly on the rate limit; the others still fail', async () => {
  const { rateLimitHandled, RATE_LIMIT_STEP } = await import('../scripts/relay.mjs');
  const { readFileSync } = await import('node:fs');
  assert.deepEqual(['decide', 'release', 'report', 'preview-report', 'prod-report', 'live-url'].map(rateLimitHandled), [true, true, true, false, false, false]);
  const yml = readFileSync(new URL('../.github/workflows/relay.yml', import.meta.url), 'utf8');
  for (const cmd of ['decide', 'release', 'report']) {
    const call = 'node .factory-src/scripts/relay.mjs';
    const at = yml.indexOf(`${call} ${cmd}`);
    const step = yml.indexOf(RATE_LIMIT_STEP, at);
    const next = yml.indexOf(call, at + call.length);
    assert.ok(at > 0 && step > at && (next < 0 || next > step), cmd);
  }
});

test('a failed run that did not move lately costs no read of its jobs at each tick', async () => {
  const gh = fakeGh({ issues: [], prs: [] });
  const reads = [];
  Object.assign(gh, {
    failedRuns: async () => [{ id: 9, run_attempt: 1, created_at: new Date(Date.now() - 5 * 3600_000).toISOString(), updated_at: new Date(Date.now() - 4 * 3600_000).toISOString() }],
    runJobs: async (id) => { reads.push(id); return []; },
    rerunFailed: async () => {},
  });
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle({ kind: 'tick', event: 'schedule', labels: [], fromOwner: false });
  assert.deepEqual(reads, []);
});

test('a tick stopped by the rate limit is not re-run: the next tick does the same work', async () => {
  const { RATE_LIMIT_STEP } = await import('../scripts/relay.mjs');
  const gh = fakeGh({ issues: [], prs: [] });
  const recent = new Date().toISOString();
  Object.assign(gh, {
    failedRuns: async () => [{ id: 1, event: 'schedule', run_attempt: 1, created_at: recent, updated_at: recent }, { id: 2, event: 'issue_comment', run_attempt: 1, created_at: recent, updated_at: new Date(Date.now() - 1.5 * 3600_000).toISOString() }],
    runJobs: async () => [{ steps: [{ name: RATE_LIMIT_STEP, conclusion: 'failure' }] }],
    rerunFailed: async (id) => gh.calls.push(['rerun', id]),
  });
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle({ kind: 'tick', event: 'schedule', labels: [], fromOwner: false });
  // The event run is still taken up 1 h 30 after it stopped: a primary limit can last an hour, and ticks run late.
  assert.deepEqual(gh.calls.filter((c) => c[0] === 'rerun'), [['rerun', 2]]);
});

// ---- passing outages (issue #213) ----
const { readOutage, writeOutage, OUTAGE_TOLD } = await import('../scripts/lib/outage.mjs');
const outagePr = (marker, labels = [L.checks]) => ({ number: 10, body: writeOutage('Closes #1', marker), head: { sha: 'abc' }, labels, state: 'open' });
function outageWorld(marker, { prLabels, issueLabels = [L.feature, L.building] } = {}) {
  const state = { issues: [{ number: 1, labels: issueLabels }], prs: [outagePr(marker, prLabels)], comments: { 10: [] } };
  const gh = fakeGh(state);
  gh.updateIssue = async (n, fields) => { gh.calls.push(['update', n, fields]); Object.assign(state.prs.find((p) => p.number === n) || {}, fields); };
  return { state, gh, pr: state.prs[0] };
}
const T = Date.parse('2026-11-06T10:00:00Z');

test('outage: checks failing on the network are retried silently in about 2 minutes, no fix, no attempt counted', async () => {
  const { gh, pr } = outageWorld(null);
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  await relay.report({ result: 'failure', transient: true, pr: 10, sha: 'abc', now: T });
  assert.equal(sent.length, 0);
  assert.ok(!gh.calls.some((c) => c[0] === 'comment'));
  assert.ok(!gh.calls.some((c) => c[0] === 'remove' && c[2] === L.checks));
  assert.equal(relay.outputs.retryInMs, 120_000);
  assert.deepEqual([readOutage(pr.body).tries, readOutage(pr.body).since], [1, T]);
});

test('outage: the second retry is left to the tick, about 10 minutes later', async () => {
  const { gh, pr } = outageWorld({ sha: 'abc', since: T, tries: 1 });
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet });
  await relay.report({ result: 'failure', transient: true, pr: 10, sha: 'abc', now: T + 5 * 60_000 });
  assert.equal(readOutage(pr.body).next, T + 15 * 60_000);
  assert.equal(relay.outputs.retryInMs, undefined);
  assert.ok(!gh.calls.some((c) => c[0] === 'comment'));
});

test('outage: still down after both retries, the owner reads one sentence and the agent does not start', async () => {
  const { gh, pr } = outageWorld({ sha: 'abc', since: T, tries: 2 });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).report({ result: 'failure', transient: true, pr: 10, sha: 'abc', now: T + 20 * 60_000 });
  const said = gh.calls.filter((c) => c[0] === 'comment');
  assert.equal(said.length, 1);
  assert.equal(said[0][1], 10);
  assert.ok(said[0][2].includes(OUTAGE_TOLD));
  assert.ok(!said[0][2].includes(CHECKS_FAILED_MARKER));
  assert.equal(sent.length, 0);
  assert.equal(readOutage(pr.body).next, T + 50 * 60_000);
  gh.calls.length = 0;
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).report({ result: 'failure', transient: true, pr: 10, sha: 'abc', now: T + 55 * 60_000 });
  assert.ok(!gh.calls.some((c) => c[0] === 'comment'), 'said once');
});

test('outage: after 3 hours the card is blocked, and the owner may answer « réessaie »', async () => {
  const { gh, pr } = outageWorld({ sha: 'abc', since: T, tries: 7, told: true });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).report({ result: 'failure', transient: true, pr: 10, sha: 'abc', now: T + 3 * 3_600_000 });
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 10 && c[2] === L.checks));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 1 && c[2] === L.blocked));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[1] === 1 && /réessaie/.test(c[2]) && /3 heures/.test(c[2])));
  assert.equal(readOutage(pr.body).blocked, true);
  assert.equal(sent.length, 0);
});

test('outage: a real test failure still goes to the agent, and the outage is forgotten', async () => {
  const { gh, pr } = outageWorld({ sha: 'abc', since: T, tries: 2, told: true });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).report({ result: 'failure', pr: 10, sha: 'abc', now: T + 30 * 60_000 });
  assert.equal(payloadOf(sent[0].init.body).stage, 'fix-checks');
  assert.equal(readOutage(pr.body), null);
  assert.equal(pr.body, 'Closes #1');
});

test('outage: the tick starts a due retry once, never one that is not due or while an agent works', async () => {
  for (const [marker, labels, due] of [
    [{ sha: 'abc', since: T, tries: 1, next: T + 10 * 60_000 }, [L.checks], true],
    [{ sha: 'abc', since: T, tries: 1, next: T + 30 * 60_000 }, [L.checks], false],
    [{ sha: 'abc', since: T, tries: 1, next: T + 10 * 60_000 }, [L.checks, L.running], false],
    [{ sha: 'abc', since: T, tries: 3, next: T, blocked: true }, [], false],
  ]) {
    const { gh, pr } = outageWorld(marker, { prLabels: labels });
    await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), now: () => T + 12 * 60_000, log: quiet }).handle(tick);
    const retries = gh.calls.filter((c) => c[0] === 'dispatch' && c[1] === 'factory.yml' && JSON.parse(c[3].payload).checksFor === 10);
    assert.equal(retries.length, due ? 1 : 0, JSON.stringify(marker));
    if (due) assert.deepEqual([readOutage(pr.body).tries, readOutage(pr.body).next > T + 12 * 60_000], [2, true]);
  }
});

test('outage: « réessaie » on the blocked card relaunches the checks, not the agent', async () => {
  const { gh, pr } = outageWorld({ sha: 'abc', since: T, tries: 7, told: true, blocked: true }, { prLabels: [], issueLabels: [L.feature, L.building, L.blocked] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  const { action } = await relay.handle(ownerSays(1, [L.feature, L.building, L.blocked], 'Réessaie'));
  assert.equal(action.type, 'outage-retry');
  assert.equal(sent.length, 0);
  assert.deepEqual([relay.outputs.checks, relay.outputs.pr], ['true', '10']);
  assert.ok(gh.calls.some((c) => c[0] === 'remove' && c[1] === 1 && c[2] === L.blocked));
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 10 && c[2] === L.checks));
  assert.equal(readOutage(pr.body), null);
});

test('outage: « réessaie » on a card blocked for another reason resumes the agent as before', async () => {
  const { gh } = outageWorld(null, { prLabels: [], issueLabels: [L.feature, L.building, L.blocked] });
  const sent = [];
  const { action } = await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).handle(ownerSays(1, [L.feature, L.building, L.blocked], 'réessaie'));
  assert.equal(action.stage, 'resume');
  assert.equal(sent.length, 1);
});

test('sync: an update that does not go through is retried after 5 min, 30 min, 2 h, then daily, with one alert after a day', async () => {
  const content = { content: Buffer.from(JSON.stringify({ fingerprint: 'old' })).toString('base64') };
  const stored = {};
  const gh = fakeGh({ issues: [], prs: [] });
  gh.getContent = async () => content;
  gh.getState = async (name) => stored[name] || null;
  gh.setState = async (name, value) => { if (value) stored[name] = value; else delete stored[name]; };
  const sent = [];
  let t = T;
  const at = async (ms) => {
    t = T + ms;
    gh.calls.length = 0;
    await createRelay({ gh, repo: 'phoibe/mon-appli', config, env: { ...env, NTFY_TOPIC: 'topic' }, fetchImpl: fetchOk(sent), now: () => t, log: quiet }).handle(tick);
    return gh.calls.some((c) => c[0] === 'dispatch' && c[1] === 'factory-sync.yml');
  };
  const M = 60_000;
  const H = 60 * M;
  assert.equal(await at(0), true);
  assert.equal(await at(4 * M), false);
  assert.equal(await at(5 * M), true);
  assert.equal(await at(30 * M), false);
  assert.equal(await at(35 * M), true);
  assert.equal(await at(2 * H + 30 * M), false);
  assert.equal(await at(2 * H + 35 * M), true);
  assert.equal(await at(20 * H), false);
  const alerts = () => sent.filter((s) => s.url === 'https://ntfy.sh');
  assert.equal(alerts().length, 0);
  await at(24 * H);
  assert.equal(alerts().length, 1);
  assert.match(JSON.parse(alerts()[0].init.body).message, /La mise à jour du projet mon-appli ne passe pas depuis hier/);
  assert.equal(await at(26 * H + 35 * M), true);
  assert.equal(await at(27 * H), false);
  assert.equal(alerts().length, 1, 'one alert only');
  content.content = Buffer.from(JSON.stringify({ fingerprint: (await import('../scripts/lib/fingerprint.mjs')).syncFingerprint(new URL('..', import.meta.url).pathname) })).toString('base64');
  assert.equal(await at(28 * H), false);
  assert.equal(stored.sync, undefined, 'success starts again from zero');
});

// Issue #212: waiting minutes for a preview under the queue lock blocked every other decision and made the lock look dead.
test('a late preview never makes the report wait under the queue lock', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' } }] });
  gh.deploymentStatuses = async () => [{ state: 'pending' }];
  const sleep = async () => { throw new Error('the report waited under the lock'); };
  await createRelay({ gh, repo: 'r', config, env, log: quiet, sleep }).report({ result: 'success', pr: 10, sha: 'abc' });
  const d = gh.calls.find((c) => c[0] === 'dispatch');
  assert.deepEqual(JSON.parse(d[3].payload), { previewCheck: { pr: 10, sha: 'abc' } });
  assert.ok(!gh.calls.some((c) => c[0] === 'add' && c[2] === L.acceptance), 'no recette before the preview was opened');
});

test('the preview job waits for a late preview, outside the lock, then the recette gets its link without waiting', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' } }] });
  let polls = 0;
  gh.deploymentStatuses = async () => (++polls < 4 ? [{ state: 'pending' }] : [{ state: 'success', environment_url: 'https://late.example' }]);
  let waited = 0;
  const relay = createRelay({ gh, repo: 'r', config, env, log: quiet, sleep: async () => { waited++; } });
  assert.equal(await relay.previewWait({ pr: 10, sha: 'abc' }), 'https://late.example');
  assert.ok(waited >= 3);
  assert.equal(await relay.previewWait({ pr: 10, sha: 'abc', url: 'https://known.example' }), 'https://known.example');
  waited = 0;
  await relay.report({ result: 'success', pr: 10, sha: 'abc', preview: { result: 'passed', url: 'https://late.example' } });
  assert.equal(waited, 0);
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[2].includes('https://late.example')));
});

test('outage: the first retry, started after the lock, never fails the report job when GitHub is still down', async () => {
  const { gh } = outageWorld(null);
  gh.dispatch = async () => { throw new Error('POST dispatches -> 503'); };
  const waited = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet, sleep: async (ms) => waited.push(ms) });
  await relay.report({ result: 'failure', transient: true, pr: 10, sha: 'abc', now: T });
  await relay.retrySoon(10); // must not throw: the tick starts it again later
  assert.deepEqual(waited, [120_000]);
  const ok = outageWorld(null);
  const r2 = createRelay({ gh: ok.gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet, sleep: async () => {} });
  await r2.report({ result: 'failure', transient: true, pr: 10, sha: 'abc', now: T });
  await r2.retrySoon(10);
  assert.ok(ok.gh.calls.some((c) => c[0] === 'dispatch' && JSON.parse(c[3].payload).checksFor === 10));
});

test('outage: a lost report of checks that failed on an outage is made again as an outage, not as a code failure', async () => {
  const { gh, pr, state } = outageWorld({ sha: 'abc', since: T, tries: 1, next: null });
  state.issues.push({ number: 10, labels: [L.checks], pull_request: {} });
  gh.checkRuns = async () => [
    { name: 'factory / checks', status: 'completed', conclusion: 'failure', started_at: '2026-11-06T10:05:00Z', completed_at: '2026-11-06T10:08:00Z' },
    { name: 'factory / report', status: 'completed', conclusion: 'failure', started_at: '2026-11-06T10:09:00Z' },
  ];
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), now: () => T + 15 * 60_000, log: quiet }).handle(tick);
  assert.equal(sent.length, 0, 'no agent sent');
  assert.ok(readOutage(pr.body), 'the outage is still followed');
});

test('outage: « réessaie » relaunches the checks even when the factory is full', async () => {
  const { gh, state } = outageWorld({ sha: 'abc', since: T, tries: 7, told: true, blocked: true }, { prLabels: [], issueLabels: [L.feature, L.building, L.blocked] });
  state.issues.push({ number: 2, labels: [L.feature, L.building] }, { number: 3, labels: [L.feature, L.building] });
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet });
  const { action } = await relay.handle(ownerSays(1, [L.feature, L.building, L.blocked], 'réessaie'));
  assert.equal(action.type, 'outage-retry');
  assert.equal(relay.outputs.pr, '10');
});

test('outage: « réessaie » written on the PR itself relaunches the checks too', async () => {
  const { gh } = outageWorld({ sha: 'abc', since: T, tries: 7, told: true, blocked: true }, { prLabels: [], issueLabels: [L.feature, L.building, L.blocked] });
  const sent = [];
  const relay = createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet });
  const { action } = await relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [], text: 'réessaie', fromOwner: true, fromAgent: false });
  assert.equal(action.type, 'outage-retry');
  assert.equal(sent.length, 0);
});

test('outage: a change request on the blocked PR that mentions « relancer » is not taken for a retry', async () => {
  const { gh } = outageWorld({ sha: 'abc', since: T, tries: 7, told: true, blocked: true }, { prLabels: [], issueLabels: [L.feature, L.building, L.blocked] });
  const { action } = await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), log: quiet }).handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 10, labels: [], text: 'Avant de relancer, change la couleur du bouton', fromOwner: true, fromAgent: false });
  assert.notEqual(action.type, 'outage-retry');
});

test('outage: a lost report never blocks the card by itself, an outage past 3 hours goes back to the usual path', async () => {
  const { gh, state } = outageWorld({ sha: 'abc', since: T, tries: 7, told: true, next: null });
  state.issues.push({ number: 10, labels: [L.checks], pull_request: {} });
  gh.checkRuns = async () => [
    { name: 'factory / checks', status: 'completed', conclusion: 'failure', started_at: '2026-11-06T13:05:00Z', completed_at: '2026-11-06T13:08:00Z' },
    { name: 'factory / report', status: 'completed', conclusion: 'failure', started_at: '2026-11-06T13:09:00Z' },
  ];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk([]), now: () => T + 3.5 * 3_600_000, log: quiet }).handle(tick);
  assert.ok(!gh.calls.some((c) => c[0] === 'add' && c[2] === L.blocked));
});

// Issue #227: a host that failed to publish is not a broken live site.
test('the live check reads the newest deployment: a re-run still publishing is waited for, not the older failure', async () => {
  const gh = fakeGh({ issues: [], prs: [] });
  gh.deployments = async () => [{ id: 2, environment: 'github-pages' }, { id: 1, environment: 'github-pages' }];
  let done = false;
  gh.deploymentStatuses = async (id) => (id === 2 ? (done ? [{ state: 'success', environment_url: 'https://new.example' }] : [{ state: 'in_progress' }]) : [{ state: 'failure', description: 'boom' }]);
  const relay = createRelay({ gh, repo: 'r', config, env, log: quiet, sleep: async () => { done = true; } });
  assert.equal(await relay.liveUrl('s', { attempts: 2 }), 'https://new.example');
});

test('the live check of an older version still finds its address once it is superseded (inactive)', async () => {
  const gh = fakeGh({ issues: [], prs: [] });
  gh.deployments = async () => [{ id: 1, environment: 'Production' }];
  gh.deploymentStatuses = async () => [{ state: 'inactive' }, { state: 'success', environment_url: 'https://app.example' }];
  assert.equal(await createRelay({ gh, repo: 'r', config, env, log: quiet, sleep: async () => {} }).liveUrl('s', { attempts: 1 }), 'https://app.example');
});

test('a failed publication gives the host message and the run to re-run', async () => {
  const gh = fakeGh({ issues: [], prs: [] });
  gh.deployments = async () => [{ id: 1, environment: 'github-pages' }];
  gh.deploymentStatuses = async () => [{ state: 'failure', description: 'Deployment failed', log_url: 'https://github.com/o/r/actions/runs/777/job/9' }];
  assert.deepEqual(await createRelay({ gh, repo: 'r', config, env, log: quiet, sleep: async () => {} }).liveUrl('s', { attempts: 1 }), { failed: true, detail: 'Deployment failed', runId: 777 });
});

test('a failed publication is re-run once and checked again, nothing undone and no message', async () => {
  const gh = fakeGh({ issues: [], prs: [{ number: 10, title: 'X', body: 'Closes #1' }] });
  gh.rerunFailed = async (id) => gh.calls.push(['rerun', id]);
  const git = [];
  await createRelay({ gh, repo: 'r', config, env, log: quiet }).deployFailed({ pr: 10, sha: 'm1', detail: 'Deployment failed', runId: 777, git: (a) => git.push(a) });
  assert.deepEqual(gh.calls.filter((c) => c[0] === 'rerun'), [['rerun', 777]]);
  assert.deepEqual(JSON.parse(gh.calls.find((c) => c[0] === 'dispatch')[3].payload), { prodCheck: { pr: 10, sha: 'm1', deployRetried: true } });
  assert.equal(git.length, 0);
  assert.ok(!gh.calls.some((c) => c[0] === 'comment'));
});

test('a publication that fails again is only reported, with the host message, never undone', async () => {
  const gh = fakeGh({ issues: [], prs: [{ number: 10, title: 'X', body: 'Closes #1' }] });
  gh.rerunFailed = async (id) => gh.calls.push(['rerun', id]);
  gh.createIssue = async () => { throw new Error('no card expected'); };
  const git = [];
  await createRelay({ gh, repo: 'r', config, env, log: quiet }).deployFailed({ pr: 10, sha: 'm1', detail: 'Deployment failed', runId: 778, retried: true, git: (a) => git.push(a) });
  assert.equal(git.length, 0);
  assert.ok(!gh.calls.some((c) => c[0] === 'rerun' || c[0] === 'dispatch'));
  const [, n, body] = gh.calls.find((c) => c[0] === 'comment');
  assert.equal(n, 10);
  assert.match(body, /hébergeur refuse de la publier/);
  assert.match(body, /Deployment failed/);
});

// Issue #227: a « Remettre en ligne » card never waits in no-pick for an undo that was never opened.
function undoSetup({ issues = [], createPr } = {}) {
  issues.push({ number: 1, labels: [L.feature], open: false });
  const gh = fakeGh({ issues, prs: [{ number: 10, title: 'Créneaux communs', body: 'Closes #1', head: { sha: 'abc', ref: 'claude/issue-1-x' } }] });
  gh.createIssue = async (title, body, labels) => { const i = { number: 20, title, body, labels: [...labels] }; issues.push(i); gh.calls.push(['createIssue', title, body, labels]); return i; };
  gh.createPr = createPr || (async (title, head, base, body) => { gh.calls.push(['createPr', title, head, base, body]); return { number: 21 }; });
  gh.updateIssue = async (n, fields) => { gh.calls.push(['update', n, fields]); const i = issues.find((x) => x.number === n); if (i) Object.assign(i, fields); };
  gh.listOpenIssues = async () => issues.filter((i) => i.open !== false).map((i) => ({ ...i, labels: i.labels.map((name) => ({ name })) }));
  return gh;
}

test('an undo GitHub refuses to open: the redo card starts at once as a normal urgent fix, and the setting is named', async () => {
  const issues = [];
  const gh = undoSetup({ issues, createPr: async () => { throw new Error('GitHub Actions is not permitted to create or approve pull requests'); } });
  const sent = [];
  await createRelay({ gh, repo: 'r', config, env, fetchImpl: fetchOk(sent), log: quiet }).prodReport({ pr: 10, sha: 'm1', url: 'https://app.example', result: 'failed', detail: '/ : la page est vide', git: () => '' });
  const card = issues.find((i) => i.number === 20);
  assert.ok(!card.labels.includes(L.noPick));
  assert.ok(!/a retiré cette livraison/.test(card.body));
  const said = gh.calls.filter((c) => c[0] === 'comment' && c[1] === 10).map((c) => c[2]).join('\n');
  assert.match(said, /Allow GitHub Actions to create and approve pull requests/);
  assert.ok(!/Je la retire tout de suite/.test(said));
  assert.deepEqual(sent.map((s) => [payloadOf(s.init.body).issue, payloadOf(s.init.body).stage]), [[20, 'bugfix']]);
});

test('a relaunch finds the undo prepared but never opened: it opens it for the existing card, no second card', async () => {
  const stuck = { number: 20, labels: [L.bug, L.urgent, L.kept, L.noPick], body: `${PROD_BUG_MARKER}\nAprès la mise en ligne de la PR #10 (demande #1), la version en ligne ne marchait plus : x.\n\n\`git cherry-pick m1\`` };
  const issues = [stuck];
  const gh = undoSetup({ issues });
  await createRelay({ gh, repo: 'r', config, env, log: quiet }).prodReport({ pr: 10, sha: 'm1', url: 'https://app.example', result: 'failed', detail: 'erreur', git: () => '' });
  assert.ok(!gh.calls.some((c) => c[0] === 'createIssue'));
  assert.match(gh.calls.find((c) => c[0] === 'createPr')[4], /<!-- factory-revert-redo #20 -->/);
  assert.ok(stuck.labels.includes(L.noPick));
});
