import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBody, chatMessages, chatStatus, titleFrom, markdown, conversations, unread, ASK } from '../panel/chat.mjs';

const AGENT = '<!-- factory-agent -->';
const FOOT = '\n\n---\n_Généré par [Claude Code](https://claude.ai/code) · software factory_';

test('cleanBody drops the agent marker, hidden comments and the factory footers', () => {
  assert.equal(cleanBody(`${AGENT}\nOui, c'est prévu.${FOOT}`), "Oui, c'est prévu.");
  assert.equal(cleanBody(`${AGENT}\nRéessaie plus tard.\n\n---\n_Message automatique de la software factory_`), 'Réessaie plus tard.');
  assert.equal(cleanBody('Bonjour\r\n<!-- note -->\r\nça va ?'), 'Bonjour\n\nça va ?');
  assert.equal(cleanBody(null), '');
});

test('chatMessages: the issue is the first message, agent messages are told apart by their marker', () => {
  const issue = { body: 'Que se passe-t-il à minuit ?', created_at: '2026-11-04T10:00:00Z', html_url: 'u0', user: { login: 'phoibe' } };
  const comments = [
    // The agent may post with the owner's own account: the marker decides, not the author.
    { body: `${AGENT}\nRien de spécial.${FOOT}`, created_at: '2026-11-04T10:02:00Z', html_url: 'u1', user: { login: 'phoibe' } },
    { body: 'Merci', created_at: '2026-11-04T10:03:00Z', html_url: 'u2', user: { login: 'phoibe' } },
    { body: 'Deployment ready', created_at: '2026-11-04T10:04:00Z', html_url: 'u3', user: { login: 'vercel[bot]', type: 'Bot' } },
    { body: `${AGENT}\n`, created_at: '2026-11-04T10:05:00Z', html_url: 'u4', user: { login: 'phoibe' } },
  ];
  assert.deepEqual(chatMessages(issue, comments), [
    { who: 'me', text: 'Que se passe-t-il à minuit ?', at: '2026-11-04T10:00:00Z', url: 'u0' },
    { who: 'agent', text: 'Rien de spécial.', at: '2026-11-04T10:02:00Z', url: 'u1' },
    { who: 'me', text: 'Merci', at: '2026-11-04T10:03:00Z', url: 'u2' },
  ]);
});

test('chatStatus: thinking while the agent runs or just after a message, late when nobody picked it up', () => {
  const now = Date.parse('2026-11-04T10:10:00Z');
  const mine = [{ who: 'me', at: '2026-11-04T10:09:00Z' }];
  const agent = [...mine, { who: 'agent', at: '2026-11-04T10:09:30Z' }];
  assert.equal(chatStatus({ state: 'open', labels: ['factory:question', 'factory:running'] }, agent, now), 'thinking');
  assert.equal(chatStatus({ state: 'open', labels: ['factory:question'] }, mine, now), 'thinking');
  assert.equal(chatStatus({ state: 'open', labels: ['factory:question'] }, [{ who: 'me', at: '2026-11-04T09:40:00Z' }], now), 'late');
  assert.equal(chatStatus({ state: 'open', labels: ['factory:question'] }, agent, now), 'idle');
  assert.equal(chatStatus({ state: 'closed', labels: ['factory:question'] }, agent, now), 'closed');
  assert.equal(chatStatus({ state: 'open', labels: [{ name: 'factory:running' }] }, agent, now), 'thinking');
});

test('titleFrom keeps the first line, short', () => {
  assert.equal(titleFrom('  Que se passe-t-il ?\nDétails'), 'Que se passe-t-il ?');
  const long = titleFrom('Est-ce que je peux cocher une habitude pour hier quand j’ai oublié de le faire le soir même ?');
  assert.ok(long.length <= 70 && long.endsWith('…'), long);
  assert.equal(titleFrom('   '), 'Discussion');
});

test('ASK holds the messages behind « En faire une feature » and « C’est un bug »', () => {
  assert.match(ASK.feature, /feature/i);
  assert.match(ASK.bug, /bug/i);
});

test('markdown: paragraphs, bold, code, safe links and lists', () => {
  assert.deepEqual(markdown('Oui, **c’est prévu**.\n\nVoir `réglages`.'), [
    { type: 'p', inline: [{ t: 'text', v: 'Oui, ' }, { t: 'b', c: [{ t: 'text', v: 'c’est prévu' }] }, { t: 'text', v: '.' }] },
    { type: 'p', inline: [{ t: 'text', v: 'Voir ' }, { t: 'code', v: 'réglages' }, { t: 'text', v: '.' }] },
  ]);
  assert.deepEqual(markdown('- un\n- *deux*\n\n1. trois'), [
    { type: 'ul', items: [[{ t: 'text', v: 'un' }], [{ t: 'i', c: [{ t: 'text', v: 'deux' }] }]] },
    { type: 'ol', items: [[{ t: 'text', v: 'trois' }]] },
  ]);
  assert.deepEqual(markdown('[issue](https://github.com/a/b/issues/3) et https://x.dev/p.'), [
    { type: 'p', inline: [{ t: 'a', href: 'https://github.com/a/b/issues/3', c: [{ t: 'text', v: 'issue' }] }, { t: 'text', v: ' et ' }, { t: 'a', href: 'https://x.dev/p', c: [{ t: 'text', v: 'https://x.dev/p' }] }, { t: 'text', v: '.' }] },
  ]);
  // A link that is not http(s) stays plain text; a heading becomes a bold paragraph; a line break is kept.
  assert.deepEqual(markdown('[x](javascript:alert(1))'), [{ type: 'p', inline: [{ t: 'text', v: '[x](javascript:alert(1))' }] }]);
  assert.deepEqual(markdown('## Titre\nligne 1\nligne 2'), [
    { type: 'p', inline: [{ t: 'b', c: [{ t: 'text', v: 'Titre' }] }] },
    { type: 'p', inline: [{ t: 'text', v: 'ligne 1' }, { t: 'br' }, { t: 'text', v: 'ligne 2' }] },
  ]);
  assert.deepEqual(markdown('> cité'), [{ type: 'quote', inline: [{ t: 'text', v: 'cité' }] }]);
  assert.deepEqual(markdown('```\nnpm test\n```'), [{ type: 'pre', v: 'npm test' }]);
});

