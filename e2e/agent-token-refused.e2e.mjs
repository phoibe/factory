// Journeys of issue #592: in instant mode, a full token GitHub refuses (401) while the « Agent » tab reads the
// conversations or their images sends the owner back to the login page at once, as every other read does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

const REFUSED = 'GitHub a refusé le jeton : il a sans doute expiré. Créez-en un nouveau et collez-le ici.';
const IMAGE = 'attachments/chat/1-abc.png';
const openAgent = (page) => page.getByRole('tab', { name: 'Agent', exact: true }).click();

// GitHub refuses the full token from now on for the reads whose URL matches `pattern`.
const refuse = (page, pattern) => page.route(pattern, (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Bad credentials' }) }));

// A conversation already saved on the `factory-chat` branch, with an image sent by the owner.
function seed(chatBranch) {
  const at = new Date(Date.now() - 60_000).toISOString();
  chatBranch.index = [{ id: 'c1', title: 'Regardez', updated: at, state: 'open' }];
  chatBranch.chats.c1 = { id: 'c1', title: 'Regardez', state: 'open', updated: at, messages: [
    { who: 'me', text: 'Regardez', images: [IMAGE], at }, { who: 'agent', text: 'Je vois.', at }] };
}

async function toasts(page) {
  const seen = [];
  await page.exposeFunction('seenToast', (text) => seen.push(text));
  await page.addInitScript(() => addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => window.seenToast(document.getElementById('toast').textContent)).observe(document.getElementById('toast'), { childList: true, characterData: true, subtree: true });
  }));
  return seen;
}

// The conversation is on screen, then GitHub refuses the token at the next 30 s check of the conversations.
async function refusedAtNextCheck(page, url) {
  await page.clock.install();
  await page.goto(url);
  await openAgent(page);
  await page.locator('#chat-messages .msg.agent', { hasText: 'Je vois.' }).waitFor();
  await refuse(page, /\/contents\/(index\.json|chats\/.+\.json)\?ref=factory-chat/);
  await page.clock.runFor(31_000);
}

test('un jeton refusé à la lecture des conversations ramène aussitôt à la connexion', async () => {
  await withPanel({ chatServer: { answer: 'Bien reçu.' }, viewport: { width: 1280, height: 800 } }, async ({ page, url, chatBranch }) => {
    seed(chatBranch);
    await page.route(`**/contents/${IMAGE}?ref=factory-attachments`, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
    const seen = await toasts(page);
    await refusedAtNextCheck(page, url);
    await page.locator('#login').waitFor({ timeout: 5000 });
    assert.equal(await page.locator('#login-error').textContent(), REFUSED);
    await page.clock.runFor(1000);
    assert.ok(!seen.some((t) => t.includes('GitHub ne répond pas')), JSON.stringify(seen));
  });
});

test('une image refusée ramène aussi à la connexion', async () => {
  await withPanel({ chatServer: { answer: 'Bien reçu.' }, viewport: { width: 1280, height: 800 } }, async ({ page, url, chatBranch }) => {
    seed(chatBranch);
    await refuse(page, `**/contents/${IMAGE}?ref=factory-attachments`);
    await page.goto(url);
    await openAgent(page);
    await page.locator('#login').waitFor({ timeout: 5000 });
    assert.equal(await page.locator('#login-error').textContent(), REFUSED);
  });
});

test('le projet ouvert est retenu pour la reconnexion', async () => {
  await withPanel({ chatServer: { answer: 'Bien reçu.' }, repos: ['o/a', 'o/r'], viewport: { width: 1280, height: 800 } }, async ({ page, url, chatBranch }) => {
    seed(chatBranch);
    await page.addInitScript(() => { if (!sessionStorage.getItem('test.project')) { sessionStorage.setItem('test.project', '1'); localStorage.setItem('factory.project', 'o/r'); } });
    await refusedAtNextCheck(page, url);
    await page.locator('#login').waitFor({ timeout: 5000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.project')), 'o/r');
  });
});
