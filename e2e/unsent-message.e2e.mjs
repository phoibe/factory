// Journeys of issue #580: a message that could not be sent stays in the conversation, with its reason,
// « Renvoyer » and « Modifier », on phone and computer, in both chat modes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const AGENT = '<!-- factory-agent -->';
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };
const NET = 'Non envoyé. Connexion perdue, réessayez.';
const DOWN = 'L\'agent n\'a pas pu répondre. L\'agent est indisponible, réessayez dans une minute.';
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

// The height under the finger: the rows of pixels around the button where a touch lands on it.
const hitHeight = (button) => button.evaluate((b) => {
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect(), x = r.left + r.width / 2;
  let n = 0;
  for (let y = Math.floor(r.top) - 12; y <= r.bottom + 12; y++) if (b.contains(document.elementFromPoint(x, y))) n++;
  return n;
});

async function assertUnsentShown(page, text) {
  await unsent(page).first().waitFor();
  assert.equal(await unsent(page).count(), 1);
  assert.match(await unsent(page).textContent(), new RegExp(text));
  assert.equal((await unsent(page).locator('.unsent-note').textContent()).trim(), NET);
  for (const name of ['Renvoyer', 'Modifier']) {
    const button = unsent(page).getByRole('button', { name: new RegExp(`^${name} `) });
    const box = await button.boundingBox();
    assert.ok(box && Math.round(box.height) === 32, `${name} visible : ${JSON.stringify(box)}`);
    assert.ok(await hitHeight(button) >= 44, `${name} sous le doigt : ${await hitHeight(button)}`);
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
    assert.equal((await unsent(page).locator('.unsent-note').textContent()).trim(), DOWN);
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
    // Each button names its message for screen readers.
    for (const text of ['Premier', 'Second']) {
      assert.equal(await unsent(page).getByRole('button', { name: `Renvoyer « ${text} »`, exact: true }).count(), 1);
      assert.equal(await unsent(page).getByRole('button', { name: `Modifier « ${text} »`, exact: true }).count(), 1);
    }
    assert.equal(await unsent(page).getByRole('button', { name: 'Renvoyer', exact: true }).count(), 0);
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

// « Renvoyer » and « Modifier » (task 4).
const resendButton = (page, i = 0) => unsent(page).nth(i).getByRole('button', { name: /^Renvoyer / });
const editButton = (page, i = 0) => unsent(page).nth(i).getByRole('button', { name: /^Modifier / });
const imagePuts = (writes) => writes.filter((w) => w.method === 'PUT' && w.path.startsWith('/repos/o/r/contents/attachments/chat/'));

test('« Renvoyer » fait repartir le message tel quel une fois la connexion revenue, et l\'agent répond', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', delay: 800 }, viewport: PHONE }, async ({ page, url, chatCalls, writes }) => {
    await page.goto(url);
    await agentTab(page);
    await page.locator('#chat-new').click();
    await cut(page);
    await page.locator('#chat-file').setInputFiles(pics(1));
    await send(page, 'Avec une image');
    await unsent(page).first().waitFor();
    assert.equal(await unsent(page).locator('.shot').count(), 1);
    await restore(page);
    await resendButton(page).click();
    assert.equal(await unsent(page).count(), 0);
    await page.locator('#live-bubble').waitFor();
    await page.locator('#chat-messages .msg.agent', { hasText: 'Bonjour.' }).waitFor();
    assert.equal(chatCalls.length, 1);
    assert.equal(chatCalls[0].message, 'Avec une image');
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    const saved = writes.filter((w) => w.method === 'PUT' && /\/contents\/chats\//.test(w.path))
      .map((w) => Buffer.from(w.body.content, 'base64').toString());
    assert.ok(saved.some((c) => c.includes('attachments/chat/')), 'l\'image n\'est pas dans la conversation enregistrée');
    assert.equal(imagePuts(writes).length, 1, 'l\'image a été envoyée deux fois');
  });
});

