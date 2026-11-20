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
