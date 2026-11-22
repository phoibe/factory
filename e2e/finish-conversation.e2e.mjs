// Journeys of issue #516: a conversation ends by itself once its cards are decided and a request was created.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const AGENT = '<!-- factory-agent -->';
const first = { kind: 'feature', title: 'Exporter mes données', body: 'Il veut exporter.' };
const second = { kind: 'bug', title: 'Le bouton plante', body: 'Il plante.' };
const closedIndex = (writes) => writes.some((w) => w.method === 'PUT' && w.path === '/repos/o/r/contents/index.json'
  && JSON.parse(Buffer.from(w.body.content, 'base64').toString()).some((c) => c.state === 'closed'));
const NOTICE = 'Conversation terminée. Écrivez un message pour la reprendre.';

async function ask(page, url) {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Agent', exact: true }).click();
  await page.locator('#chat-input').fill('Créez une feature pour exporter');
  await page.locator('#chat-send').click();
}

test('quand je crée la demande de la seule carte, la conversation est terminée et rangée dans « Terminées »', async () => {
  await withPanel({ chatServer: { answer: 'Voici.', issues: [first] } }, async ({ page, url, writes }) => {
    await ask(page, url);
    const card = page.locator('.proposal', { hasText: first.title });
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    await page.getByText('Demande créée, conversation rangée dans « Terminées »').waitFor();
    await page.locator('#chat-messages').getByText(NOTICE).waitFor();
    assert.ok(closedIndex(writes));
  });
});

test('avec deux cartes, créer la première laisse la conversation ouverte ; ignorer la seconde la termine', async () => {
  await withPanel({ chatServer: { answer: 'Voici.', issues: [first, second] } }, async ({ page, url, writes }) => {
    await ask(page, url);
    const one = page.locator('.proposal', { hasText: first.title });
    await one.getByRole('button', { name: 'Créer cette demande' }).click();
    await one.getByRole('link', { name: /Voir la demande/ }).waitFor();
    await page.waitForTimeout(500);
    assert.equal(closedIndex(writes), false);
    const two = page.locator('.proposal', { hasText: second.title });
    await two.getByRole('button', { name: 'Ignorer' }).click();
    await page.locator('#chat-messages').getByText(NOTICE).waitFor();
    assert.ok(closedIndex(writes));
  });
});

test('quand j\'ignore une carte sans rien créer, la conversation reste ouverte', async () => {
  await withPanel({ chatServer: { answer: 'Voici.', issues: [first] } }, async ({ page, url, writes }) => {
    await ask(page, url);
    const card = page.locator('.proposal', { hasText: first.title });
    await card.getByRole('button', { name: 'Ignorer' }).click();
    await card.getByText('Ignorée').waitFor();
    await page.waitForTimeout(500);
    assert.equal(closedIndex(writes), false);
    assert.equal(await page.locator('#chat-messages').getByText(NOTICE).count(), 0);
  });
});

test('sans le serveur de discussion aussi, créer la demande de la dernière carte termine la conversation', async () => {
  const conv = issue(7, 'Le bouton plante', ['factory:question'], { body: 'Le bouton Enregistrer plante', comments: 1 });
  const comments = { 7: [
    { id: 71, body: `${AGENT}\nVoici.\n\n<creer-issue type="bug" titre="Enregistrer plante">\nLe bouton plante.\n</creer-issue>`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 60000).toISOString(), html_url: 'u71' },
  ] };
  await withPanel({ issues: [conv], comments }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Le bouton plante' }).click();
    const card = page.locator('.proposal', { hasText: 'Enregistrer plante' });
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await page.getByText('Demande créée, conversation rangée dans « Terminées »').waitFor();
    const close = writes.find((w) => w.method === 'PATCH' && w.path === '/repos/o/r/issues/7');
    assert.equal(close?.body.state, 'closed');
    // The conversation stays on screen: I am not sent back to the list.
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
  });
});

test('si l\'agent est encore en train de me répondre, créer la demande ne termine pas la conversation', async () => {
  const conv = issue(7, 'Le bouton plante', ['factory:question'], { body: 'Le bouton Enregistrer plante', comments: 2 });
  const comments = { 7: [
    { id: 71, body: `${AGENT}\nVoici.\n\n<creer-issue type="bug" titre="Enregistrer plante">\nLe bouton plante.\n</creer-issue>`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 60000).toISOString(), html_url: 'u71' },
    { id: 72, body: 'Et aussi, le titre est trop petit.', user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 5000).toISOString(), html_url: 'u72' },
  ] };
  await withPanel({ issues: [conv], comments }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Le bouton plante' }).click();
    const card = page.locator('.proposal', { hasText: 'Enregistrer plante' });
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    await page.waitForTimeout(500);
    assert.equal(writes.filter((w) => w.method === 'PATCH' && w.path === '/repos/o/r/issues/7').length, 0);
  });
});