test('en mode de secours aussi, « Renvoyer » envoie le message', async () => {
  const offline = new Set(['/repos/o/r/issues/7/comments']);
  await withPanel({ issues: [question()], comments: answered(), offline, viewport: DESK }, async ({ page, url, writes }) => {
    await openFallback(page, url);
    await send(page, 'Mon message perdu');
    await unsent(page).first().waitFor();
    offline.clear();
    await resendButton(page).click();
    await page.waitForFunction(() => !document.querySelector('#chat-messages .msg.unsent'));
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    const posted = writes.filter((w) => w.method === 'POST' && w.path === '/repos/o/r/issues/7/comments' && w.ok !== false);
    assert.ok(posted.some((w) => w.body.body === 'Mon message perdu'), JSON.stringify(posted));
    assert.equal(await unsent(page).count(), 0);
  });
});

test('si « Renvoyer » échoue encore, le message reprend son état avec la nouvelle raison', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', delay: 0 }, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await cut(page);
    await send(page, 'Premier');
    await unsent(page).first().waitFor();
    await send(page, 'Second');
    await page.waitForFunction(() => document.querySelectorAll('#chat-messages .msg.unsent').length === 2);
    assert.equal((await unsent(page).nth(0).locator('.unsent-note').textContent()).trim(), NET);
    await restore(page);
    await breakdown(page);
    await resendButton(page, 0).click();
    await page.locator('#chat-messages .msg.unsent .unsent-note', { hasText: 'indisponible' }).waitFor();
    assert.equal(await unsent(page).count(), 2);
    assert.equal((await unsent(page).nth(0).locator('.unsent-note').textContent()).trim(), DOWN);
    assert.match(await unsent(page).nth(0).textContent(), /Premier/);
    assert.equal((await unsent(page).nth(1).locator('.unsent-note').textContent()).trim(), NET);
  });
});

test('pendant qu\'une réponse de l\'agent est en cours, « Renvoyer » est grisé, puis redevient actif', async () => {
  const chatServer = { answer: 'Bonjour.', delay: 0 };
  await withPanel({ chatServer, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await cut(page);
    await send(page, 'Non parti');
    await unsent(page).first().waitFor();
    assert.equal(await resendButton(page).isDisabled(), false);
    await restore(page);
    chatServer.delay = 1500;
    await send(page, 'Une autre question');
    await page.locator('#live-bubble').waitFor();
    assert.equal(await resendButton(page).isDisabled(), true);
    assert.equal(await editButton(page).isDisabled(), false);
    await page.locator('#chat-messages .msg.agent', { hasText: 'Bonjour.' }).waitFor();
    await page.waitForFunction(() => !document.getElementById('live-bubble'));
    assert.equal(await resendButton(page).isDisabled(), false);
  });
});

test('le premier message d\'une nouvelle conversation, une fois renvoyé, fait apparaître la conversation dans la liste', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', delay: 0 }, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await cut(page);
    await send(page, 'Premier');
    await unsent(page).first().waitFor();
    await send(page, 'Second');
    await page.waitForFunction(() => document.querySelectorAll('#chat-messages .msg.unsent').length === 2);
    assert.equal(await page.locator('.conv').count(), 0);
    await restore(page);
    await resendButton(page, 0).click();
    await page.locator('#chat-messages .msg.agent', { hasText: 'Bonjour.' }).waitFor();
    await page.locator('.conv').first().waitFor();
    assert.equal(await page.locator('.conv').count(), 1);
    assert.equal(await unsent(page).count(), 1);
    assert.match(await unsent(page).textContent(), /Second/);
    const last = await page.evaluate(() => [...document.querySelectorAll('#chat-messages > li')].at(-1).classList.contains('unsent'));
    assert.ok(last, 'le message non envoyé n\'est pas sous la réponse');
  });
});

