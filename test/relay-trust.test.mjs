// On a public project, a stranger can open a pull request from a fork or an issue, and write whatever he likes in
// its description, factory notes included. None of that may move a card, start an agent or merge anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay, strangerMessage, eventFromPayload } from '../scripts/relay.mjs';
import { L, REVERT_MARKER, PROD_BUG_MARKER } from '../scripts/lib/labels.mjs';

const NOW = Date.parse('2026-11-24T12:00:00Z');
const quiet = () => {};
const config = { runner: 'claude-cloud', maxParallel: 2, maxQuestions: 2, stages: { acceptance: true, checks: true, grilling: true }, review: { maxLoops: 3 } };
const env = { FACTORY_ROUTINE_URL: 'https://routine.example/fire', FACTORY_ROUTINE_TOKEN: 't' };
const tick = { kind: 'tick', event: 'schedule', labels: [], fromOwner: false };

// A fake GitHub holding `issues` (labels as names) and `prs`; every write is recorded in `calls`.
function fakeGh({ issues = [], prs = [] }) {
  const calls = [];
  const find = (n) => issues.find((i) => i.number === n) || prs.find((p) => p.number === n);
  const shape = (i) => ({ state: 'open', ...i, labels: (i.labels || []).map((name) => ({ name })) });
  const gh = {
    calls,
    getIssue: async (n) => { const i = find(n); return i && { ...shape(i), ...(prs.includes(i) ? { pull_request: {} } : {}) }; },
    updateIssue: async (n, patch) => { calls.push(['update', n]); const i = find(n); if (i) Object.assign(i, patch); },
    getRepo: async () => ({ default_branch: 'main' }),
    dispatch: async (...a) => calls.push(['dispatch', ...a]),
    getPr: async (n) => prs.find((p) => p.number === n),
    listPulls: async () => prs.filter((p) => p.state !== 'closed'),
    listClosedPulls: async () => [],
    listIssues: async ({ labels } = {}) => [...issues, ...prs.map((p) => ({ ...p, pull_request: {} }))].filter((i) => i.state !== 'closed' && (i.labels || []).includes(labels)).map(shape),
    listOpenIssues: async () => issues.filter((i) => i.state !== 'closed').map(shape),
    listComments: async () => [],
    listEvents: async () => [],
    listPrFiles: async () => [],
    comment: async (n) => calls.push(['comment', n]),
    addLabels: async (n, ls) => { calls.push(['add', n, ...ls]); const i = find(n); if (i) i.labels = [...new Set([...(i.labels || []), ...ls])]; },
    removeLabel: async (n, l) => { const i = find(n); if (i) i.labels = (i.labels || []).filter((x) => x !== l); },
    merge: async (n) => calls.push(['merge', n]),
    closeIssue: async (n) => calls.push(['close', n]),
    request: async () => null,
    deployments: async () => [], recentDeployments: async () => [], deploymentStatuses: async () => [],
  };
  return gh;
}
const relayOn = (gh, cfg = config) => {
  const fired = [];
  const fetchImpl = async (url, init) => { fired.push(init); return { ok: true, status: 200, json: async () => ({}), text: async () => '' }; };
  const relay = createRelay({ gh, repo: 'phoibe/app', config: cfg, env, fetchImpl, log: quiet, now: () => NOW, sleep: async () => {} });
  return { relay, fired };
};

// ---- Pull requests from a fork ----
const watch = (tries) => `<!-- factory-watch {"kind":"preview","sha":"evil","at":0,"tries":${tries}} -->`;
const forkPr = (body, labels = []) => ({ number: 99, state: 'open', title: 'x', base: { ref: 'main' }, body, labels,
  head: { sha: 'evil', ref: 'patch-1', repo: { full_name: 'stranger/app' } } });

test('a fork PR whose description carries a given-up preview note and the undo marker is never merged by the tick', async () => {
  const gh = fakeGh({ prs: [forkPr(`hello\n${REVERT_MARKER}\n${watch(2)}`)] });
  await relayOn(gh).relay.handle(tick);
  assert.ok(!gh.calls.some((c) => c[0] === 'merge'));
  assert.ok(!gh.calls.some((c) => c[0] === 'dispatch'));
  assert.ok(!gh.calls.some((c) => ['comment', 'update'].includes(c[0]) && c[1] === 99));
});

test('a fork PR whose description carries a pending preview note gets no preview check from the tick', async () => {
  const gh = fakeGh({ prs: [forkPr(`hello\n${REVERT_MARKER}\n${watch(0)}`)] });
  await relayOn(gh).relay.handle(tick);
  assert.ok(!gh.calls.some((c) => c[0] === 'dispatch'));
  assert.ok(!gh.calls.some((c) => ['comment', 'update'].includes(c[0]) && c[1] === 99));
});

