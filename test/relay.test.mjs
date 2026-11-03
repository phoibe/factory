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
    getIssue: async (n) => { const i = issue(n); return i && { ...i, labels: (i.labels || []).map((name) => ({ name })) }; },
    getRepo: async () => ({ default_branch: 'main' }),
    dispatch: async (wf, ref, inputs) => calls.push(['dispatch', wf, ref, inputs]),
    react: async (id, c) => calls.push(['react', id, c]),
    getPr: async (n) => state.prs.find((p) => p.number === n),
    listIssues: async ({ labels }) => state.issues.filter((i) => i.open !== false && i.labels.includes(labels)).map((i) => ({ ...i, labels: i.labels.map((name) => ({ name })) })),
    listComments: async (n) => state.comments?.[n] || [],
    listEvents: async (n) => state.events?.[n] || [],
    comment: async (n, body) => calls.push(['comment', n, body]),
    addLabels: async (n, ls) => { calls.push(['add', n, ...ls]); const i = issue(n); if (i) { i.labels = i.labels || []; i.labels.push(...ls); } },
    removeLabel: async (n, l) => { calls.push(['remove', n, l]); const i = issue(n); if (i) i.labels = (i.labels || []).filter((x) => x !== l); },
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
  assert.ok(gh.calls.some((c) => c[0] === 'add' && c[1] === 5 && c[2] === L.running));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].init.headers['anthropic-beta'], 'experimental-cc-routine-2026-04-01');
  assert.deepEqual(JSON.parse(JSON.parse(sent[0].init.body).text), { repo: 'phoibe/app', issue: 5, pr: null, stage: 'grilling', factory: 'phoibe/factory' });
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
  assert.equal(JSON.parse(JSON.parse(sent[0].init.body).text).stage, 'build');
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
  assert.equal(JSON.parse(JSON.parse(sent[0].init.body).text).stage, 'update-branch');
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
  assert.equal(JSON.parse(JSON.parse(sent[0].init.body).text).stage, 'build');
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