test('le bouton « Terminer » range toujours la conversation à la main', async () => {
  await withPanel({ chatServer: { answer: 'Voici.', issues: [] } }, async ({ page, url, writes }) => {
    await ask(page, url);
    await page.locator('#chat-messages').getByText('Voici.').waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    await page.locator('#chat-close').click();
    await page.getByText('Conversation rangée dans « Terminées »').waitFor();
    assert.ok(closedIndex(writes));
  });
});

// Issue #521: the card shows before the agent ends its turn; a click then creates the request, and the conversation
// ends as soon as the agent is done.
test('si je crée la demande pendant que l\'agent finit son tour, la conversation se termine dès qu\'il a fini', async () => {
  const conv = issue(7, 'Le bouton plante', ['factory:question', 'factory:running'], { body: 'Le bouton Enregistrer plante', comments: 1 });
  const comments = { 7: [
    { id: 71, body: `${AGENT}\nVoici.\n\n<creer-issue type="bug" titre="Enregistrer plante">\nLe bouton plante.\n</creer-issue>`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 5000).toISOString(), html_url: 'u71' },
  ] };
  await withPanel({ issues: [conv], comments }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Le bouton plante' }).click();
    const card = page.locator('.proposal', { hasText: 'Enregistrer plante' });
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    await page.waitForTimeout(500);
    const closes = () => writes.filter((w) => w.method === 'PATCH' && w.path === '/repos/o/r/issues/7');
    assert.equal(closes().length, 0); // the agent is still on it
    conv.labels = conv.labels.filter((l) => l.name !== 'factory:running'); // its turn ends
    await page.getByText('Demande créée, conversation rangée dans « Terminées »').waitFor({ timeout: 15000 });
    assert.equal(closes()[0]?.body.state, 'closed');
    conv.state = 'closed'; // as GitHub keeps it (the test server does not apply the panel's writes)
    await page.locator('#chat-messages').getByText(NOTICE).waitFor(); // the end stays said once the toast is gone
  });
});

test('si je réécris à l\'agent pendant qu\'il finit son tour, la conversation reste ouverte', async () => {
  const conv = issue(7, 'Le bouton plante', ['factory:question', 'factory:running'], { body: 'Le bouton Enregistrer plante', comments: 1 });
  const comments = { 7: [
    { id: 71, body: `${AGENT}\nVoici.\n\n<creer-issue type="bug" titre="Enregistrer plante">\nLe bouton plante.\n</creer-issue>`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 5000).toISOString(), html_url: 'u71' },
  ] };
  await withPanel({ issues: [conv], comments }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Le bouton plante' }).click();
    const card = page.locator('.proposal', { hasText: 'Enregistrer plante' });
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    await page.locator('#chat-input').fill('Et aussi, le titre est trop petit.');
    await page.locator('#chat-send').click();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    // GitHub lists my message, the agent answers it, and its turn ends.
    comments[7].push({ id: 73, body: 'Et aussi, le titre est trop petit.', user: { login: 'o' }, author_association: 'OWNER', created_at: new Date().toISOString(), html_url: 'u73' });
    comments[7].push({ id: 74, body: `${AGENT}\nJe regarde.`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() + 1000).toISOString(), html_url: 'u74' });
    conv.comments = comments[7].length;
    conv.labels = conv.labels.filter((l) => l.name !== 'factory:running');
    await page.locator('#chat-messages').getByText('Je regarde.').waitFor({ timeout: 15000 });
    await page.waitForTimeout(1000);
    assert.equal(writes.filter((w) => w.method === 'PATCH' && w.path === '/repos/o/r/issues/7').length, 0);
  });
});

test('une conversation dont les cartes étaient déjà décidées ne se termine pas toute seule à l\'ouverture', async () => {
  const conv = issue(7, 'Le bouton plante', ['factory:question'], { body: 'Le bouton Enregistrer plante', comments: 2 });
  const comments = { 7: [
    { id: 71, body: `${AGENT}\nVoici.\n\n<creer-issue type="bug" titre="Enregistrer plante">\nLe bouton plante.\n</creer-issue>`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 60000).toISOString(), html_url: 'u71' },
    { id: 72, body: `${AGENT}\n<!-- factory-proposal: 71-0 created https://github.com/o/r/issues/9 -->`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 30000).toISOString(), html_url: 'u72' },
  ] };
  await withPanel({ issues: [conv], comments }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Le bouton plante' }).click();
    await page.locator('.proposal', { hasText: 'Enregistrer plante' }).getByRole('link', { name: /Voir la demande/ }).waitFor();
    await page.waitForTimeout(1000);
    assert.equal(writes.filter((w) => w.method === 'PATCH' && w.path === '/repos/o/r/issues/7').length, 0);
  });
});