test('« Modifier » remet le texte et l\'image dans la zone de saisie, avec le curseur dedans, et retire le message de la conversation', async () => {
  const offline = new Set(['/repos/o/r/issues/7/comments']);
  await withPanel({ issues: [question()], comments: answered(), offline, viewport: PHONE }, async ({ page, url, writes }) => {
    await openFallback(page, url);
    await page.locator('#chat-file').setInputFiles(pics(1));
    await send(page, 'À corriger');
    await unsent(page).first().waitFor();
    assert.equal(await page.locator('.pending-image').count(), 0);
    await editButton(page).click();
    assert.equal(await page.locator('#chat-input').inputValue(), 'À corriger');
    assert.equal(await page.locator('.pending-image').count(), 1);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'chat-input');
    assert.equal(await page.evaluate(() => { const t = document.getElementById('chat-input'); return t.selectionStart === t.value.length; }), true);
    assert.equal(await unsent(page).count(), 0);
    offline.clear();
    await page.locator('#chat-send').click();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled && !document.querySelector('#chat-messages .msg.unsent'));
    const posted = writes.filter((w) => w.method === 'POST' && w.path === '/repos/o/r/issues/7/comments');
    assert.ok(posted.some((w) => String(w.body.body).startsWith('À corriger')), JSON.stringify(posted));
  });
});

test('« Modifier » garde ce que j\'ai commencé à écrire et ajoute le message repris à la suite, 4 images au plus', async () => {
  const offline = new Set(['/repos/o/r/issues/7/comments']);
  await withPanel({ issues: [question()], comments: answered(), offline, viewport: DESK }, async ({ page, url }) => {
    await openFallback(page, url);
    await page.locator('#chat-file').setInputFiles(pics(2));
    await send(page, 'Bonjour');
    await unsent(page).first().waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    await page.locator('#chat-input').fill('Autre chose');
    await page.locator('#chat-file').setInputFiles(pics(3, 3));
    await editButton(page).click();
    assert.equal(await page.locator('#chat-input').inputValue(), 'Autre chose\nBonjour');
    assert.equal(await page.locator('.pending-image').count(), 4);
    await page.locator('#toast.show', { hasText: '4 images au plus par message.' }).waitFor();
  });
});

test('un message fait seulement d\'images se nomme par ses images pour les lecteurs d\'écran', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', delay: 0 }, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await cut(page);
    await page.locator('#chat-file').setInputFiles(pics(2));
    await page.locator('#chat-send').click();
    await unsent(page).first().waitFor();
    assert.equal(await unsent(page).getByRole('button', { name: 'Renvoyer les 2 images', exact: true }).count(), 1);
    assert.equal(await unsent(page).getByRole('button', { name: 'Modifier les 2 images', exact: true }).count(), 1);
  });
});

test('au clavier, après « Renvoyer », je reste dans la zone de saisie, ou sur « Renvoyer » du même message s\'il échoue encore', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', delay: 0 }, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await cut(page);
    await send(page, 'Premier');
    await unsent(page).first().waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    await send(page, 'Second');
    await page.waitForFunction(() => document.querySelectorAll('#chat-messages .msg.unsent').length === 2);
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    // Fails again: focus on the same message's « Renvoyer ».
    await resendButton(page, 1).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#chat-messages .msg.unsent').length === 2 && !document.getElementById('chat-send').disabled);
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Renvoyer « Second »', null, { timeout: 3000 })
      .catch(async () => assert.fail(`focus : ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))}`));
    // Leaves: focus in the composer.
    await restore(page);
    await page.keyboard.press('Enter');
    await page.locator('#chat-messages .msg.agent', { hasText: 'Bonjour.' }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'chat-input');
  });
});

// Review of #580.
const touchScreen = (page) => page.addInitScript(() => {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    const m = real(q);
    if (q.includes('pointer: fine')) Object.defineProperty(m, 'matches', { value: false });
    return m;
  };
});

