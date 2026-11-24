// Journeys of issue #580: a message that could not be sent stays in the conversation, with its reason,
// « Renvoyer » and « Modifier », on phone and computer, in both chat modes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const AGENT = '<!-- factory-agent -->';
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };
const NET = 'Non envoyé. Connexion perdue, réessayez.';
const AWAY = 'Message non envoyé. Retrouvez-le dans sa conversation.';
const question = (n = 7, title = 'Comment publier ?') => issue(n, title, ['factory:question'], { body: title, comments: 1 });
const answered = (n = 7) => ({ [n]: [{ id: n * 10, body: `${AGENT}\nVoici comment.`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date().toISOString(), html_url: `https://github.com/o/r/issues/${n}#c1` }] });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const pics = (n, from = 1) => Array.from({ length: n }, (_, i) => ({ name: `image-${from + i}.png`, mimeType: 'image/png', buffer: PNG }));
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

const agentTab = (page) => page.getByRole('tab', { name: 'Agent', exact: true }).click();
const unsent = (page) => page.locator('#chat-messages .msg.unsent');
const send = async (page, text) => {
  await page.locator('#chat-input').fill(text);
  await page.locator('#chat-send').click();
};
// Fallback mode: the only open conversation opens by itself.
async function openFallback(page, url, title = 'Comment publier ?') {
  await page.goto(url);
  await agentTab(page);
  await page.locator('.conv.current', { hasText: title }).waitFor({ state: 'attached' });
  await page.locator('#chat-messages .msg.agent').first().waitFor();
}
// Instant mode: the chat server's network is cut, or it breaks down (after `wait` ms).
const cut = (page) => page.route('http://localhost:7777/chat', (r) => (r.request().method() === 'OPTIONS' ? r.fallback() : r.abort('internetdisconnected')));
const breakdown = (page, wait = 0) => page.route('http://localhost:7777/chat', async (r) => {
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
  if (wait) await new Promise((ok) => setTimeout(ok, wait));
  return r.fulfill({ status: 500, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Panne.' }) });
});
const restore = (page) => page.unroute('http://localhost:7777/chat');

async function assertUnsentShown(page, text) {
  await unsent(page).first().waitFor();
  assert.equal(await unsent(page).count(), 1);
  assert.match(await unsent(page).textContent(), new RegExp(text));
  assert.equal((await unsent(page).locator('.unsent-note').textContent()).trim(), NET);
  for (const name of ['Renvoyer', 'Modifier']) {
    const box = await unsent(page).getByRole('button', { name, exact: true }).boundingBox();
    assert.ok(box && box.height >= 44, `${name} : ${JSON.stringify(box)}`);
  }
  assert.equal(await page.locator('#chat-input').inputValue(), '');
}

test('sur téléphone, un message envoyé sans connexion reste dans la conversation avec « Non envoyé », la raison et ses deux boutons, et la zone de saisie est vide', async () => {
  const offline = new Set(['/repos/o/r/issues/7/comments']);
  await withPanel({ issues: [question()], comments: answered(), offline, viewport: PHONE }, async ({ page, url }) => {
    await openFallback(page, url);
    await send(page, 'Mon message perdu');
    await assertUnsentShown(page, 'Mon message perdu');
    assert.equal(await page.locator('#toast.show').count(), 0);
    await page.waitForTimeout(6000);
    assert.equal((await unsent(page).locator('.unsent-note').textContent()).trim(), NET);
  });
});

test('sur ordinateur, même affichage, et plus de petit message pour ce cas', async () => {
  const offline = new Set(['/repos/o/r/issues/7/comments']);
  await withPanel({ issues: [question()], comments: answered(), offline, viewport: DESK }, async ({ page, url }) => {
    await openFallback(page, url);
    await send(page, 'Mon message perdu');
    await assertUnsentShown(page, 'Mon message perdu');
    for (let i = 0; i < 5; i++) {
      assert.equal(await page.locator('#toast.show').count(), 0);
      await page.waitForTimeout(200);
    }
  });
});

test('en réponse instantanée, un message auquel l\'agent n\'a pas pu répondre garde sa place avec « L\'agent n\'a pas pu répondre » et la raison', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', delay: 0 }, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await breakdown(page);
    await send(page, 'Première question');
    await unsent(page).first().waitFor();
    assert.equal((await unsent(page).locator('.unsent-note').textContent()).trim(), 'L\'agent n\'a pas pu répondre. Panne.');
    await restore(page);
    await cut(page);
    await send(page, 'Deuxième question');
    await page.waitForFunction(() => document.querySelectorAll('#chat-messages .msg.unsent').length === 2);
    assert.equal((await unsent(page).nth(1).locator('.unsent-note').textContent()).trim(), NET);
    assert.equal(await page.locator('#toast.show').count(), 0);
  });
});

test('l\'échec et sa raison sont annoncés aux lecteurs d\'écran', async () => {
  const offline = new Set(['/repos/o/r/issues/7/comments']);
  await withPanel({ issues: [question()], comments: answered(), offline, viewport: DESK }, async ({ page, url }) => {
    await openFallback(page, url);
    await send(page, 'Mon message perdu');
    await unsent(page).first().waitFor();
    await page.waitForFunction((t) => document.getElementById('chat-announce').textContent === t, NET);
    assert.equal(await unsent(page).locator('.unsent-note').getAttribute('role'), null);
  });
});