test('si la fin du tour de l\'agent apporte une nouvelle carte, la conversation reste ouverte', async () => {
  const conv = issue(7, 'Le bouton plante', ['factory:question', 'factory:running'], { body: 'Le bouton Enregistrer plante', comments: 1 });
  const comments = { 7: [
    { id: 71, body: `${AGENT}\nVoici.\n\n<creer-issue type="bug" titre="Enregistrer plante">\nLe bouton plante.\n</creer-issue>`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 5000).toISOString(), html_url: 'u71' },
  ] };
  await withPanel({ issues: [conv], comments }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Le bouton plante' }).click();
    const card = page.locator('.proposal', { hasText: 'Enregistrer plante' });
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    comments[7].push({ id: 73, body: `${AGENT}\nAutre chose.\n\n<creer-issue type="feature" titre="Exporter les données">\nIl veut exporter.\n</creer-issue>`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date().toISOString(), html_url: 'u73' });
    conv.comments = 2;
    conv.labels = conv.labels.filter((l) => l.name !== 'factory:running');
    await page.locator('.proposal', { hasText: 'Exporter les données' }).getByRole('button', { name: 'Créer cette demande' }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(1000);
    assert.equal(writes.filter((w) => w.method === 'PATCH' && w.path === '/repos/o/r/issues/7').length, 0);
  });
});

test('avec le serveur de discussion, une demande créée pendant que l\'agent répond termine la conversation dès sa réponse', async () => {
  const chatServer = { answer: 'Voici.', issues: [first] };
  await withPanel({ chatServer }, async ({ page, url, writes }) => {
    await ask(page, url);
    const card = page.locator('.proposal', { hasText: first.title });
    await card.getByRole('button', { name: 'Créer cette demande' }).waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    Object.assign(chatServer, { delay: 2500, issues: [], answer: 'Autre réponse.' });
    await page.locator('#chat-input').fill('Et aussi autre chose');
    await page.locator('#chat-send').click();
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    assert.equal(closedIndex(writes), false); // the agent is still answering
    await page.getByText('Demande créée, conversation rangée dans « Terminées »').waitFor({ timeout: 10000 });
    await page.locator('#chat-messages').getByText(NOTICE).waitFor();
    assert.ok(closedIndex(writes));
  });
});

test('si l\'agent n\'arrive pas à répondre, la conversation reste ouverte avec mon message à renvoyer', async () => {
  const chatServer = { answer: 'Voici.', issues: [first] };
  await withPanel({ chatServer }, async ({ page, url, writes }) => {
    await ask(page, url);
    const card = page.locator('.proposal', { hasText: first.title });
    await card.getByRole('button', { name: 'Créer cette demande' }).waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    // The agent fails after a while, once the card has been clicked.
    await page.route('http://localhost:7777/chat', async (route) => {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      await new Promise((r) => setTimeout(r, 2500));
      return route.fulfill({ status: 500, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Panne.' }) });
    });
    await page.locator('#chat-input').fill('Et aussi autre chose');
    await page.locator('#chat-send').click();
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    await page.getByText(/L'agent n'a pas pu répondre/).waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    assert.equal(closedIndex(writes), false);
    assert.equal(await page.locator('#chat-input').inputValue(), 'Et aussi autre chose');
  });
});

test('si la réponse arrive mais n\'a pas pu être enregistrée, la conversation reste ouverte avec son avertissement', async () => {
  const chatServer = { answer: 'Voici.', issues: [first] };
  const failing = new Set();
  await withPanel({ chatServer, failing }, async ({ page, url, writes }) => {
    await ask(page, url);
    const card = page.locator('.proposal', { hasText: first.title });
    await card.getByRole('button', { name: 'Créer cette demande' }).waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    Object.assign(chatServer, { delay: 3000, issues: [], answer: 'Autre réponse.' });
    await page.locator('#chat-input').fill('Et aussi autre chose');
    await page.locator('#chat-send').click();
    const before = writes.length;
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    const saved = writes.slice(before).find((w) => w.method === 'PUT' && /chats\//.test(w.path));
    failing.add(saved.path); // the answer cannot be saved any more
    await page.getByText('Réponse reçue, mais conversation non enregistrée. Ne renvoyez pas votre message.').waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    assert.equal(closedIndex(writes), false);
    assert.equal(await page.locator('#chat-messages').getByText(NOTICE).count(), 0);
  });
});

// Issue #535: the end that waits for the agent's turn happens wherever the owner is once that turn is over.
const turnConv = () => issue(7, 'Le bouton plante', ['factory:question', 'factory:running'], { body: 'Le bouton Enregistrer plante', comments: 1 });
const turnThread = () => [
  { id: 71, body: `${AGENT}\nVoici.\n\n<creer-issue type="bug" titre="Enregistrer plante">\nLe bouton plante.\n</creer-issue>`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 5000).toISOString(), html_url: 'u71' },
];
// GitHub lists my choice, and the agent's turn ends.
function endTurn(conv, thread) {
  thread.push({ id: 72, body: `${AGENT}\n<!-- factory-proposal: 71-0 created https://github.com/o/r/issues/9 -->`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date().toISOString(), html_url: 'u72' });
  conv.comments = thread.length;
  conv.labels = conv.labels.filter((l) => l.name !== 'factory:running');
}

test('si je passe à une autre conversation juste après avoir créé la demande, la première se range quand l\'agent a fini', async () => {
  const conv = turnConv();
  const other = issue(8, 'Une autre question', ['factory:question'], { body: 'Autre chose' });
  const comments = { 7: turnThread(), 8: [] };
  await withPanel({ issues: [conv, other], comments }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Le bouton plante' }).click();
    const card = page.locator('.proposal', { hasText: 'Enregistrer plante' });
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    await page.locator('.conv', { hasText: 'Une autre question' }).click();
    endTurn(conv, comments[7]);
    await page.getByText('Demande créée, « Le bouton plante » rangée dans « Terminées »').waitFor({ timeout: 15000 });
    const closes = () => writes.filter((w) => w.method === 'PATCH' && w.path === '/repos/o/r/issues/7');
    for (let i = 0; i < 60 && !closes().length; i++) await page.waitForTimeout(250);
    assert.equal(closes()[0]?.body.state, 'closed');
  });
});

test('si je recharge la page juste après avoir créé la demande, la conversation se range quand l\'agent a fini', async () => {
  const conv = turnConv();
  const comments = { 7: turnThread() };
  await withPanel({ issues: [conv], comments }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Le bouton plante' }).click();
    const card = page.locator('.proposal', { hasText: 'Enregistrer plante' });
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    await page.reload();
    endTurn(conv, comments[7]);
    const closes = () => writes.filter((w) => w.method === 'PATCH' && w.path === '/repos/o/r/issues/7');
    for (let i = 0; i < 60 && !closes().length; i++) await page.waitForTimeout(250);
    assert.equal(closes()[0]?.body.state, 'closed');
  });
});

