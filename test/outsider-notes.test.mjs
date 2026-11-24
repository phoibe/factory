// Issue #557: on a public project, the factory's hidden notes in the description of an issue or PR opened by an
// outsider have no effect anywhere. One rule (scripts/lib/trust.mjs) applied where GitHub answers enter the factory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustBodies, trustRead, visibleText } from '../scripts/lib/trust.mjs';
import { isIdea } from '../scripts/lib/labels.mjs';
import { readRelaunch } from '../scripts/lib/relaunch.mjs';
import { readWatch } from '../scripts/lib/watch.mjs';
import { readOutage } from '../scripts/lib/outage.mjs';
import { redoOf } from '../scripts/relay/shared.mjs';
import { ideaItems } from '../panel/lib.mjs';
import { relaunchWaits } from '../panel/live.mjs';

const has = (item) => item.body.includes('<!-- factory-');
// One line per kind of note read in a description, each with a real reader (or the plain test when only a string is
// looked for).
const NOTES = [
  { note: '<!-- factory-agent -->', labels: ['factory:feature'], found: (i) => isIdea(i) && ideaItems([i]).length === 1 },
  { note: '<!-- factory-relaunch {"stage":"build","next":1} -->', labels: ['factory:relaunch'], found: (i) => !!readRelaunch(i.body) && relaunchWaits(i) },
  { note: '<!-- factory-watch {"kind":"preview"} -->', found: (i) => !!readWatch(i.body) },
  { note: '<!-- factory-outage {"blocked":true} -->', found: (i) => !!readOutage(i.body) },
  { note: '<!-- factory-prod-check -->\n<!-- factory-redo-of #9 abcdef1 -->', found: (i) => !!redoOf(i.body) },
  ...['<!-- factory-reopen {"at":1} -->', '<!-- factory-redo-recheck {"n":1} -->', '<!-- factory-revert -->',
    '<!-- factory-revert-redo #9 -->', '<!-- factory-nothing-to-test -->', '<!-- factory-version-tag v1 -->',
    '<!-- factory-stack-delivery -->', '<!-- factory-split -->', '<!-- factory-image: attachments/1/a.png -->']
    .map((note) => ({ note, found: has })),
];
const VISIBLE = 'Texte visible ![i](https://x/i.png)';
const itemWith = ({ note, labels = [] }, user, extra = {}) => ({
  number: 3, title: 'Une demande', labels, user, body: `${VISIBLE}\n${note}`, ...extra,
});
const OUTSIDERS = [
  [{ login: 'alice' }, 'NONE'], [{ login: 'alice' }, 'CONTRIBUTOR'], [{ login: 'vercel[bot]' }, 'NONE'], [null, 'NONE'],
];
const TRUSTED = [
  [{ login: 'acme' }, 'OWNER'], [{ login: 'bob' }, 'MEMBER'], [{ login: 'carol' }, 'COLLABORATOR'],
  [{ login: 'github-actions[bot]' }, 'NONE'], [{ login: 'claude[bot]' }, 'NONE'],
];
const asPr = (item) => ({ ...item, pull_request: { url: 'x' } });
const same = (i) => i;

test("an outsider's note of every kind is ignored, in an issue and in a PR, and their visible text stays", () => {
  for (const kind of NOTES) {
    for (const [user, author_association] of OUTSIDERS) {
      for (const shape of [same, asPr]) {
        const item = shape(itemWith(kind, user, { author_association }));
        const owned = shape(itemWith(kind, { login: 'acme' }, { author_association: 'OWNER' }));
        if (shape === same) assert.ok(kind.found(owned));
        const [clean] = trustBodies([item], 'acme');
        assert.equal(clean.untrusted, true, kind.note);
        assert.equal(has(clean), false, kind.note);
        assert.equal(kind.found(clean), false, kind.note);
        assert.ok(clean.body.includes(VISIBLE));
      }
    }
  }
});

