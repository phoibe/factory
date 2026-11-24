// Journeys of issue #580: the small messages of the « Agent » tab show over the open conversation, above the composer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const AGENT = '<!-- factory-agent -->';
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };
const question = issue(7, 'Comment publier ?', ['factory:question'], { body: 'Comment publier ?', comments: 1 });
const thread = { 7: [{ id: 1, body: `${AGENT}\nVoici comment.`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date().toISOString(), html_url: 'https://github.com/o/r/issues/7#c1' }] };
// A one-pixel PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const pics = (n) => Array.from({ length: n }, (_, i) => ({ name: `image-${i + 1}.png`, mimeType: 'image/png', buffer: PNG }));

async function openConversation(page, url) {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Agent', exact: true }).click();
  await page.locator('.conv.current', { hasText: 'Comment publier ?' }).waitFor({ state: 'attached' });
  await page.locator('#chat-messages .msg.agent').first().waitFor();
}

// The toast lets clicks through (`pointer-events: none`): switched on for the measure, to know what is on top.
const toastState = (page) => page.evaluate(() => {
  const t = document.getElementById('toast'), r = t.getBoundingClientRect();
  t.style.pointerEvents = 'auto';
  const onTop = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === t;
  t.style.pointerEvents = '';
  const strip = document.getElementById('chat-pending');
  const composerTop = (strip.hidden ? document.getElementById('chat-form') : strip).getBoundingClientRect().top;
  return { shown: t.classList.contains('show'), text: t.textContent, onTop, top: r.top, bottom: r.bottom, composerTop };
});
const shownToast = (page) => page.locator('#toast.show').waitFor().then(() => page.waitForTimeout(300)).then(() => toastState(page));

test('sur téléphone, joindre 5 images affiche « 4 images au plus par message » par-dessus la conversation, au-dessus de la zone de saisie, puis il disparaît', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: PHONE }, async ({ page, url }) => {
    await openConversation(page, url);
    await page.locator('#chat-file').setInputFiles(pics(5));
    const t = await shownToast(page);
    assert.equal(t.text, '4 images au plus par message.');
    assert.ok(t.shown && t.onTop, `petit message caché : ${JSON.stringify(t)}`);
    assert.ok(t.bottom <= t.composerTop, `petit message sur la saisie : ${JSON.stringify(t)}`);
    assert.ok(t.top >= 0);
    assert.equal(await page.locator('.pending-image').count(), 4);
    await page.waitForFunction(() => !document.querySelector('#toast.show'), null, { timeout: 6000 });
  });
});

test('sur téléphone, « Terminer » affiche « Conversation rangée dans « Terminées » »', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: PHONE }, async ({ page, url }) => {
    await openConversation(page, url);
    await page.locator('#chat-close').click();
    const t = await shownToast(page);
    assert.equal(t.text, 'Conversation rangée dans « Terminées »');
    assert.ok(t.shown && t.onTop, `petit message caché : ${JSON.stringify(t)}`);
  });
});

test('sur téléphone, une demande créée depuis la conversation affiche son petit message par-dessus la conversation restée ouverte', async () => {
  await withPanel({ viewport: PHONE, chatServer: { answer: 'Voici.', issues: [{ kind: 'feature', title: 'Un export', body: 'x' }] } }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('#chat-new').click();
    await page.locator('#chat-input').fill('Créez une feature pour exporter');
    await page.locator('#chat-send').click();
    const card = page.locator('.proposal', { hasText: 'Un export' });
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await page.locator('#toast.show', { hasText: 'Demande créée, conversation rangée dans « Terminées »' }).waitFor();
    const t = await toastState(page);
    assert.ok(t.onTop, `petit message caché : ${JSON.stringify(t)}`);
    assert.ok(t.bottom <= t.composerTop, `petit message sur la saisie : ${JSON.stringify(t)}`);
  });
});

test('le petit message ne recouvre jamais ce que j\'écris, même sur plusieurs lignes', async () => {
  for (const viewport of [PHONE, DESK]) {
    await withPanel({ issues: [question], comments: thread, viewport }, async ({ page, url }) => {
      await openConversation(page, url);
      await page.locator('#chat-file').setInputFiles(pics(5));
      await page.locator('#toast.show').waitFor();
      await page.locator('#chat-input').fill(Array.from({ length: 12 }, (_, i) => `Ligne ${i + 1}`).join('\n'));
      await page.waitForTimeout(300);
      const t = await toastState(page);
      assert.ok(t.shown, `${viewport.width} px : petit message parti trop tôt`);
      assert.ok(t.bottom <= t.composerTop, `${viewport.width} px : petit message sur la saisie : ${JSON.stringify(t)}`);
    });
  }
});

test('sur ordinateur, les petits messages s\'affichent comme avant', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: DESK }, async ({ page, url }) => {
    await openConversation(page, url);
    await page.locator('#chat-file').setInputFiles(pics(5));
    const t = await shownToast(page);
    assert.ok(t.shown && t.onTop, `petit message caché : ${JSON.stringify(t)}`);
    assert.ok(t.bottom <= t.composerTop, `petit message sur la saisie : ${JSON.stringify(t)}`);
    // Elsewhere, the toast keeps its place 24 px from the bottom.
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.check('#autoPick');
    await page.fill('#maxQuestions', '11');
    await page.dispatchEvent('#maxQuestions', 'change');
    await page.locator('#toast.show', { hasText: 'Entre 1 et 10.' }).waitFor();
    await page.waitForTimeout(300);
    const s = await toastState(page);
    assert.equal(Math.round(s.bottom), DESK.height - 24);
  });
});

test('tant que la carte du jeton de lecture s\'affiche, le petit message reste dans la fenêtre, sur téléphone et sur ordinateur', async () => {
  for (const viewport of [PHONE, DESK]) {
    await withPanel({ chatServer: { answer: 'Bonjour.' }, readToken: false, viewport }, async ({ page, url }) => {
      await page.goto(url);
      await page.getByRole('tab', { name: 'Agent', exact: true }).click();
      await page.locator('#chat-setup:not([hidden])').waitFor();
      await page.locator('#chat-file').setInputFiles(pics(5));
      const t = await shownToast(page);
      assert.equal(t.text, '4 images au plus par message.');
      assert.ok(t.top >= 0 && t.bottom <= viewport.height, `${viewport.width} px : petit message hors de la fenêtre : ${JSON.stringify(t)}`);
      assert.ok(t.onTop, `${viewport.width} px : petit message caché : ${JSON.stringify(t)}`);
    });
  }
});
