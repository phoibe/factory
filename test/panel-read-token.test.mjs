// Issue #395: the chat server only receives a read-only token; the panel writes with the full one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenFromHash, readTokenFromHash, phoneLink } from '../panel/lib.mjs';
import { newConversation, addExchange, upsertIndex, issueRequest, notCreatedNote, readTokenProblem, probeSaysWritable, WRITE_PROBES, READ_TOKEN_URL, WRITABLE_TOKEN } from '../panel/chat.mjs';

test('le lien du téléphone emporte les deux jetons', () => {
  const link = phoneLink('https://phoibe.github.io/factory/#old', 'github_pat_FULL_1', 'github_pat_READ_2');
  assert.equal(link, 'https://phoibe.github.io/factory/#jeton=github_pat_FULL_1&lecture=github_pat_READ_2');
  const { hash } = new URL(link);
  assert.equal(tokenFromHash(hash), 'github_pat_FULL_1');
  assert.equal(readTokenFromHash(hash), 'github_pat_READ_2');
});

test('un ancien lien sans jeton de lecture connecte toujours, sans jeton de lecture', () => {
  assert.equal(phoneLink('https://x.io/', 'github_pat_A'), 'https://x.io/#jeton=github_pat_A');
  assert.equal(tokenFromHash('#jeton=github_pat_A'), 'github_pat_A');
  assert.equal(readTokenFromHash('#jeton=github_pat_A'), null);
  assert.equal(readTokenFromHash('#lecture=<script>'), null);
});

test('the create link asks GitHub for a one-year, read-only (contents) token', () => {
  const u = new URL(READ_TOKEN_URL);
  assert.equal(u.origin + u.pathname, 'https://github.com/settings/personal-access-tokens/new');
  assert.equal(u.searchParams.get('expires_in'), '365');
  assert.equal(u.searchParams.get('contents'), 'read');
  for (const p of ['issues', 'pull_requests', 'administration', 'workflows']) assert.equal(u.searchParams.get(p), null);
});

test('a write probe means « can write » unless GitHub refused it', () => {
  assert.equal(probeSaysWritable(403), false);
  assert.equal(probeSaysWritable(404), false);
  assert.equal(probeSaysWritable(401), false);
  assert.equal(probeSaysWritable(422), true);
  assert.equal(probeSaysWritable(409), true);
  assert.equal(probeSaysWritable(200), true);
});

test('coller mon jeton complet est refusé avec un message clair', () => {
  assert.equal(WRITABLE_TOKEN, 'Ce jeton peut modifier vos projets : créez-en un en lecture seule avec le bouton ci-dessus.');
  const ok = { same: false, status: 200, login: 'Phoibe', owner: 'phoibe', readable: true, writable: false };
  assert.equal(readTokenProblem(ok), null);
  assert.equal(readTokenProblem({ ...ok, same: true }), WRITABLE_TOKEN);
  assert.equal(readTokenProblem({ ...ok, writable: true }), WRITABLE_TOKEN);
  assert.match(readTokenProblem({ ...ok, status: 401 }), /GitHub ne reconnaît pas ce jeton/);
  assert.match(readTokenProblem({ ...ok, login: 'intrus' }), /autre compte/);
  assert.match(readTokenProblem({ ...ok, readable: false }), /ne peut pas lire ce projet/);
});

test('a conversation is stored as the server stored it', () => {
  const conv = newConversation('c1', 'Je peux exporter ?\nsuite', '2026-11-13T10:00:00Z');
  assert.deepEqual(conv, { id: 'c1', title: 'Je peux exporter ?', state: 'open', created: '2026-11-13T10:00:00Z', updated: '2026-11-13T10:00:00Z', messages: [] });
  assert.equal(newConversation('c2', '', 'x').title, 'Image envoyée');
  addExchange(conv, { text: 'Je peux exporter ?', images: ['attachments/chat/1-a.png'] }, 'Non.', '2026-11-13T10:01:00Z',
    [{ title: 'Exporter', url: 'https://github.com/o/r/issues/7', kind: 'feature', number: 7, body: 'x' }]);
  assert.deepEqual(conv.messages, [
    { who: 'me', text: 'Je peux exporter ?', images: ['attachments/chat/1-a.png'], at: '2026-11-13T10:01:00Z' },
    { who: 'agent', text: 'Non.', at: '2026-11-13T10:01:00Z', issues: [{ title: 'Exporter', url: 'https://github.com/o/r/issues/7', kind: 'feature' }] },
  ]);
  assert.equal(conv.updated, '2026-11-13T10:01:00Z');
  conv.state = 'closed';
  addExchange(conv, { text: 'Encore' }, 'Oui.', '2026-11-13T10:02:00Z');
  assert.equal(conv.state, 'open'); // a new message reopens it
  assert.equal(conv.messages.at(-1).issues, undefined);
});