test('the notes of the owner, of members, collaborators and of the factory bots keep working', () => {
  for (const kind of NOTES) {
    for (const [user, author_association] of TRUSTED) {
      for (const item of [itemWith(kind, user, { author_association }), asPr(itemWith(kind, user, { author_association }))]) {
        const list = [item];
        assert.equal(trustBodies(list, 'acme'), list);
      }
      assert.ok(kind.found(trustBodies([itemWith(kind, user, { author_association })], 'acme')[0]), kind.note);
    }
  }
});

test('the organisation name is not a login of a member', () => {
  const [clean] = trustBodies([itemWith(NOTES[0], { login: 'acme-fan' }, { author_association: 'NONE' })], 'acme');
  assert.equal(clean.untrusted, true);
});

test('a note split around another one is stripped until none is left', () => {
  const body = '<!-- factory-<!-- factory-x -->agent -->\n<!<!-- factory-y -->-- factory-relaunch {} -->';
  const [clean] = trustBodies([{ number: 1, title: 't', user: { login: 'alice' }, body }], 'acme');
  assert.doesNotMatch(clean.body, /<!--\s*factory-/);
});

test('outsiders items nested in an event or a search answer are cleaned, the rest is left as is', () => {
  const outsider = itemWith(NOTES[0], { login: 'alice' }, { author_association: 'NONE' });
  const [event] = trustBodies([{ event: 'labeled', issue: outsider }], 'acme');
  assert.equal(event.issue.untrusted, true);
  assert.equal(has(event.issue), false);
  assert.equal(trustBodies({ items: [outsider] }, 'acme').items[0].untrusted, true);
  const comment = [{ id: 1, body: '<!-- factory-agent -->', user: { login: 'alice' } }];
  assert.equal(trustBodies(comment, 'acme'), comment);
  const noUser = { number: 7, title: 'B', body: '<!-- factory-agent -->' };
  assert.equal(trustBodies(noUser, 'acme'), noUser);
  const list = [outsider];
  trustBodies(list, 'acme');
  assert.equal(list[0], outsider);
  assert.ok(has(outsider));
  assert.equal(trustBodies(null, 'acme'), null);
  assert.equal(trustBodies('text', 'acme'), 'text');
});

test('trustRead cleans only the answers of a public project', () => {
  const list = [itemWith(NOTES[0], { login: 'alice' }, { author_association: 'NONE' })];
  const asked = [];
  const clean = trustRead('/repos/o/r/issues?state=open', list, (full) => { asked.push(full); return false; });
  assert.deepEqual(asked, ['o/r']);
  assert.equal(clean[0].untrusted, true);
  assert.equal(trustRead('/repos/o/r/issues?state=open', list, () => true), list);
  assert.equal(trustRead('/user/repos', list, () => false), list);
  assert.equal(trustRead('https://api.github.com/repos/o/r/issues/3', list[0], () => false).untrusted, true);
});

test('visibleText keeps the visible text and no hidden comment at all', () => {
  const text = visibleText('A <!-- factory-agent --> B <!-- autre -->\n![i](u) [l](v)\n<!-- factory-split');
  assert.doesNotMatch(text, /<!--/);
  for (const part of ['A', 'B', '![i](u)', '[l](v)']) assert.ok(text.includes(part), part);
  assert.ok(text.endsWith('&lt;!-- factory-split'));
  assert.doesNotMatch(visibleText('<!-- <!-- x --> factory-agent -->'), /<!--/);
  assert.equal(visibleText(null), '');
});

// --- Task 2: the relay's GitHub client and the webhook payload ---
import { github } from '../scripts/lib/github.mjs';
import { eventFromPayload } from '../scripts/relay.mjs';
import { L, AGENT_MARKER } from '../scripts/lib/labels.mjs';