test('plusieurs messages non envoyés restent en bas, dans l\'ordre où je les ai écrits, chacun avec ses boutons', async () => {
  const offline = new Set(['/repos/o/r/issues/7/comments']);
  await withPanel({ issues: [question()], comments: answered(), offline, viewport: DESK }, async ({ page, url }) => {
    await openFallback(page, url);
    await send(page, 'Premier');
    await unsent(page).first().waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    await send(page, 'Second');
    await page.waitForFunction(() => document.querySelectorAll('#chat-messages .msg.unsent').length === 2);
    const texts = await unsent(page).locator('.bubble').allTextContents();
    assert.deepEqual(texts.map((t) => t.trim()), ['Premier', 'Second']);
    const last = await page.evaluate(() => [...document.querySelectorAll('#chat-messages > li')].slice(-2).every((li) => li.classList.contains('unsent')));
    assert.ok(last, 'les messages non envoyés ne sont pas tout en bas');
    assert.equal(await unsent(page).getByRole('button', { name: 'Renvoyer', exact: true }).count(), 2);
    assert.equal(await unsent(page).getByRole('button', { name: 'Modifier', exact: true }).count(), 2);
  });
});

test('le premier message d\'une nouvelle conversation qui ne part pas reste dans cette conversation, absente de la liste', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', delay: 0 }, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await cut(page);
    await send(page, 'Ma toute première question');
    await unsent(page).first().waitFor();
    assert.equal((await page.locator('#chat-title').textContent()).trim(), 'Nouvelle conversation');
    assert.equal(await unsent(page).count(), 1);
    assert.equal(await page.locator('.chat-intro').count(), 0);
    assert.equal(await page.locator('.conv').count(), 0);
  });
});

test('un message non envoyé est toujours là quand je reviens d\'une autre conversation, et a disparu après un rechargement', async () => {
  const offline = new Set(['/repos/o/r/issues/7/comments']);
  const issues = [question(7, 'Comment publier ?'), question(8, 'Autre sujet')];
  await withPanel({ issues, comments: { ...answered(7), ...answered(8) }, offline, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await page.locator('.conv', { hasText: 'Comment publier ?' }).click();
    await page.locator('#chat-title', { hasText: 'Comment publier ?' }).waitFor();
    await page.locator('#chat-messages .msg.agent').first().waitFor();
    await send(page, 'Mon message perdu');
    await unsent(page).first().waitFor();
    await page.locator('.conv', { hasText: 'Autre sujet' }).click();
    await page.locator('#chat-title', { hasText: 'Autre sujet' }).waitFor();
    await page.locator('#chat-messages .msg.agent').first().waitFor();
    assert.equal(await unsent(page).count(), 0);
    await page.locator('.conv', { hasText: 'Comment publier ?' }).click();
    await page.locator('#chat-title', { hasText: 'Comment publier ?' }).waitFor();
    await unsent(page).first().waitFor();
    assert.match(await unsent(page).textContent(), /Mon message perdu/);
    await page.reload();
    await agentTab(page);
    await page.locator('.conv', { hasText: 'Comment publier ?' }).click();
    await page.locator('#chat-messages .msg.agent').first().waitFor();
    await page.waitForTimeout(500);
    assert.equal(await unsent(page).count(), 0);
  });
});

test('en changeant de projet, les messages non envoyés sont oubliés', async () => {
  const offline = new Set(['/repos/o/r/issues/7/comments']);
  const pick = (page, name) => page.locator('#projects .project-item', { hasText: name }).click();
  await withPanel({ repos: ['o/r', 'o/alpha'], issues: [question()], comments: answered(), offline, viewport: DESK }, async ({ page, url }) => {
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
    await openFallback(page, url);
    await send(page, 'Mon message perdu');
    await unsent(page).first().waitFor();
    await pick(page, 'alpha');
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'alpha');
    await pick(page, 'r');
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'r');
    await agentTab(page);
    await page.locator('#chat-messages .msg.agent').first().waitFor();
    await page.waitForTimeout(500);
    assert.equal(await unsent(page).count(), 0);
  });
});

test('une réponse reçue mais non enregistrée garde sa note, sans bouton « Renvoyer »', async () => {
  const failing = new Set(['/repos/o/r/contents/index.json']);
  await withPanel({ chatServer: { answer: 'Voici la réponse.', delay: 0 }, failing, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await send(page, 'Une question');
    await page.locator('#chat-messages').getByText('Cette réponse n\'a pas pu être enregistrée.').waitFor();
    await page.getByText('Réponse reçue, mais conversation non enregistrée. Ne renvoyez pas votre message.').waitFor();
    assert.equal(await unsent(page).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Renvoyer', exact: true }).count(), 0);
  });
});

test('un message non envoyé avant l\'arrivée de mes conversations reste à l\'écran quand elles arrivent', async () => {
  const offline = new Set(['/repos/o/r/issues']);
  await withPanel({ issues: [question()], comments: answered(), offline, slowReads: [[/labels=factory/, 2500]], viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await send(page, 'Envoyé trop tôt');
    await unsent(page).first().waitFor();
    await page.waitForTimeout(3500);
    assert.equal(await unsent(page).count(), 1);
    assert.equal((await page.locator('#chat-title').textContent()).trim(), 'Nouvelle conversation');
  });
});

test('si l\'envoi échoue pendant que je suis sur « Suivi », un petit message me le dit et le message m\'attend dans sa conversation', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', delay: 0 }, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await breakdown(page, 1500);
    await send(page, 'Envoyé avant de partir');
    await page.getByRole('tab', { name: 'Suivi' }).click();
    await page.locator('#toast.show', { hasText: AWAY }).waitFor({ timeout: 5000 });
    await agentTab(page);
    await unsent(page).first().waitFor();
    assert.equal(await unsent(page).count(), 1);
  });
});
