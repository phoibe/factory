import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay, eventFromPayload, linkedIssue } from '../scripts/relay.mjs';
import { L, AGENT_MARKER, CHECKS_FAILED_MARKER } from '../scripts/lib/labels.mjs';

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

test('green checks on a feature open acceptance with the preview link', async () => {
  const gh = fakeGh({ issues: [{ number: 1, labels: [L.feature, L.building] }], prs: [{ number: 10, body: 'Closes #1', head: { sha: 'abc' } }] });
  const relay = createRelay({ gh, repo: 'r', config, env, log: quiet, sleep: async () => {} });
  await relay.report({ result: 'success', pr: 10 });
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 10 && c[2] === L.acceptance));
  assert.ok(gh.calls.some((c) => c[0] === 'comment' && c[2].includes('https://preview.example')));
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
  await createRelay({ gh, repo: 'r', config: allStages, env, fetchImpl: fetchOk(sent), log: quiet, sleep: async () => {} }).report({ result: 'success', pr: 10 });
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

// ---- auto-pick ----
const pickConfig = { ...config, autoPick: true, stages: { grilling: true, acceptance: true } };
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