const reply = (status, body) => ({ ok: status < 400, status, json: async () => structuredClone(body), text: async () => JSON.stringify(body), headers: new Map() });
// A fake GitHub: `routes` maps a path (no host, with its query) to the answer; every call is noted.
function fakeClient(routes, opts = {}) {
  const calls = [];
  const gh = github({
    token: 't', repo: 'o/r', sleep: async () => {}, ...opts,
    fetchImpl: async (url, init) => {
      const path = url.replace('https://api.github.com', '');
      calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined });
      if (init.method !== 'GET') return reply(200, {});
      const a = routes[path];
      return a === undefined ? reply(404, {}) : typeof a === 'number' ? reply(a, {}) : reply(200, a);
    },
  });
  return { gh, calls };
}
const outsiderOf = (kind, extra = {}) => itemWith(kind, { login: 'alice' }, { author_association: 'NONE', ...extra });
const ownerOf = (kind, extra = {}) => itemWith(kind, { login: 'o' }, { author_association: 'OWNER', number: 4, ...extra });
const readsOf = (issue, pr) => ({
  '/repos/o/r/issues/3': issue, '/repos/o/r/pulls/3': pr,
  '/repos/o/r/issues?state=open&per_page=100': [issue],
  '/repos/o/r/pulls?state=open&per_page=100': [pr],
  '/repos/o/r/issues?state=open&per_page=100&labels=a%2Cb': [issue],
  '/repos/o/r/pulls?state=closed&sort=updated&direction=desc&per_page=30': [pr],
});
async function everyRead(gh) {
  return [await gh.getIssue(3), await gh.getPr(3), (await gh.listOpenIssues())[0], (await gh.listPulls())[0],
    (await gh.listIssues({ labels: 'a,b' }))[0], (await gh.listClosedPulls())[0], await gh.request('GET', '/repos/{repo}/issues/3')];
}

test("on a public project every read of the client strips an outsider's notes and marks the item", async () => {
  for (const kind of NOTES) {
    const issue = outsiderOf(kind);
    const { gh } = fakeClient(readsOf(issue, asPr(issue)), { isPublic: true });
    for (const read of await everyRead(gh)) {
      assert.equal(read.untrusted, true, kind.note);
      assert.equal(has(read), false, kind.note);
      assert.equal(kind.found(read), false, kind.note);
    }
    const mine = ownerOf(kind);
    const { gh: gh2 } = fakeClient({ '/repos/o/r/issues/4': mine }, { isPublic: true });
    assert.deepEqual(await gh2.getIssue(4), mine);
  }
});

test("on a private project an outsider's item is left as GitHub sent it", async () => {
  const issue = outsiderOf(NOTES[1]);
  const { gh } = fakeClient(readsOf(issue, asPr(issue)), { isPublic: false });
  for (const read of await everyRead(gh)) assert.ok(!read.untrusted && has(read));
  assert.deepEqual(await gh.getIssue(3), issue);
});

test("the visibility is asked once, and only when an outsider's item is read", async () => {
  const issue = outsiderOf(NOTES[0]);
  const repoReads = (calls) => calls.filter((c) => c.path === '/repos/o/r').length;
  for (const [repo, cleaned] of [[{ private: true }, false], [{ private: false }, true], [undefined, true]]) {
    const { gh, calls } = fakeClient({ '/repos/o/r/issues/3': issue, '/repos/o/r': repo });
    const a = await gh.getIssue(3);
    await gh.getIssue(3);
    assert.equal(repoReads(calls), 1);
    assert.equal(a.untrusted === true, cleaned);
    assert.equal(has(a), !cleaned);
  }
  const { gh, calls } = fakeClient({ '/repos/o/r/issues/4': ownerOf(NOTES[0]), '/repos/o/r': { private: false } });
  await gh.getIssue(4);
  assert.equal(repoReads(calls), 0);
});