test('the index keeps one entry per conversation, most recent first', () => {
  const conv = { id: 'c1', title: 'Export', updated: '2026-11-13T10:00:00Z', state: 'open', messages: [] };
  const index = upsertIndex([{ id: 'old', title: 'x', updated: '2026-11-01T00:00:00Z', state: 'closed' }, { id: 'c1', title: 'avant', updated: '2026-11-02T00:00:00Z', state: 'closed' }], conv);
  assert.deepEqual(index, [{ id: 'c1', title: 'Export', updated: '2026-11-13T10:00:00Z', state: 'open' }, { id: 'old', title: 'x', updated: '2026-11-01T00:00:00Z', state: 'closed' }]);
  assert.deepEqual(upsertIndex(null, conv).map((c) => c.id), ['c1']);
});

test('the issues the agent proposes are created as the server created them', () => {
  assert.deepEqual(issueRequest({ kind: 'bug', title: 'Plante', body: 'Quand…' }),
    { title: 'Plante', labels: ['factory:bug'], body: 'Quand…\n\n_Demandé depuis le chat du tableau de suivi._' });
  // A feature the owner asked for is kept, and the agent marker leaves it to the queue instead of starting it at once.
  assert.deepEqual(issueRequest({ kind: 'feature', title: 'Exporter', body: 'Il veut.' }),
    { title: 'Exporter', labels: ['factory:feature', 'factory:kept'], body: '<!-- factory-agent -->\nIl veut.\n\n_Demandé depuis le chat du tableau de suivi._' });
});

test('a request GitHub refused is said under the answer', () => {
  assert.equal(notCreatedNote(0), '');
  assert.equal(notCreatedNote(1), '\n\n_Une demande n\'a pas pu être créée sur GitHub : redemandez dans un moment._');
  assert.equal(notCreatedNote(2), '\n\n_2 demandes n\'ont pas pu être créées sur GitHub : redemandez dans un moment._');
});

test('the write probes cover files, requests and pull requests, always with an empty body', () => {
  assert.deepEqual(WRITE_PROBES, [['PUT', 'contents/.factory-write-probe'], ['POST', 'issues'], ['POST', 'pulls']]);
});

test('la fiche produit dit que le serveur de discussion ne reçoit qu\'un jeton de lecture', async () => {
  const { readFile } = await import('node:fs/promises');
  const product = await readFile(new URL('../PRODUCT.md', import.meta.url), 'utf8');
  assert.match(product, /serveur de discussion ne reçoit qu'un jeton de lecture seule/);
});

test('a conversation id from the chat server is used only when it is a plain id (never a path for the full token)', async () => {
  const { conversationId } = await import('../panel/chat.mjs');
  assert.equal(conversationId('20261113-101010-abcde', null), '20261113-101010-abcde');
  assert.equal(conversationId('../../pulls/42/merge#', 'c1'), 'c1'); // the id the panel already had
  assert.match(conversationId('../../collaborators/x#', null), /^\d{8}-\d{6}-[a-z0-9]{5}$/); // a new one of its own
  assert.match(conversationId(undefined, null, new Date('2026-11-13T10:11:12Z')), /^20261113-101112-[a-z0-9]{5}$/);
  assert.equal(conversationId('x'.repeat(65), 'c1'), 'c1');
});

test('a rate-limited GitHub answer (403 with no request left, or retry-after) is « GitHub down », never « cannot write »', async () => {
  const { githubBusy, probeSaysWritable: writable } = await import('../panel/chat.mjs');
  const h = (o) => new Headers(o);
  assert.equal(githubBusy(403, h({ 'x-ratelimit-remaining': '0' })), true);
  assert.equal(githubBusy(403, h({ 'retry-after': '60' })), true);
  assert.equal(githubBusy(429, h({})), true);
  assert.equal(githubBusy(502, h({})), true);
  assert.equal(githubBusy(403, h({ 'x-ratelimit-remaining': '12' })), false);
  assert.equal(writable(410), false); // issues turned off on the project: nobody can open one
});

test('the panel creates at most 3 well-formed requests from one answer, whatever the chat server sends', async () => {
  const { wantedIssues } = await import('../panel/chat.mjs');
  const ok = (t) => ({ kind: 'feature', title: t, body: 'b' });
  assert.deepEqual(wantedIssues([ok('a'), ok('b'), ok('c'), ok('d')]).map((i) => i.title), ['a', 'b', 'c']);
  assert.deepEqual(wantedIssues([{ kind: 'bug', title: 'x', body: 'y' }, { kind: 'autre', title: 'z', body: '' }, { title: '' }, null, 'x']),
    [{ kind: 'bug', title: 'x', body: 'y' }, { kind: 'feature', title: 'z', body: '' }]);
  assert.equal(wantedIssues([{ kind: 'bug', title: 't'.repeat(500), body: 'b'.repeat(70000) }])[0].title.length, 200);
  assert.equal(wantedIssues([{ kind: 'bug', title: 't', body: 'b'.repeat(70000) }])[0].body.length, 60000);
  assert.deepEqual(wantedIssues('nope'), []);
});