test('conversations: open ones first, most recent first, pull requests left out', () => {
  const list = conversations([
    { number: 1, state: 'closed', updated_at: '2026-11-04T12:00:00Z' },
    { number: 2, state: 'open', updated_at: '2026-11-04T09:00:00Z' },
    { number: 3, state: 'open', updated_at: '2026-11-04T11:00:00Z' },
    { number: 4, state: 'open', updated_at: '2026-11-04T13:00:00Z', pull_request: {} },
  ]);
  assert.deepEqual(list.map((c) => c.number), [3, 2, 1]);
});

test('unread: a conversation updated since it was last opened, unless the owner wrote last', () => {
  const c = { number: 3, updated_at: '2026-11-04T11:00:00Z', comments: 2 };
  assert.equal(unread(c, {}), false); // never opened: nothing to flag (old conversations)
  assert.equal(unread(c, { 3: 1 }), true); // one more comment since then
  assert.equal(unread(c, { 3: 2 }), false);
});

test('images sent from the chat: listed apart from the text, written with a marker the relay reads', async () => {
  const { imageBlock, splitImages } = await import('../panel/chat.mjs');
  const block = imageBlock('phoibe/habitudes', 'attachments/chat/1-a.jpg');
  assert.match(block, /<!-- factory-image: attachments\/chat\/1-a\.jpg -->/);
  assert.match(block, /!\[capture\]\(https:\/\/github\.com\/phoibe\/habitudes\/blob\/factory-attachments\/attachments\/chat\/1-a\.jpg\?raw=true\)/);
  const body = `Regarde ça\n\n${block}\n${imageBlock('phoibe/habitudes', 'attachments/chat/2-b.png')}`;
  assert.deepEqual(splitImages(body), { text: 'Regarde ça', images: ['attachments/chat/1-a.jpg', 'attachments/chat/2-b.png'] });
  const issue = { body, created_at: 't', html_url: 'u', user: { login: 'phoibe' } };
  assert.deepEqual(chatMessages(issue, []), [{ who: 'me', text: 'Regarde ça', images: ['attachments/chat/1-a.jpg', 'attachments/chat/2-b.png'], at: 't', url: 'u' }]);
  // An image alone is a message too.
  assert.equal(chatMessages({ ...issue, body: block }, [])[0].text, '');
});

test('imagePath: one unique, safe path per image', async () => {
  const { imagePath } = await import('../panel/chat.mjs');
  assert.equal(imagePath('image/png', 1700000000000, 'k3x'), 'attachments/chat/1700000000000-k3x.png');
  assert.equal(imagePath('image/jpeg', 1, 'a'), 'attachments/chat/1-a.jpg');
});

test('chat server: NDJSON lines are read as they arrive, a cut line waits for the rest', async () => {
  const { ndjson } = await import('../panel/chat.mjs');
  assert.deepEqual(ndjson('{"type":"delta","text":"Bon"}\n{"type":"del'), { events: [{ type: 'delta', text: 'Bon' }], rest: '{"type":"del' });
  assert.deepEqual(ndjson('ta","text":"jour"}\n'.replace(/^/, '{"type":"del')), { events: [{ type: 'delta', text: 'jour' }], rest: '' });
  assert.deepEqual(ndjson('pas du json\n'), { events: [], rest: '' });
});

test('chat server: a stored conversation becomes bubbles, the list keeps open ones first', async () => {
  const { serverMessages, serverList } = await import('../panel/chat.mjs');
  const conv = { messages: [
    { who: 'me', text: 'Exporter ?', images: ['attachments/chat/1-a.jpg'], at: 't1' },
    { who: 'agent', text: 'Pas encore.', at: 't2', issues: [{ title: 'Export', url: 'https://github.com/a/b/issues/3', kind: 'feature' }] },
    { who: 'me', text: '', images: [], at: 't3' },
  ] };
  assert.deepEqual(serverMessages(conv), [
    { who: 'me', text: 'Exporter ?', images: ['attachments/chat/1-a.jpg'], at: 't1' },
    { who: 'agent', text: 'Pas encore.', at: 't2', issues: [{ title: 'Export', url: 'https://github.com/a/b/issues/3', kind: 'feature' }] },
  ]);
  assert.deepEqual(serverList([
    { id: 'a', state: 'closed', updated: '2026-11-04T12:00:00Z' },
    { id: 'b', state: 'open', updated: '2026-11-04T09:00:00Z' },
    { id: 'c', state: 'open', updated: '2026-11-04T11:00:00Z' },
  ]).map((c) => c.id), ['c', 'b', 'a']);
  assert.deepEqual(serverList(null), []);
});