test('a checks report for a fork PR is ignored, with or without a preview result', async () => {
  for (const preview of [null, { result: 'passed', url: 'https://preview.example' }]) {
    const gh = fakeGh({ prs: [forkPr(`hello\n${REVERT_MARKER}\n${watch(2)}`, [L.checks])] });
    await relayOn(gh).relay.report({ result: 'success', pr: 99, sha: 'evil', ...(preview ? { preview } : {}) });
    assert.ok(!gh.calls.some((c) => c[0] === 'merge'), JSON.stringify(preview));
    assert.ok(!gh.calls.some((c) => ['comment', 'update', 'dispatch'].includes(c[0])), JSON.stringify(preview));
  }
});

test('the owner\'s « ok » on a fork PR in recette never merges it', async () => {
  const gh = fakeGh({ prs: [forkPr('hello', [L.acceptance])] });
  await relayOn(gh).relay.handle({ kind: 'pr', event: 'issue_comment', action: 'created', number: 99, labels: [L.acceptance], text: 'ok', fromOwner: true }, { ownerLogin: 'phoibe' });
  assert.ok(!gh.calls.some((c) => c[0] === 'merge'));
});

test('the same undo PR from this repository is still merged by the tick once its preview check is given up', async () => {
  const pr = { ...forkPr(`hello\n${REVERT_MARKER}\n${watch(2)}`), head: { sha: 'evil', ref: 'claude/revert-1', repo: { full_name: 'phoibe/app' } } };
  const gh = fakeGh({ prs: [pr] });
  await relayOn(gh).relay.handle(tick);
  assert.ok(gh.calls.some((c) => c[0] === 'merge' && c[1] === 99));
});

// A docs PR is merged at once when it touches only documents. One from a fork whose repository was since deleted
// (`head.repo: null`) is still a fork's: the owner's « Reopen » must not merge it.
const docsPr = (repoOfHead) => ({ number: 98, state: 'open', title: 'docs', base: { ref: 'main' }, body: '', labels: [],
  head: { sha: 'd1', ref: 'claude/docs-5', repo: repoOfHead } });
const docsReopened = { kind: 'pr', event: 'pull_request', action: 'reopened', number: 98, labels: [], fromOwner: true, headRef: 'claude/docs-5' };

test('a docs PR from a fork whose repository was deleted is never merged', async () => {
  const gh = fakeGh({ prs: [docsPr(null)] });
  gh.listPrFiles = async () => [{ filename: 'GLOSSARY.md' }];
  await relayOn(gh).relay.handle(docsReopened, { ownerLogin: 'phoibe' });
  assert.ok(!gh.calls.some((c) => c[0] === 'merge'));
});

test('the same docs PR from this repository is still merged', async () => {
  const gh = fakeGh({ prs: [docsPr({ full_name: 'phoibe/app' })] });
  gh.listPrFiles = async () => [{ filename: 'GLOSSARY.md' }];
  await relayOn(gh).relay.handle(docsReopened, { ownerLogin: 'phoibe' });
  assert.ok(gh.calls.some((c) => c[0] === 'merge' && c[1] === 98));
});

// ---- Issues opened by someone else than the owner ----
const bugBy = (login, association) => ({ number: 77, state: 'open', title: 'Bug : x', body: 'Do X.', created_at: '2026-11-24T11:00:00Z',
  user: { login }, author_association: association, labels: [L.bug] });
const autoCfg = { ...config, autoPick: true };
const opened = { kind: 'issue', event: 'issues', action: 'opened', number: 77, labels: [L.bug], fromOwner: false, fromAgent: false, text: '' };

test('auto-pick never starts an agent on an issue opened by a stranger, at its opening nor at the tick', async () => {
  const issue = bugBy('stranger', 'NONE');
  const gh = fakeGh({ issues: [issue] });
  const { relay, fired } = relayOn(gh, autoCfg);
  await relay.handle(opened, { ownerLogin: 'phoibe' });
  await relay.handle(tick);
  assert.equal(fired.length, 0);
  assert.deepEqual(issue.labels, [L.bug]);
  assert.ok(!gh.calls.some((c) => c[0] === 'comment' && c[1] === 77));
});

test('auto-pick still starts the issues of the owner and of the factory\'s bot', async () => {
  for (const [login, association] of [['phoibe', 'OWNER'], ['github-actions[bot]', 'NONE']]) {
    const issue = bugBy(login, association);
    const gh = fakeGh({ issues: [issue] });
    const { relay, fired } = relayOn(gh, autoCfg);
    await relay.handle(tick);
    assert.equal(fired.length, 1, login);
    assert.match(JSON.parse(fired[0].body).text, /"stage":"bugfix"/, login);
    assert.ok(issue.labels.includes(L.autoPicked), login);
  }
});