test('si je passe à une autre conversation pendant que la demande se crée, la première se range quand même', async () => {
  const conv = issue(7, 'Le bouton plante', ['factory:question'], { body: 'Le bouton Enregistrer plante', comments: 1 });
  const other = issue(8, 'Une autre question', ['factory:question'], { body: 'Autre chose' });
  const comments = { 7: turnThread(), 8: [] };
  await withPanel({ issues: [conv, other], comments, writeDelay: 1500 }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Le bouton plante' }).click();
    await page.locator('.proposal', { hasText: 'Enregistrer plante' }).getByRole('button', { name: 'Créer cette demande' }).click();
    await page.locator('.conv', { hasText: 'Une autre question' }).click();
    // GitHub lists my choice once it is saved.
    for (let i = 0; i < 40 && !writes.some((w) => w.method === 'POST' && w.path === '/repos/o/r/issues/7/comments'); i++) await page.waitForTimeout(250);
    endTurn(conv, comments[7]);
    await page.getByText('Demande créée, « Le bouton plante » rangée dans « Terminées »').waitFor({ timeout: 15000 });
    assert.equal(writes.find((w) => w.method === 'PATCH' && w.path === '/repos/o/r/issues/7')?.body.state, 'closed');
  });
});

test('avec le serveur de discussion, si je change de projet pendant que l\'agent répond, la conversation se range à mon retour', async () => {
  const chatServer = { answer: 'Voici.', issues: [first] };
  await withPanel({ chatServer, repos: ['o/r', 'o/s'] }, async ({ page, url, writes }) => {
    await ask(page, url);
    const card = page.locator('.proposal', { hasText: first.title });
    await card.getByRole('button', { name: 'Créer cette demande' }).waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    Object.assign(chatServer, { delay: 2500, issues: [], answer: 'Autre réponse.' });
    await page.locator('#chat-input').fill('Et aussi autre chose');
    await page.locator('#chat-send').click();
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    const saves = () => writes.filter((w) => w.method === 'PUT' && w.path === '/repos/o/r/contents/chats/c1.json').length;
    const before = saves();
    await page.locator('#projects .project-item[data-repo="o/s"]').click();
    // The answer is saved on its project while I am on the other one.
    for (let i = 0; i < 40 && saves() === before; i++) await page.waitForTimeout(250);
    assert.ok(saves() > before);
    assert.equal(closedIndex(writes), false);
    await page.locator('#projects .project-item[data-repo="o/r"]').click();
    for (let i = 0; i < 60 && !closedIndex(writes); i++) await page.waitForTimeout(250);
    assert.ok(closedIndex(writes));
  });
});