test("no factory note is written in the description of an outsider's request", async () => {
  const patches = (calls) => calls.filter((c) => c.method === 'PATCH');
  const noted = 'x\n\n<!-- factory-relaunch {} -->';
  let c = fakeClient({ '/repos/o/r/issues/3': outsiderOf(NOTES[0]) }, { isPublic: true });
  assert.equal(await c.gh.updateIssue(3, { body: noted }), null);
  assert.deepEqual(patches(c.calls), []);
  c = fakeClient({ '/repos/o/r/issues/3': outsiderOf(NOTES[0]) }, { isPublic: true });
  await c.gh.updateIssue(3, { body: noted, state: 'closed' });
  assert.deepEqual(patches(c.calls).map((p) => p.body), [{ state: 'closed' }]);
  for (const [item, isPublic] of [[ownerOf(NOTES[0], { number: 3 }), true], [outsiderOf(NOTES[0]), false]]) {
    c = fakeClient({ '/repos/o/r/issues/3': item }, { isPublic });
    await c.gh.updateIssue(3, { body: noted });
    assert.deepEqual(patches(c.calls).map((p) => p.body), [{ body: noted }]);
  }
  c = fakeClient({}, { isPublic: true });
  await c.gh.updateIssue(3, { body: 'x' });
  assert.deepEqual(c.calls.map((p) => p.method), ['PATCH']);
});

test("the webhook's payload does not take an outsider's agent note for the agent's", () => {
  const payload = (login, isPrivate) => ({
    action: 'labeled', label: { name: L.feature }, sender: { login: 'phoibe' },
    repository: { owner: { login: 'phoibe' }, private: isPrivate },
    issue: { number: 3, title: 't', labels: [], user: { login }, author_association: 'NONE', body: AGENT_MARKER },
  });
  assert.equal(eventFromPayload('issues', payload('alice', false)).fromAgent, false);
  assert.equal(eventFromPayload('issues', payload('alice', true)).fromAgent, true);
  assert.equal(eventFromPayload('issues', payload('phoibe', false)).fromAgent, true);
});

// --- Task 3: every read of the panel goes through the rule ---
import { readFileSync } from 'node:fs';
import { readRelaunch as panelReadRelaunch, relaunchLine } from '../panel/relaunch.mjs';

test("the panel's three GitHub readers clean every answer, and no other read of issues or PRs skips them", () => {
  const src = readFileSync(new URL('../panel/app.mjs', import.meta.url), 'utf8');
  const bodyOf = (head) => {
    const start = src.indexOf(head);
    assert.ok(start >= 0, head);
    return src.slice(start, src.indexOf('\n}\n', start));
  };
  for (const head of ['async function api(', 'async function cachedGet(', 'async function chatGet(']) assert.match(bodyOf(head), /guardRead\(path, /, head);
  const others = src.split('\n').filter((l) => /\bfetch\(/.test(l) && /\/(issues|pulls)\b/.test(l));
  assert.deepEqual(others, []);
});

test("through the panel's rule the owner's and the agent's notes keep working on a public project, an outsider's do not", () => {
  const isPrivate = () => false;
  const idea = { number: 5, title: 'Idée', labels: ['factory:feature'], user: { login: 'claude[bot]' }, author_association: 'NONE', body: `Idée\n${AGENT_MARKER}` };
  const next = Date.now() + 3600_000;
  const card = { number: 6, title: 'Carte', labels: ['factory:relaunch'], user: { login: 'o' }, author_association: 'OWNER', body: `Carte\n\n<!-- factory-relaunch {"stage":"build","next":${next}} -->` };
  const [i, c] = trustRead('/repos/o/r/issues?state=open', [idea, card], isPrivate);
  assert.equal(ideaItems([i]).length, 1);
  assert.match(relaunchLine(panelReadRelaunch(c.body)), /^Relance prévue à /);
  const alice = { user: { login: 'alice' }, author_association: 'NONE' };
  const [i2, c2] = trustRead('/repos/o/r/issues?state=open', [{ ...idea, ...alice }, { ...card, ...alice }], isPrivate);
  assert.equal(ideaItems([i2]).length, 0);
  assert.equal(relaunchLine(panelReadRelaunch(c2.body)), null);
});