test('« Renvoyer » grisé se voit grisé', async () => {
  const chatServer = { answer: 'Bonjour.', delay: 0 };
  await withPanel({ chatServer, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await cut(page);
    await send(page, 'Non parti');
    await unsent(page).first().waitFor();
    const look = (b) => b.evaluate((x) => { const s = getComputedStyle(x); return { opacity: s.opacity, cursor: s.cursor }; });
    assert.deepEqual(await look(resendButton(page)), { opacity: '1', cursor: 'pointer' });
    await restore(page);
    chatServer.delay = 1500;
    await send(page, 'Une autre question');
    await page.locator('#live-bubble').waitFor();
    assert.equal(await resendButton(page).isDisabled(), true);
    assert.deepEqual(await look(resendButton(page)), { opacity: '0.6', cursor: 'default' });
  });
});

test('sur un écran tactile, « Renvoyer » ne fait pas apparaître le clavier', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', delay: 800 }, viewport: PHONE }, async ({ page, url }) => {
    await touchScreen(page);
    await page.goto(url);
    await agentTab(page);
    await page.locator('#chat-new').click();
    await cut(page);
    await send(page, 'Non parti');
    await unsent(page).first().waitFor();
    await restore(page);
    await resendButton(page).click();
    assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'chat-input');
    await page.locator('#chat-messages .msg.agent', { hasText: 'Bonjour.' }).waitFor();
    assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'chat-input');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'chat-messages');
  });
});

test('toucher la conversation ouverte pendant une réponse avec image ne fait pas passer le message pour non envoyé', async () => {
  const chatServer = { answer: 'Bonjour.', delay: 0 };
  await withPanel({ chatServer, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await send(page, 'Première question');
    await page.locator('.conv.current').waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    chatServer.delay = 1500;
    await page.locator('#chat-file').setInputFiles(pics(1));
    await send(page, 'Avec une image');
    await page.locator('#live-bubble').waitFor();
    await page.locator('.conv.current').click();
    await page.waitForFunction(() => !document.getElementById('live-bubble') && !document.getElementById('chat-send').disabled, null, { timeout: 8000 });
    await page.waitForTimeout(300);
    assert.equal(await unsent(page).count(), 0);
    assert.equal(await page.locator('#chat-messages .msg.agent', { hasText: 'Bonjour.' }).count(), 2);
  });
});

test('sur téléphone, dans la liste des conversations, le petit message est à 24 px du bas, comme dans les autres onglets', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', delay: 0 }, viewport: PHONE }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await page.locator('#chat-new').click();
    await breakdown(page, 1500);
    await send(page, 'Envoyé avant de partir');
    await page.locator('#chat-back').click();
    await page.locator('#toast.show', { hasText: AWAY }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    const gap = await page.evaluate(() => innerHeight - document.getElementById('toast').getBoundingClientRect().bottom);
    assert.equal(Math.round(gap), 24);
  });
});