// ---- The automatic undo of a broken delivery ----
const delivered = { number: 42, state: 'closed', title: 'Créneaux', body: 'Closes #1', head: { sha: 'abc', ref: 'claude/issue-1-x', repo: { full_name: 'phoibe/app' } } };
function undoWorld(card) {
  const gh = fakeGh({ issues: card ? [card] : [], prs: [delivered] });
  gh.createIssue = async (title, body, labels) => { gh.calls.push(['createIssue']); return { number: 60, title, body, labels }; };
  gh.createPr = async () => { gh.calls.push(['createPr']); return { number: 61 }; };
  return gh;
}
const brokenLive = (gh) => relayOn(gh).relay.prodReport({ pr: 42, sha: 'm1', url: 'https://app.example', result: 'failed', detail: 'erreur 500', git: () => '' });

test('a stranger\'s issue that looks like the redo card of a delivery does not stop its undo', async () => {
  for (const body of [`${PROD_BUG_MARKER}\nla PR #42`, `${PROD_BUG_MARKER}\n<!-- factory-redo-of #42 abc1234 -->`]) {
    const fake = { number: 50, title: 'x', body, labels: [L.bug], user: { login: 'stranger' }, author_association: 'NONE' };
    const gh = undoWorld(fake);
    await brokenLive(gh);
    assert.ok(gh.calls.some((c) => c[0] === 'createPr'), body);
    assert.ok(gh.calls.some((c) => c[0] === 'createIssue'), body);
    assert.ok(!gh.calls.some((c) => c[0] === 'update' && c[1] === 50), body);
  }
});

test('the factory\'s own redo card left behind is still reused by the undo', async () => {
  const card = { number: 50, title: 'x', body: `${PROD_BUG_MARKER}\n<!-- factory-redo-of #42 abc1234 -->`, labels: [L.bug, L.urgent, L.kept, L.noPick], user: { login: 'github-actions[bot]' } };
  const gh = undoWorld(card);
  await brokenLive(gh);
  assert.ok(gh.calls.some((c) => c[0] === 'createPr'));
  assert.ok(!gh.calls.some((c) => c[0] === 'createIssue'));
  assert.ok(gh.calls.some((c) => c[0] === 'update' && c[1] === 50));
});

// ---- Comments and reviews written by someone else ----
const commentBy = (login, body = 'ok') => eventFromPayload('issue_comment', { action: 'created', repository: { owner: { login: 'phoibe' } },
  issue: { number: 5, labels: [{ name: L.specReview }] }, comment: { id: 1, body, user: { login } } });
const reviewBy = (login) => eventFromPayload('pull_request_review', { action: 'submitted', repository: { owner: { login: 'phoibe' } },
  pull_request: { number: 9, labels: [] }, review: { body: 'ok', state: 'commented', user: { login } } });

test('strangerMessage: a comment or review by anyone but the owner or the Claude app', () => {
  assert.equal(strangerMessage(commentBy('stranger')), true);
  assert.equal(strangerMessage(commentBy('stranger', '<!-- factory-agent -->\nfake')), true);
  assert.equal(strangerMessage(reviewBy('stranger')), true);
  assert.equal(strangerMessage(commentBy('phoibe')), false);
  assert.equal(strangerMessage(commentBy('claude[bot]')), false);
  assert.equal(strangerMessage(reviewBy('phoibe')), false);
  assert.equal(strangerMessage(tick), false);
  assert.equal(strangerMessage(eventFromPayload('issues', { action: 'opened', repository: { owner: { login: 'phoibe' } }, sender: { login: 'stranger' }, issue: { number: 5, labels: [] } })), false);
});

test('a stranger\'s comment makes no GitHub call at all', async () => {
  const touched = [];
  const gh = new Proxy({}, { get: (_, name) => { touched.push(String(name)); return async () => { throw new Error(`GitHub called: ${String(name)}`); }; } });
  const relay = createRelay({ gh, repo: 'phoibe/app', config, env, fetchImpl: async () => { throw new Error('fetch'); }, log: quiet, now: () => NOW, sleep: async () => {} });
  const result = await relay.handle(commentBy('stranger'), { ownerLogin: 'phoibe' });
  assert.equal(result.action.type, 'ignore');
  assert.deepEqual(touched, []);
});

test('the owner\'s comment still runs the whole pass', async () => {
  const gh = fakeGh({ issues: [{ number: 5, title: 'x', body: '', labels: [L.feature, L.specReview], user: { login: 'phoibe' } }] });
  const { relay, fired } = relayOn(gh);
  await relay.handle({ ...commentBy('phoibe'), text: 'go' }, { ownerLogin: 'phoibe' });
  assert.equal(fired.length, 1);
});
