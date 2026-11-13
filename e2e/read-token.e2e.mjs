// Journeys of issue #395: the chat server only receives a read-only token; the full token never leaves the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

const agent = (page) => page.getByRole('tab', { name: 'Agent', exact: true }).click();
const card = (page) => page.getByRole('heading', { name: 'Un jeton de lecture pour discuter' });
const paste = async (page, value) => {
  await page.getByLabel('Jeton de lecture', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Valider le jeton' }).click();
};
const send = async (page, text) => {
  await page.locator('#chat-input').fill(text);
  await page.locator('#chat-send').click();
};

test('en ouvrant l\'onglet « Agent » sans second jeton, je vois la carte avec le bouton vers GitHub prérempli en lecture seule', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.' }, readToken: false }, async ({ page, url }) => {
    await page.goto(url);
    await agent(page);
    await card(page).waitFor();
    const href = await page.getByRole('link', { name: /Créer le jeton de lecture sur GitHub/ }).getAttribute('href');
    const u = new URL(href);
    assert.equal(u.searchParams.get('contents'), 'read');
    assert.equal(u.searchParams.get('expires_in'), '365');
    assert.equal(u.searchParams.get('issues'), null);
    assert.equal(await page.locator('#chat-input').isVisible(), false);
  });
});

test('coller mon jeton complet dans cette case est refusé avec un message clair', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.' }, readToken: false }, async ({ page, url, chatCalls }) => {
    await page.goto(url);
    await agent(page);
    await paste(page, 'test');
    await page.getByText('Ce jeton peut modifier vos projets : créez-en un en lecture seule avec le bouton ci-dessus.').waitFor();
    // Another token that can write is caught by GitHub's answer, not only by being the same.
    await paste(page, 'ecriture');
    await page.getByText('Ce jeton peut modifier vos projets').waitFor();
    await card(page).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), null);
    assert.deepEqual(chatCalls, []);
  });
});

test('avec le jeton de lecture, une conversation fonctionne, est retrouvée après rechargement, et la demande proposée par l\'agent apparaît dans le tableau', async () => {
  const issues = [{ kind: 'feature', title: 'Exporter mes données', body: 'Il veut exporter.' }];
  await withPanel({ chatServer: { answer: 'Non, pas encore.', issues }, readToken: false }, async ({ page, url, chatCalls, writes }) => {
    await page.goto(url);
    await agent(page);
    await paste(page, 'lecture');
    await page.locator('#chat-input').waitFor();
    await send(page, 'Je peux exporter ?');
    await page.locator('#chat-messages').getByRole('link', { name: /Exporter mes données/ }).waitFor();
    // The server got the read token only; the panel created the issue and saved the conversation with the full one.
    assert.deepEqual(chatCalls.map((c) => c.token), ['Bearer lecture']);
    const made = writes.find((w) => w.method === 'POST' && w.path === '/repos/o/r/issues' && w.body.title === 'Exporter mes données');
    assert.deepEqual(made.body.labels, ['factory:feature', 'factory:kept']);
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    await page.reload();
    await agent(page);
    await page.locator('.conv', { hasText: 'Je peux exporter ?' }).click();
    await page.locator('#chat-messages').getByText('Non, pas encore.').waitFor();
    await page.getByRole('tab', { name: 'Suivi' }).click();
    await page.locator('#board').getByText('Exporter mes données').first().waitFor();
  });
});

test('le QR code ouvre sur le téléphone une discussion qui marche sans rien recoller', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour du téléphone.' } }, async ({ page, url, context, chatCalls }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
    await page.goto(url);
    await page.getByRole('button', { name: 'Sur mon téléphone' }).click();
    await page.getByRole('button', { name: 'Copier le lien' }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(link, /#jeton=test&lecture=lecture$/);
    // The phone: nothing stored yet, only the link (the fixture's GitHub answers this page only, so it is reused).
    await page.evaluate(() => localStorage.clear());
    await page.goto('about:blank');
    await page.goto(link);
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), 'lecture');
    await agent(page);
    await page.locator('#chat-input').waitFor();
    assert.equal(await card(page).count(), 0);
    await send(page, 'Salut');
    await page.locator('#chat-messages').getByText('Bonjour du téléphone.').waitFor();
    assert.deepEqual(chatCalls.map((c) => c.token), ['Bearer lecture']);
  });
});

test('après « Se déconnecter », l\'onglet « Agent » redemande les deux jetons', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.' } }, async ({ page, url }) => {
    await page.goto(url);
    await agent(page);
    await page.locator('#chat-input').waitFor();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.getByRole('heading', { name: 'Connectez le panneau à GitHub' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), null);
    await page.locator('#token').fill('test');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await agent(page);
    await card(page).waitFor();
  });
});

test('si GitHub refuse le jeton de lecture (expiré), l\'onglet « Agent » le redemande et mon message reste dans la zone de saisie', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', refuse: 401 } }, async ({ page, url }) => {
    await page.goto(url);
    await agent(page);
    await send(page, 'Encore là ?');
    await card(page).waitFor();
    await page.locator('#read-token-error', { hasText: 'GitHub a refusé votre jeton de lecture' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.token')), 'test');
    assert.equal(await page.locator('#chat-input').inputValue(), 'Encore là ?');
  });
});

test('si l\'enregistrement échoue, la réponse reste affichée avec la mention, et mon message n\'est pas renvoyé', async () => {
  const failing = new Set(['/repos/o/r/contents/index.json']);
  await withPanel({ chatServer: { answer: 'Voici la réponse.' }, failing }, async ({ page, url, chatCalls }) => {
    await page.goto(url);
    await agent(page);
    await send(page, 'Une question');
    await page.locator('#chat-messages').getByText('Cette réponse n\'a pas pu être enregistrée.').waitFor();
    await page.locator('#chat-messages').getByText('Voici la réponse.').waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    assert.equal(await page.locator('#chat-input').inputValue(), '');
    assert.equal(chatCalls.length, 1);
  });
});