test('le clavier reste sur « Modifier » quand la conversation se met à jour en arrière-plan', async () => {
  const offline = new Set(['/repos/o/r/issues/7/comments']);
  await withPanel({ issues: [question()], comments: answered(), offline, viewport: DESK }, async ({ page, url }) => {
    await openFallback(page, url);
    await send(page, 'Mon message perdu');
    await unsent(page).first().waitFor();
    await editButton(page).focus();
    await page.evaluate(() => { window.oldRow = document.querySelector('#chat-messages .msg.unsent'); });
    await page.waitForFunction(() => !window.oldRow.isConnected, null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Modifier « Mon message perdu »');
  });
});

test('un échec pendant que je relis le haut de la conversation me ramène en bas, sur le message non envoyé', async () => {
  const offline = new Set(['/repos/o/r/issues/7/comments']);
  const long = Array.from({ length: 60 }, (_, i) => `Paragraphe ${i + 1} de la réponse.`).join('\n\n');
  const comments = { 7: [{ ...answered()[7][0], body: `${AGENT}\n${long}` }] };
  await withPanel({ issues: [question()], comments, offline, writeDelay: 1500, viewport: DESK }, async ({ page, url }) => {
    await openFallback(page, url);
    await send(page, 'Mon message perdu');
    await page.waitForTimeout(200);
    await page.evaluate(() => { document.getElementById('chat-messages').scrollTop = 0; });
    await unsent(page).first().waitFor();
    await page.waitForTimeout(200);
    const gap = await page.evaluate(() => { const l = document.getElementById('chat-messages'); return l.scrollHeight - l.scrollTop - l.clientHeight; });
    assert.ok(gap < 2, `pas en bas : ${gap}`);
  });
});

test('un message non envoyé reste au-dessus de « Réfléchit… » et de la réponse en cours', async () => {
  // Instant mode: the live answer.
  const chatServer = { answer: 'Bonjour.', delay: 0 };
  await withPanel({ chatServer, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    await cut(page);
    await send(page, 'Non parti');
    await unsent(page).first().waitFor();
    await restore(page);
    chatServer.delay = 1500;
    await send(page, 'Une autre question');
    await page.locator('#live-bubble').waitFor();
    const order = await page.evaluate(() => [...document.querySelectorAll('#chat-messages > li')].map((li) => (li.classList.contains('unsent') ? 'unsent' : li.querySelector('#live-bubble') || li.id === 'live-bubble' ? 'live' : li.classList.contains('me') ? 'me' : 'other')));
    assert.ok(order.indexOf('unsent') < order.indexOf('live'), order.join(','));
  });
  // Fallback mode: « Réfléchit… ».
  const offline = new Set(['/repos/o/r/issues/7/comments']);
  await withPanel({ issues: [question()], comments: answered(), offline, writeDelay: 1500, viewport: DESK }, async ({ page, url }) => {
    await openFallback(page, url);
    await send(page, 'Non parti');
    await unsent(page).first().waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    offline.clear();
    await send(page, 'Une autre question');
    await page.locator('#chat-messages .bubble.typing').waitFor();
    const order = await page.evaluate(() => [...document.querySelectorAll('#chat-messages > li')].map((li) => (li.classList.contains('unsent') ? 'unsent' : li.querySelector('.typing') ? 'thinking' : 'other')));
    assert.ok(order.indexOf('unsent') < order.indexOf('thinking'), order.join(','));
  });
});

test('dans la liste, une conversation qui garde un message non envoyé porte « Non envoyé » en rouge, jusqu\'à ce qu\'il soit repris', async () => {
  const offline = new Set(['/repos/o/r/issues/7/comments']);
  const issues = [question(7, 'Comment publier ?'), question(8, 'Autre sujet')];
  await withPanel({ issues, comments: { ...answered(7), ...answered(8) }, offline, viewport: DESK }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page);
    const row = (t) => page.locator('.conv', { hasText: t });
    await row('Comment publier ?').click();
    await page.locator('#chat-messages .msg.agent').first().waitFor();
    assert.equal(await page.locator('.conv .conv-unsent').count(), 0);
    await send(page, 'Mon message perdu');
    await unsent(page).first().waitFor();
    await row('Autre sujet').click();
    await page.locator('#chat-title', { hasText: 'Autre sujet' }).waitFor();
    const mark = row('Comment publier ?').locator('.conv-unsent');
    assert.equal((await mark.textContent()).trim(), 'Non envoyé');
    assert.equal(await row('Autre sujet').locator('.conv-unsent').count(), 0);
    // Read in one go: the list is redrawn at each refresh.
    const [color, danger] = await page.evaluate(() => {
      const m = document.querySelector('.conv .conv-unsent');
      const probe = document.createElement('span');
      probe.style.color = 'var(--danger)';
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return [getComputedStyle(m).color, c];
    });
    assert.equal(color, danger);
    await row('Comment publier ?').click();
    await unsent(page).first().waitFor();
    await editButton(page).click();
    assert.equal(await page.locator('.conv .conv-unsent').count(), 0);
  });
});
